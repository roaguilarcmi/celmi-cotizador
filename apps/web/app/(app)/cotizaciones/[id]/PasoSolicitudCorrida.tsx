'use client';

import {
  CATEGORIAS_PRODUCTO,
  ESQUEMAS_SOLICITUD,
  formatearMXN,
  lineasSolicitud,
  normalizarSku,
  PLAZOS_SOLICITUD,
  sugerirCategoria,
  textoCorreoSolicitud,
  textoPlazos,
  type EsquemaSolicitud,
  type PresentacionSolicitud,
} from '@celmi/core';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, Pill, Tarjeta } from '@/components/ui';
import type { CatalogosCotizacion, RevisionDetalle } from '@/lib/datos';
import {
  categoriaInicial,
  esquemasPosibles,
  formatoDe,
  FORMATOS,
  propuestasSolicitud,
} from '@/lib/solicitud-corrida';
import type { DatosPasoSolicitud } from '@/lib/solicitud-corrida-datos';

/**
 * Paso «Solicitud de corrida» (2026-10-23, mockups aprobados): con lo autorizado se llena el formato del mayorista
 * del arrendamiento (CT, Ingram o CELMI) y se copia el texto del correo para pedir la corrida financiera.
 */

const FECHA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-pill border px-3.5 text-[13px] font-semibold transition-colors ${
        activo
          ? 'border-acento bg-acento text-sobre-acento'
          : 'border-borde bg-superficie text-texto-suave hover:text-texto'
      }`}
    >
      {activo && <Icon name="palomita" size={14} strokeWidth={3} />}
      {children}
    </button>
  );
}

const Titulo = ({ children }: { children: ReactNode }) => (
  <p className="mb-2 text-[12px] font-bold tracking-wide text-texto-suave uppercase">{children}</p>
);

/** Nombre del archivo que manda el servidor (Content-Disposition, con acentos). */
function nombreDe(r: Response, porOmision: string) {
  const d = r.headers.get('content-disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(d)?.[1];
  if (utf8) return decodeURIComponent(utf8);
  return /filename="([^"]+)"/i.exec(d)?.[1] ?? porOmision;
}

export function PasoSolicitudCorrida({
  revision,
  cotizacionId,
  catalogos,
  datos,
  puedeGenerar,
  onSiguiente,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  catalogos: CatalogosCotizacion;
  datos: DatosPasoSolicitud;
  /** Lleva costos: sólo con costos.ver. */
  puedeGenerar: boolean;
  onSiguiente: () => void;
}) {
  const router = useRouter();
  const formato = formatoDe(revision, catalogos.mayoristas);
  const mayorista = catalogos.mayoristas.find((m) => m.id === revision.mayorista_arrendamiento_id);
  const posibles = esquemasPosibles(revision.esquema);
  const credito = revision.esquema === 'credito_simple';
  const principales = useMemo(() => revision.propuestas.filter((p) => !p.es_adicional), [revision]);

  const [plazos, setPlazos] = useState<number[]>([36]);
  const [esquemas, setEsquemas] = useState<EsquemaSolicitud[]>(posibles);
  const [presentacion, setPresentacion] = useState<PresentacionSolicitud>('cliente');
  const [pestana, setPestana] = useState(principales[0]?.id ?? '');
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error' | 'trabajando'; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<'asunto' | 'cuerpo' | null>(null);

  const propuestas = useMemo(
    () => propuestasSolicitud(revision, datos.tiposCambio),
    [revision, datos.tiposCambio],
  );
  const solicitudes = useMemo(
    () =>
      propuestas
        ? Object.fromEntries(principales.map((p) => [p.id, lineasSolicitud(propuestas, p.id, presentacion)]))
        : {},
    [propuestas, principales, presentacion],
  );
  const partidaDe = useMemo(
    () => new Map(revision.propuestas.flatMap((p) => p.partidas).map((pa) => [pa.id, pa])),
    [revision],
  );
  const categoria = (partidaId: string) => {
    const pa = partidaDe.get(partidaId);
    return elegidas[partidaId] ?? (pa ? categoriaInicial(pa, datos.categorias) : '');
  };
  const pideCategoria = formato !== 'ct';
  const todasLasLineas = Object.values(solicitudes).flatMap((s) => s.lineas);
  const faltantes = pideCategoria ? todasLasLineas.filter((l) => !categoria(l.partidaId)) : [];

  if (!propuestas)
    return (
      <Tarjeta className="p-6">
        <p className="text-sm text-texto-suave">
          Esta revisión aún no tiene todos sus precios autorizados (o falta el tipo de cambio). La solicitud
          de corrida se genera con lo autorizado.
        </p>
      </Tarjeta>
    );

  const actual = solicitudes[pestana];
  const alternar = <T,>(lista: T[], v: T, max = Infinity) =>
    lista.includes(v)
      ? lista.length > 1
        ? lista.filter((x) => x !== v)
        : lista
      : lista.length < max
        ? [...lista, v]
        : lista;

  const correo = textoCorreoSolicitud({
    empresa: datos.empresa,
    credito,
    plazos,
    esquemas,
    propuestas: principales.map((p) => ({
      nombre: p.nombre,
      subtotal: solicitudes[p.id]?.totales.subtotal ?? 0n,
    })),
    ejecutivo: datos.ejecutivo,
  });
  const copiar = async (que: 'asunto' | 'cuerpo') => {
    try {
      await navigator.clipboard.writeText(que === 'asunto' ? correo.asunto : correo.cuerpo);
      setCopiado(que);
      window.setTimeout(() => setCopiado(null), 2500);
    } catch {
      setEstado({
        tipo: 'error',
        texto: 'El navegador no permitió copiar. Selecciona el texto y cópialo con Ctrl + C.',
      });
    }
  };

  const descargar = async () => {
    setEstado({ tipo: 'trabajando', texto: 'Generando…' });
    try {
      for (const p of principales) {
        const s = solicitudes[p.id];
        const r = await fetch(`/cotizaciones/${cotizacionId}/solicitud-corrida`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            revision: revision.id,
            propuesta: p.id,
            plazos,
            esquemas,
            presentacion,
            categorias: Object.fromEntries(
              (s?.lineas ?? []).map((l) => [l.partidaId, categoria(l.partidaId)]),
            ),
          }),
        });
        if (!r.ok) throw new Error((await r.text()) || 'No se pudo generar el archivo');
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreDe(r, 'Solicitud de corrida.xlsx');
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      setEstado({
        tipo: 'ok',
        texto:
          principales.length > 1
            ? `Se descargaron ${principales.length} archivos. Adjúntalos al correo.`
            : 'Archivo descargado. Adjúntalo al correo.',
      });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo generar el archivo' });
    }
  };

  return (
    <Tarjeta className="overflow-hidden">
      <div className="grid gap-5 p-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h2 className="text-[19px] font-bold">Solicitud de corrida financiera</h2>
              <p className="text-[13px] text-texto-suave">
                Se llena con lo autorizado. Descárgala y envíala por correo al mayorista del arrendamiento.
              </p>
            </div>
            <span className="flex items-center gap-2 rounded-md border border-borde px-3 py-2 text-[13px]">
              <Icon name="catalogos" size={16} />
              <span>
                <b>{mayorista?.nombre ?? (credito ? 'Crédito simple' : 'Sin mayorista')}</b> ·{' '}
                {FORMATOS[formato].detalle}
              </span>
            </span>
          </div>

          <div className="grid gap-4 rounded-lg border border-borde p-4 sm:grid-cols-2">
            <div>
              <Titulo>Plazos a cotizar</Titulo>
              <div className="flex flex-wrap gap-2">
                {PLAZOS_SOLICITUD.map((p) => (
                  <Chip key={p} activo={plazos.includes(p)} onClick={() => setPlazos((x) => alternar(x, p))}>
                    {p} meses
                  </Chip>
                ))}
              </div>
              {formato === 'ct' && (
                <p className="mt-1.5 text-[12px] text-texto-suave">
                  CT admite un plazo por formato: se genera una hoja por plazo ({plazos.length}{' '}
                  {plazos.length === 1 ? 'hoja' : 'hojas'}).
                </p>
              )}
            </div>
            <div>
              <Titulo>Esquemas</Titulo>
              {credito ? (
                <Pill tono="info" punto={false}>
                  Crédito simple
                </Pill>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {posibles.map((e) => (
                    <Chip
                      key={e}
                      activo={esquemas.includes(e)}
                      onClick={() => setEsquemas((x) => alternar(x, e, 2))}
                    >
                      {ESQUEMAS_SOLICITUD[e].nombre}
                    </Chip>
                  ))}
                </div>
              )}
              {formato === 'ct' && !credito && (
                <p className="mt-1.5 text-[12px] text-texto-suave">En CT van como «Opción 1» y «Opción 2».</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Titulo>¿Cómo presentar las partidas?</Titulo>
              <div
                role="radiogroup"
                className="inline-flex flex-wrap rounded-md border border-borde bg-superficie-2 p-0.5"
              >
                {(
                  [
                    ['cliente', 'Como las ve el cliente'],
                    ['desglosada', 'Desglosadas (cada adicional y cargo en su línea)'],
                  ] as const
                ).map(([v, t]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={presentacion === v}
                    onClick={() => setPresentacion(v)}
                    className={`inline-flex min-h-10 cursor-pointer items-center rounded-[5px] px-3.5 text-[13px] font-semibold ${
                      presentacion === v
                        ? 'bg-superficie text-texto sombra'
                        : 'text-texto-suave hover:text-texto'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {principales.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist">
              {principales.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={pestana === p.id}
                  onClick={() => setPestana(p.id)}
                  className={`min-h-10 cursor-pointer rounded-pill px-3.5 text-[12.5px] font-semibold ${
                    pestana === p.id
                      ? 'bg-acento text-sobre-acento'
                      : 'bg-superficie-2 text-texto-suave hover:text-texto'
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
              <span className="ml-auto text-[12px] text-texto-suave">
                Un archivo por propuesta · incluye los adicionales que se suman
              </span>
            </div>
          )}

          <div className="mt-3 overflow-x-auto rounded-lg border border-borde">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-superficie-2 text-left text-[11px] tracking-wide text-texto-suave uppercase">
                  <th className="px-3 py-2 font-bold">No. de parte</th>
                  <th className="px-2 py-2 font-bold">Descripción</th>
                  <th className="px-2 py-2 text-center font-bold">Cant.</th>
                  {pideCategoria && <th className="px-2 py-2 font-bold">Categoría</th>}
                  <th className="px-2 py-2 text-right font-bold">Costo unit.</th>
                  <th className="px-3 py-2 text-right font-bold">Precio unit.</th>
                </tr>
              </thead>
              <tbody>
                {(actual?.lineas ?? []).map((l) => {
                  const pa = partidaDe.get(l.partidaId);
                  const c = categoria(l.partidaId);
                  const sku = normalizarSku(pa?.sku ?? '');
                  const sugerida =
                    !(l.partidaId in elegidas) &&
                    !(sku && datos.categorias[sku]) &&
                    c &&
                    c === sugerirCategoria(pa?.descripcion ?? '');
                  return (
                    <tr key={l.partidaId} className="border-t border-borde align-top">
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{pa?.sku || '—'}</td>
                      <td className="max-w-[340px] px-2 py-2">
                        <span className="line-clamp-2">{pa?.descripcion}</span>
                        {l.incluidas.length > 0 && (
                          <span className="mt-0.5 block text-[11.5px] text-texto-suave">
                            Incluye {l.incluidas.length}{' '}
                            {l.incluidas.length === 1 ? 'adicional' : 'adicionales'}
                          </span>
                        )}
                      </td>
                      <td className="tabular px-2 py-2 text-center">{l.cantidad}</td>
                      {pideCategoria && (
                        <td className="px-2 py-2">
                          <label className="sr-only" htmlFor={`cat-${l.partidaId}`}>
                            Categoría de {pa?.sku || 'la partida'}
                          </label>
                          <select
                            id={`cat-${l.partidaId}`}
                            value={c}
                            onChange={(e) => setElegidas((x) => ({ ...x, [l.partidaId]: e.target.value }))}
                            className={`min-h-9 w-[160px] rounded-md border px-2 text-[12.5px] ${
                              c
                                ? 'border-borde bg-superficie'
                                : 'border-peligro/50 bg-peligro-suave text-peligro'
                            }`}
                          >
                            <option value="">Elige categoría</option>
                            {CATEGORIAS_PRODUCTO.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                          {sugerida && (
                            <span className="mt-0.5 block text-[10.5px] text-texto-suave">
                              sugerida por la descripción
                            </span>
                          )}
                        </td>
                      )}
                      <td className="tabular px-2 py-2 text-right">{formatearMXN(l.costoUnitario)}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">
                        {formatearMXN(l.precioUnitario)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {actual && (
                <tfoot>
                  <tr className="border-t-2 border-borde bg-superficie-2 font-bold">
                    <td colSpan={pideCategoria ? 4 : 3} className="px-3 py-2 text-right">
                      Subtotal sin IVA
                    </td>
                    <td className="tabular px-2 py-2 text-right">{formatearMXN(actual.costo)}</td>
                    <td className="tabular px-3 py-2 text-right">{formatearMXN(actual.totales.subtotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-2 text-[12px] text-texto-suave">
            Costos en pesos
            {Object.keys(datos.tiposCambio).length > 0 &&
              ` (T.C. autorizado: ${Object.entries(datos.tiposCambio)
                .map(([m, v]) => `${m} ${v}`)
                .join(', ')})`}
            . Precios iguales a los de la cotización.
            {actual && actual.diferencia !== 0n && (
              <>
                {' '}
                Desglosadas, suman{' '}
                {formatearMXN(actual.diferencia < 0n ? -actual.diferencia : actual.diferencia)}{' '}
                {actual.diferencia < 0n ? 'menos' : 'más'} que la cotización por el redondeo de los cargos
                prorrateados.
              </>
            )}
          </p>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-lg border border-borde p-4">
            <Titulo>Se llenará con</Titulo>
            <dl className="grid gap-1.5 text-[13px]">
              {[
                ['Usuario final', datos.empresa],
                ...(formato === 'ct' ? [['Cliente CT', 'PAC0751']] : []),
                ['Moneda', 'Moneda nacional'],
                [formato === 'ct' ? 'Hojas' : 'Plazos', textoPlazos(plazos)],
                ['Archivos', String(principales.length)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-texto-suave">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {faltantes.length > 0 && (
            <div className="rounded-lg border border-aviso/40 bg-aviso-suave p-3 text-[12.5px] text-aviso">
              <b>{faltantes.length === 1 ? 'Falta 1 categoría' : `Faltan ${faltantes.length} categorías`}</b>{' '}
              ({faltantes.map((l) => partidaDe.get(l.partidaId)?.sku || 'sin número de parte').join(', ')}).
              Elígelas para habilitar la descarga.
            </div>
          )}
          {!puedeGenerar && (
            <p className="rounded-lg bg-superficie-2 p-3 text-[12.5px] text-texto-suave">
              La solicitud lleva costos: sólo la genera quien puede verlos.
            </p>
          )}
          <Boton
            variante="primario"
            icono="abajo"
            disabled={!puedeGenerar || faltantes.length > 0 || estado?.tipo === 'trabajando'}
            onClick={() => void descargar()}
          >
            {estado?.tipo === 'trabajando'
              ? 'Generando…'
              : principales.length > 1
                ? `Descargar ${principales.length} archivos para ${FORMATOS[formato].nombre}`
                : `Descargar Excel para ${FORMATOS[formato].nombre}`}
          </Boton>
          {estado && estado.tipo !== 'trabajando' && (
            <p
              role="status"
              className={`rounded-md px-3 py-2 text-[12.5px] ${estado.tipo === 'ok' ? 'bg-exito-suave text-exito' : 'bg-peligro-suave text-peligro'}`}
            >
              {estado.texto}
            </p>
          )}

          <details className="group rounded-lg border border-borde">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[13px] font-semibold">
              <Icon name="mensaje" size={16} />
              Texto del correo
              <Icon name="abajo" size={14} className="ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-borde p-3">
              <p className="text-[12px] text-texto-suave">Asunto</p>
              <p className="mb-2 text-[13px] font-semibold">{correo.asunto}</p>
              <pre className="max-h-64 overflow-auto rounded-md bg-superficie-2 p-3 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap">
                {correo.cuerpo}
              </pre>
              <div className="mt-2 flex flex-wrap gap-2">
                <Boton
                  tamano="chico"
                  icono={copiado === 'asunto' ? 'palomita' : 'copiar'}
                  onClick={() => void copiar('asunto')}
                >
                  {copiado === 'asunto' ? 'Asunto copiado' : 'Copiar asunto'}
                </Boton>
                <Boton
                  tamano="chico"
                  icono={copiado === 'cuerpo' ? 'palomita' : 'copiar'}
                  onClick={() => void copiar('cuerpo')}
                >
                  {copiado === 'cuerpo' ? 'Mensaje copiado' : 'Copiar mensaje'}
                </Boton>
              </div>
              <p className="mt-2 text-[11.5px] text-texto-suave">
                Pégalo en Outlook y adjunta el Excel. El cotizador no envía correos (no hay servidor de correo
                autorizado).
              </p>
            </div>
          </details>

          {datos.solicitudes.length > 0 && (
            <div className="rounded-lg border border-borde p-4">
              <Titulo>Solicitudes generadas</Titulo>
              <ul className="grid gap-2 text-[12.5px]">
                {datos.solicitudes.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{FECHA.format(new Date(s.generada_en))}</span>
                    <span className="text-texto-suave">
                      {s.autor?.nombre ?? '—'} · {FORMATOS[s.formato].nombre} · {textoPlazos(s.plazos)}
                      {principales.length > 1 &&
                        ` · ${principales.find((p) => p.id === s.propuesta_id)?.nombre ?? 'Propuesta'}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-texto-suave">
            Cuando llegue la corrida, cárgala en <b>Financiamiento</b> (botón «Cargar PDF de la financiera»).
          </p>
          <Boton variante="paso" iconoFinal="derecha" onClick={onSiguiente}>
            Siguiente: Financiamiento
          </Boton>
        </aside>
      </div>
    </Tarjeta>
  );
}
