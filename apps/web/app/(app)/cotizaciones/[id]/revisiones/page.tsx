import {
  centavosADecimal,
  compararPartidas,
  etiquetaRevision,
  formatearMXN,
  variacion,
  type FilaComparacion,
  type PartidaComparable,
} from '@celmi/core';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EnConstruccion } from '@/components/EnConstruccion';
import { Icon } from '@/components/Icon';
import { Boton, clasesBoton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import { decimal, presentacionAutorizada } from '@/lib/corrida';
import { listarUtilidades, obtenerCotizacion, obtenerRevision, type RevisionDetalle } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';
import { ESTADOS } from '../../estados';
import { Cambio, FilaCambio, Vacio } from './FilaCambio';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historial y comparación' };

const fecha = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});
const MOTIVOS = {
  inicial: 'Original',
  solicitud_cliente: 'Solicitud del cliente',
  mejora_precio: 'Mejora de precio',
} as const;

const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/**
 * Historial de revisiones y comparación Rev contra Rev (Fase 3D). Las partidas se empatan por su origen (cada copia
 * recuerda de qué partida viene), así que se ve qué cambió, qué es nuevo y qué se quitó.
 */
export default async function PaginaRevisiones({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="cotizaciones" />;
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const q = await searchParams;
  const datos = await obtenerCotizacion(id);
  if (!datos) notFound();
  const { cotizacion } = datos;
  const revisiones = cotizacion.revisiones; // De la más reciente a la original.
  const numeros = revisiones.map((r) => r.numero);
  const leer = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);
  const ultima = numeros[0] ?? 0;
  let b = leer(q.b) ?? ultima;
  let a = leer(q.a) ?? numeros.find((n) => n < b) ?? b;
  if (!numeros.includes(a)) a = numeros.find((n) => n < b) ?? b;
  if (!numeros.includes(b)) b = ultima;
  if (a > b) [a, b] = [b, a];
  const soloCambios = q.todas !== '1';
  const veUtilidad = sesion.permisos.has('utilidad.ver') || sesion.permisos.has('utilidad.autorizar');

  // Se cargan A, B y las de en medio: hacen falta para seguir la cadena de orígenes.
  const enRango = revisiones.filter((r) => r.numero >= a && r.numero <= b);
  const detalles = (await Promise.all(enRango.map((r) => obtenerRevision(r.id)))).filter(
    (r): r is RevisionDetalle => r !== null,
  );
  const revA = detalles.find((r) => r.numero === a);
  const revB = detalles.find((r) => r.numero === b);

  const origenPartida = new Map<string, string | null>();
  const origenPropuesta = new Map<string, string | null>();
  for (const r of detalles)
    for (const p of r.propuestas) {
      origenPropuesta.set(p.id, p.propuesta_origen_id);
      for (const pa of p.partidas) origenPartida.set(pa.id, pa.partida_origen_id);
    }

  const [utilA, utilB] =
    veUtilidad && revA && revB
      ? await Promise.all([
          listarUtilidades(revA.propuestas.flatMap((p) => p.partidas.map((pa) => pa.id))),
          listarUtilidades(revB.propuestas.flatMap((p) => p.partidas.map((pa) => pa.id))),
        ])
      : [null, null];

  const comparables = (r: RevisionDetalle, util: Record<string, string> | null): PartidaComparable[] =>
    r.propuestas.flatMap((p) =>
      p.partidas.map((pa) => ({
        id: pa.id,
        origenId: pa.partida_origen_id,
        propuestaId: p.id,
        sku: pa.sku,
        descripcion: pa.descripcion,
        cantidad: pa.cantidad,
        moneda: pa.costo?.moneda ?? 'MXN',
        costoUnitario: pa.costo ? decimal(pa.costo.costo_unitario, 2) : null,
        precioUnitario: pa.precio ? decimal(pa.precio.precio_unitario, 2) : null,
        ...(util ? { utilidadPct: util[pa.id] ?? null } : {}),
      })),
    );

  const comparacion =
    revA && revB && a !== b
      ? compararPartidas(
          comparables(revA, utilA),
          comparables(revB, utilB),
          (x) => origenPartida.get(x) ?? null,
        )
      : [];

  // Propuesta de B que desciende de cada propuesta de A (para agrupar las eliminadas y comparar totales).
  const propuestaEnB = new Map<string, string>();
  for (const p of revB?.propuestas ?? []) {
    let o = p.propuesta_origen_id;
    for (let i = 0; o && i < 100; i++) {
      if (revA?.propuestas.some((x) => x.id === o)) {
        propuestaEnB.set(o, p.id);
        break;
      }
      o = origenPropuesta.get(o) ?? null;
    }
  }
  const totalesA = revA ? presentacionAutorizada(revA) : null;
  const totalesB = revB ? presentacionAutorizada(revB) : null;
  const totalDe = (lista: typeof totalesA, propuestaId: string) =>
    lista?.find((x) => x.id === propuestaId)?.totales.total;

  const cuenta = (t: FilaComparacion['tipo']) => comparacion.filter((f) => f.tipo === t).length;
  const enlace = (extra: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ a, b, todas: soloCambios ? undefined : '1', ...extra }))
      if (v !== undefined) u.set(k, String(v));
    return `/cotizaciones/${id}/revisiones?${u.toString()}`;
  };

  const grupos = (revB?.propuestas ?? []).map((p) => {
    const origenA = [...propuestaEnB].find(([, bId]) => bId === p.id)?.[0];
    const filas = comparacion.filter(
      (f) =>
        f.despues?.propuestaId === p.id ||
        (f.tipo === 'eliminada' && f.antes && propuestaEnB.get(f.antes.propuestaId) === p.id),
    );
    return { id: p.id, nombre: p.nombre, origenA, filas };
  });
  const huerfanas = comparacion.filter(
    (f) => f.tipo === 'eliminada' && f.antes && !propuestaEnB.has(f.antes.propuestaId),
  );

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <nav aria-label="Ruta" className="mb-2.5 flex flex-wrap gap-2 text-[13px] text-texto-suave">
        <Link href="/cotizaciones" className="hover:text-texto">
          Cotizaciones
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/cotizaciones/${id}`} className="hover:text-texto">
          {cotizacion.oportunidad?.cliente?.razon_social} · {cotizacion.oportunidad?.nombre}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-texto">Historial y comparación</span>
      </nav>
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] leading-tight font-bold tracking-tight">
          Historial y comparación
        </h1>
        <Link href={`/cotizaciones/${id}`} className={clasesBoton('secundario', 'chico')}>
          <Icon name="izquierda" size={16} />
          Volver a la cotización
        </Link>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        {/* Historial */}
        <Tarjeta className="overflow-hidden">
          <div className="border-b border-borde px-5 py-3.5">
            <Titulo2>Revisiones</Titulo2>
          </div>
          <ol className="relative px-5 py-4">
            {revisiones.map((r, i) => (
              <li key={r.id} className="relative pb-5 pl-6 last:pb-0">
                {i < revisiones.length - 1 && (
                  <span aria-hidden="true" className="absolute top-3 bottom-0 left-[5px] w-px bg-borde" />
                )}
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 left-0 size-[11px] rounded-full border-2 ${
                    i === 0 ? 'border-acento bg-acento' : 'border-borde bg-superficie'
                  }`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/cotizaciones/${id}?rev=${r.numero}`} className="font-bold hover:underline">
                    {etiquetaRevision(r.numero)}
                  </Link>
                  <Pill tono={ESTADOS[r.estado].tono}>{ESTADOS[r.estado].texto}</Pill>
                  {i === 0 && <span className="text-xs font-semibold text-acento-texto">Vigente</span>}
                </div>
                <p className="mt-0.5 text-[13px] text-texto-suave">{MOTIVOS[r.motivo]}</p>
                <p className="mt-1 text-xs text-texto-suave">
                  Creada {r.autor ? `por ${r.autor.nombre} ` : ''}el {fecha.format(new Date(r.creado_en))}
                </p>
                {r.autorizada_en && (
                  <p className="text-xs text-exito">
                    Autorizada {r.autorizador ? `por ${r.autorizador.nombre} ` : ''}el{' '}
                    {fecha.format(new Date(r.autorizada_en))}
                  </p>
                )}
                {r.estado === 'rechazada' && r.comentario_autorizacion && (
                  <p className="text-xs text-peligro">Rechazada: «{r.comentario_autorizacion}»</p>
                )}
                {r.numero > 0 && (
                  <Link
                    href={`/cotizaciones/${id}/revisiones?a=${numeros.find((n) => n < r.numero) ?? 0}&b=${r.numero}`}
                    className="mt-1 inline-block text-xs font-semibold text-acento-texto hover:underline"
                  >
                    Comparar con la anterior
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Tarjeta>

        {/* Comparación */}
        <Tarjeta className="min-w-0 overflow-hidden">
          <form
            method="get"
            className="flex flex-wrap items-end gap-3 border-b border-borde px-5 py-3.5"
            action={`/cotizaciones/${id}/revisiones`}
          >
            <Titulo2>Comparar</Titulo2>
            <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
              Antes
              <select
                name="a"
                defaultValue={a}
                className="h-10 rounded-md border border-borde bg-superficie px-3 text-sm text-texto"
              >
                {revisiones.map((r) => (
                  <option key={r.id} value={r.numero}>
                    {etiquetaRevision(r.numero)}
                  </option>
                ))}
              </select>
            </label>
            <Icon name="derecha" size={18} className="mb-3 text-texto-suave" />
            <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
              Después
              <select
                name="b"
                defaultValue={b}
                className="h-10 rounded-md border border-borde bg-superficie px-3 text-sm text-texto"
              >
                {revisiones.map((r) => (
                  <option key={r.id} value={r.numero}>
                    {etiquetaRevision(r.numero)}
                  </option>
                ))}
              </select>
            </label>
            {!soloCambios && <input type="hidden" name="todas" value="1" />}
            <Boton type="submit" tamano="chico" variante="primario">
              Comparar
            </Boton>
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              {a !== b && (
                <>
                  <Pill tono="aviso">{cuenta('modificada')} modificadas</Pill>
                  <Pill tono="exito">{cuenta('nueva')} nuevas</Pill>
                  <Pill tono="peligro">{cuenta('eliminada')} eliminadas</Pill>
                  <Link
                    href={enlace({ todas: soloCambios ? '1' : undefined })}
                    className={clasesBoton('fantasma', 'chico')}
                  >
                    {soloCambios ? `Mostrar también ${cuenta('igual')} sin cambios` : 'Sólo cambios'}
                  </Link>
                </>
              )}
            </div>
          </form>

          {revisiones.length < 2 ? (
            <Vacio>
              Aún no hay revisiones. Cuando la cotización esté autorizada, crea una con «Nueva revisión» en el
              encabezado de la cotización.
            </Vacio>
          ) : a === b ? (
            <Vacio>Elige dos revisiones distintas.</Vacio>
          ) : comparacion.every((f) => f.tipo === 'igual') ? (
            <Vacio>
              {etiquetaRevision(a)} y {etiquetaRevision(b)} tienen las mismas partidas, cantidades, costos y
              precios.
            </Vacio>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="bg-superficie-2 text-left text-xs font-semibold text-texto-suave">
                    <th className="border-b border-borde px-4 py-2.5">Cambio</th>
                    <th className="border-b border-borde px-3 py-2.5">Partida</th>
                    <th className="border-b border-borde px-3 py-2.5 text-center">Cantidad</th>
                    <th className="border-b border-borde px-3 py-2.5 text-right">Costo unitario</th>
                    <th className="border-b border-borde px-3 py-2.5 text-right">Precio unitario</th>
                    {veUtilidad && (
                      <th className="border-b border-borde px-4 py-2.5 text-center">Utilidad</th>
                    )}
                  </tr>
                </thead>
                {grupos.map((g) => {
                  const filas = g.filas.filter((f) => !soloCambios || f.tipo !== 'igual');
                  const tA = g.origenA ? totalDe(totalesA, g.origenA) : undefined;
                  const tB = totalDe(totalesB, g.id);
                  if (!filas.length && tA === tB) return null;
                  return (
                    <tbody key={g.id}>
                      <tr>
                        <td
                          colSpan={veUtilidad ? 6 : 5}
                          className="border-b border-borde bg-acento-suave/60 px-4 py-2 text-[13px]"
                        >
                          <span className="font-bold text-acento-texto">{g.nombre}</span>
                          {!g.origenA && (
                            <span className="ml-2 font-semibold text-exito">· Propuesta nueva</span>
                          )}
                          {(tA !== undefined || tB !== undefined) && (
                            <span className="ml-3 text-texto-suave">
                              Total con IVA:{' '}
                              <Cambio
                                antes={tA !== undefined ? formatearMXN(tA) : '—'}
                                despues={tB !== undefined ? formatearMXN(tB) : '—'}
                                variacionPct={
                                  tA !== undefined && tB !== undefined
                                    ? variacion(centavosADecimal(tA), centavosADecimal(tB))
                                    : null
                                }
                              />
                            </span>
                          )}
                        </td>
                      </tr>
                      {filas.map((f, i) => (
                        <FilaCambio key={f.despues?.id ?? f.antes?.id ?? i} f={f} veUtilidad={veUtilidad} />
                      ))}
                    </tbody>
                  );
                })}
                {huerfanas.length > 0 && (
                  <tbody>
                    <tr>
                      <td
                        colSpan={veUtilidad ? 6 : 5}
                        className="border-b border-borde bg-peligro-suave px-4 py-2 font-bold text-peligro"
                      >
                        Propuestas que ya no están en {etiquetaRevision(b)}
                      </td>
                    </tr>
                    {huerfanas.map((f, i) => (
                      <FilaCambio key={f.antes?.id ?? i} f={f} veUtilidad={veUtilidad} />
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          )}
          <p className="border-t border-borde px-5 py-2.5 text-xs text-texto-suave">
            Los totales se comparan cuando ambas revisiones tienen precios autorizados. Precios sin IVA.
          </p>
        </Tarjeta>
      </div>
    </div>
  );
}
