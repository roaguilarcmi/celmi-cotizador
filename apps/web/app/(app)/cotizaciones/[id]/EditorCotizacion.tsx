'use client';

import { etiquetaRevision } from '@celmi/core';
import Link from 'next/link';
import { useEffect, useState, useTransition, type ClipboardEvent, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { PasosWizard } from '@/components/PasosWizard';
import { Pill, Tarjeta } from '@/components/ui';
import type {
  CondicionCatalogo,
  CondicionRevision,
  CotizacionFila,
  Esquema,
  FinanciamientoFila,
  RevisionDetalle,
} from '@/lib/datos';
import { guardarPartidas } from '../acciones';
import { ESTADOS } from '../estados';
import {
  aPayload,
  claveNueva,
  desdeRevision,
  resumenPropuesta,
  type Catalogos,
  type PropuestaEditable,
} from './modelo';
import { EliminarCotizacion } from './EliminarCotizacion';
import { CorridaAutorizacion } from './CorridaAutorizacion';
import { PasoAutorizacion } from './PasoAutorizacion';
import { PasoCondiciones } from './PasoCondiciones';
import { PasoFinanciamiento } from './PasoFinanciamiento';
import { VentanaPartida } from './FormularioPartida';
import { PegarExcel } from './PegarExcel';
import { TablaPartidas } from './TablaPartidas';

/**
 * Pasos del wizard propios de la cotización (decisiones 2026-10-05): 1 Partidas y costos · 2 Condiciones ·
 * 3 Autorización · 4 Financiamiento. (0 es la oportunidad; 5 y 6, vista previa y emisión, llegan en la Fase 4.)
 */
export type Paso = 1 | 2 | 3 | 4;

export function EditorCotizacion({
  cotizacion,
  revision,
  catalogos,
  puedeEditar,
  pasoInicial,
  puedeEliminar,
  catalogoCondiciones,
  condiciones,
  esquemasFinanciamiento,
  financiamiento,
  tipoOportunidad,
  autorizacion,
}: {
  cotizacion: CotizacionFila;
  revision: RevisionDetalle;
  catalogos: Catalogos;
  puedeEditar: boolean;
  pasoInicial: Paso;
  /** Sin precios autorizados todavía: se puede eliminar (2026-10-05). */
  puedeEliminar: boolean;
  catalogoCondiciones: CondicionCatalogo[];
  condiciones: CondicionRevision[];
  esquemasFinanciamiento: Esquema[];
  financiamiento: FinanciamientoFila[];
  tipoOportunidad: 'adquisicion' | 'arrendamiento';
  /** Sólo para quien ve la utilidad: la corrida de precios (Fase 3C). */
  autorizacion: { utilidades: Record<string, string>; puedeAutorizar: boolean } | null;
}) {
  const editable = puedeEditar && (revision.estado === 'borrador' || revision.estado === 'rechazada');
  const [propuestas, setPropuestas] = useState(() => desdeRevision(revision));
  const [base, setBase] = useState(() => JSON.stringify(aPayload(desdeRevision(revision))));
  // Cuando el servidor trae la revisión actualizada (tras guardar), se adopta sin remontar la pantalla.
  const [previa, setPrevia] = useState(revision);
  if (revision !== previa) {
    setPrevia(revision);
    const nuevas = desdeRevision(revision);
    setPropuestas(nuevas);
    setBase(JSON.stringify(aPayload(nuevas)));
  }
  const [activa, setActiva] = useState(() => propuestas[0]?.clave ?? '');
  const [paso, setPaso] = useState<Paso>(pasoInicial);
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pegado, setPegado] = useState<{ texto: string; html: string } | null>(null);
  /** Lo abierto en la ventana: una partida o cargo (clave o nuevo), o un adicional de una partida. */
  const [abierta, setAbierta] = useState<
    | { tipo: 'partida' | 'cargo'; clave: string | null }
    | { tipo: 'adicional'; padre: string; clave: string | null }
    | null
  >(null);
  const [guardando, iniciar] = useTransition();

  // Quien autoriza ve la corrida en cuanto la revisión se envía (y después, en sólo lectura).
  const verCorrida =
    autorizacion !== null && ['pendiente_autorizacion', 'autorizada', 'emitida'].includes(revision.estado);
  const sucio = editable && JSON.stringify(aPayload(propuestas)) !== base;
  const propuesta = propuestas.find((p) => p.clave === activa) ?? propuestas[0];

  const guardar = (despues?: () => void) =>
    iniciar(async () => {
      const r = await guardarPartidas(revision.id, cotizacion.id, aPayload(propuestas));
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? 'Guardado.' });
      if (!r.error) despues?.();
    });

  // Ctrl + S guarda; salir con cambios pendientes pide confirmación del navegador.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && sucio) {
        e.preventDefault();
        guardar();
      }
    };
    const salir = (e: BeforeUnloadEvent) => {
      if (sucio) e.preventDefault();
    };
    window.addEventListener('keydown', tecla);
    window.addEventListener('beforeunload', salir);
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener('beforeunload', salir);
    };
  });

  const irA = (nuevo: Paso) => {
    // Al salir de Partidas con cambios, primero se guardan.
    if (sucio && nuevo > 1) guardar(() => setPaso(nuevo));
    else setPaso(nuevo);
  };

  const actualizarPropuesta = (clave: string, cambio: Partial<PropuestaEditable>) =>
    setPropuestas((ps) => ps.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)));

  const agregarPropuesta = (esAdicional: boolean) => {
    const principales = propuestas.filter((p) => !p.es_adicional).length;
    const nueva: PropuestaEditable = {
      clave: claveNueva('propuesta'),
      nombre: esAdicional ? 'Adicionales' : `Propuesta ${principales + 1}`,
      tipo: esAdicional ? 'Accesorio' : '',
      es_adicional: esAdicional,
      partidas: [],
    };
    setPropuestas((ps) => [...ps, nueva]);
    setActiva(nueva.clave);
  };

  /**
   * Pegar varias celdas directamente sobre la tabla abre la vista previa con lo pegado. Se toma también la versión
   * HTML, que trae el formato de las celdas (negritas, cursivas…).
   */
  const alPegar = (e: ClipboardEvent) => {
    if (!editable) return;
    const texto = e.clipboardData.getData('text/plain');
    if (texto.includes('\t') && /\n./.test(texto.trim())) {
      e.preventDefault();
      setPegado({ texto, html: e.clipboardData.getData('text/html') });
    }
  };

  const lineas = propuesta?.partidas.filter((f) => f.presentacion !== 'prorrateada') ?? [];
  const padreAbierto =
    abierta?.tipo === 'adicional' ? propuesta?.partidas.find((f) => f.clave === abierta.padre) : undefined;
  const filaAbierta =
    abierta?.tipo === 'adicional'
      ? padreAbierto?.componentes.find((c) => c.clave === abierta.clave)
      : propuesta?.partidas.find((f) => f.clave === abierta?.clave);

  return (
    <div className="animar-entrada mx-auto max-w-[1440px] pb-24">
      <nav aria-label="Ruta" className="mb-2.5 flex flex-wrap gap-2 text-[13px] text-texto-suave">
        <Link href="/cotizaciones" className="hover:text-texto">
          Cotizaciones
        </Link>
        <span aria-hidden="true">/</span>
        {cotizacion.oportunidad && (
          <Link href={`/oportunidades/${cotizacion.oportunidad.id}`} className="hover:text-texto">
            {cotizacion.oportunidad.cliente?.razon_social} · {cotizacion.oportunidad.nombre}
          </Link>
        )}
      </nav>

      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="mr-auto min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">
            {cotizacion.oportunidad?.nombre ?? 'Cotización'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            <span>{cotizacion.oportunidad?.cliente?.razon_social}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-texto">{etiquetaRevision(revision.numero)}</span>
            <Pill tono={ESTADOS[revision.estado].tono}>{ESTADOS[revision.estado].texto}</Pill>
            <span aria-hidden="true">·</span>
            <span>{cotizacion.folio ?? 'Sin folio (se asigna al emitir)'}</span>
          </p>
        </div>
        {puedeEliminar && (
          <EliminarCotizacion
            cotizacionId={cotizacion.id}
            oportunidadId={cotizacion.oportunidad?.id ?? null}
          />
        )}
      </header>

      <div className="mb-5">
        <PasosWizard actual={paso} disponibles={[1, 2, 3, 4]} alElegir={(p) => irA(p as Paso)} />
      </div>

      {!editable && paso === 1 && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-borde bg-superficie-2 px-4 py-3 text-[13px] text-texto-suave">
          <Icon name="candado" size={16} />
          {revision.estado === 'pendiente_autorizacion'
            ? 'Está en autorización: no se puede editar. Si necesitas cambiar algo, retírala en el paso «Autorización».'
            : revision.estado === 'autorizada'
              ? 'Autorizada: las partidas quedaron bloqueadas. Para cambiarlas se crea una nueva revisión.'
              : 'Sólo lectura.'}
        </p>
      )}

      {paso === 1 && propuesta && (
        <Tarjeta className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-3">
            <div role="tablist" aria-label="Propuestas" className="mr-auto flex flex-wrap gap-1.5">
              {propuestas.map((p) => (
                <PestanaPropuesta
                  key={p.clave}
                  p={p}
                  activa={p.clave === propuesta.clave}
                  editable={editable}
                  puedeQuitar={
                    editable &&
                    propuestas.length > 1 &&
                    (p.es_adicional || propuestas.filter((x) => !x.es_adicional).length > 1)
                  }
                  onElegir={() => setActiva(p.clave)}
                  onRenombrar={(nombre) => actualizarPropuesta(p.clave, { nombre })}
                  onQuitar={() => {
                    const resto = propuestas.filter((x) => x.clave !== p.clave);
                    setPropuestas(resto);
                    if (activa === p.clave) setActiva(resto[0]?.clave ?? '');
                  }}
                />
              ))}
              {editable && (
                <>
                  <BotonChico onClick={() => agregarPropuesta(false)} icono="mas">
                    Propuesta
                  </BotonChico>
                  <BotonChico onClick={() => agregarPropuesta(true)} icono="mas">
                    Adicionales
                  </BotonChico>
                </>
              )}
            </div>
            {editable && (
              <>
                <button
                  type="button"
                  onClick={() => setPegado({ texto: '', html: '' })}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-borde bg-superficie px-3.5 text-[13px] font-semibold hover:bg-superficie-2"
                >
                  <Icon name="copiar" size={16} />
                  Pegar desde Excel
                </button>
                <button
                  type="button"
                  onClick={() => setAbierta({ tipo: 'cargo', clave: null })}
                  disabled={lineas.length === 0}
                  title={
                    lineas.length
                      ? 'Envío especial u otro cargo que se reparte entre partidas'
                      : 'Primero agrega partidas'
                  }
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-borde bg-superficie px-3.5 text-[13px] font-semibold hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="columnas" size={16} />
                  Cargo a prorratear
                </button>
                <button
                  type="button"
                  onClick={() => setAbierta({ tipo: 'partida', clave: null })}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-acento px-3.5 text-[13px] font-semibold text-sobre-acento hover:brightness-110"
                >
                  <Icon name="mas" size={16} strokeWidth={2.4} />
                  Agregar partida
                </button>
              </>
            )}
          </div>

          {propuesta.es_adicional && (
            <p className="border-b border-borde bg-info-suave/40 px-4 py-2 text-xs text-info">
              Adicionales: marca «Se suma» en las partidas que deben sumarse al total de cada propuesta; las
              demás quedan como opcionales.
            </p>
          )}

          <div className="px-3 pt-1 pb-3" onPaste={alPegar}>
            {propuesta.partidas.length === 0 ? (
              <Vacio editable={editable} onPegar={() => setPegado({ texto: '', html: '' })} />
            ) : (
              <TablaPartidas
                filas={propuesta.partidas}
                esAdicional={propuesta.es_adicional}
                catalogos={catalogos}
                soloLectura={!editable}
                onCambiar={(partidas) => actualizarPropuesta(propuesta.clave, { partidas })}
                onAbrir={(clave) => {
                  const f = propuesta.partidas.find((x) => x.clave === clave);
                  setAbierta({ tipo: f?.presentacion === 'prorrateada' ? 'cargo' : 'partida', clave });
                }}
                onAbrirAdicional={(padre, clave) => setAbierta({ tipo: 'adicional', padre, clave })}
              />
            )}
          </div>

          <ResumenPropuesta p={propuesta} />
        </Tarjeta>
      )}

      {paso === 2 && (
        <PasoCondiciones
          revision={revision}
          cotizacionId={cotizacion.id}
          editable={editable}
          catalogo={catalogoCondiciones}
          elegidasIniciales={condiciones}
        />
      )}
      {paso === 4 && (
        <PasoFinanciamiento
          revision={revision}
          cotizacionId={cotizacion.id}
          puedeEditar={puedeEditar}
          esquemas={esquemasFinanciamiento}
          filasIniciales={financiamiento}
          tipoOportunidad={tipoOportunidad}
        />
      )}
      {paso === 3 && verCorrida && (
        <>
          {puedeEditar && revision.estado === 'pendiente_autorizacion' && (
            <div className="mb-5">
              <PasoAutorizacion
                revision={revision}
                cotizacionId={cotizacion.id}
                puedeEditar={puedeEditar}
                propuestas={propuestas}
                onIrA={setPaso}
              />
            </div>
          )}
          <CorridaAutorizacion
            revision={revision}
            cotizacionId={cotizacion.id}
            catalogos={catalogos}
            utilidadesIniciales={autorizacion.utilidades}
            puedeAutorizar={autorizacion.puedeAutorizar}
            solicitante={cotizacion.oportunidad?.ejecutivo?.nombre ?? null}
          />
        </>
      )}
      {paso === 3 && !verCorrida && (
        <PasoAutorizacion
          revision={revision}
          cotizacionId={cotizacion.id}
          puedeEditar={puedeEditar}
          propuestas={propuestas}
          onIrA={setPaso}
        />
      )}

      {paso === 1 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => irA(2)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-paso px-4 text-sm font-semibold text-white hover:brightness-110"
          >
            Siguiente: Condiciones
            <Icon name="derecha" size={16} />
          </button>
        </div>
      )}

      {/* Barra de guardado: siempre a la vista mientras hay cambios. */}
      {(sucio || mensaje) && (
        <div
          role="status"
          className="animar-entrada fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-[760px] flex-wrap items-center gap-3 rounded-lg border border-borde bg-superficie px-4 py-3 shadow-xl"
        >
          {sucio ? (
            <>
              <span className="size-2.5 rounded-full bg-aviso" aria-hidden="true" />
              <span className="mr-auto text-sm font-semibold">Tienes cambios sin guardar</span>
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  setPropuestas(desdeRevision(revision));
                  setMensaje(null);
                }}
                className="min-h-10 cursor-pointer rounded-md px-3 text-[13px] font-semibold text-texto-suave hover:bg-superficie-2"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => guardar()}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-[13px] font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
              >
                <Icon name="guardado" size={16} />
                {guardando ? 'Guardando…' : 'Guardar'}
                <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1 text-[11px] font-medium sm:inline">
                  Ctrl S
                </kbd>
              </button>
            </>
          ) : (
            <span
              className={`mr-auto inline-flex items-center gap-2 text-sm font-semibold ${mensaje?.error ? 'text-peligro' : 'text-exito'}`}
            >
              <Icon name={mensaje?.error ? 'cerrar' : 'palomita'} size={16} strokeWidth={2.4} />
              {mensaje?.texto}
            </span>
          )}
          {sucio && mensaje?.error && <p className="w-full text-xs text-peligro">{mensaje.texto}</p>}
          {!sucio && (
            <button
              type="button"
              onClick={() => setMensaje(null)}
              aria-label="Ocultar mensaje"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-superficie-2"
            >
              <Icon name="cerrar" size={14} />
            </button>
          )}
        </div>
      )}

      {pegado !== null && propuesta && (
        <PegarExcel
          textoInicial={pegado.texto}
          htmlInicial={pegado.html}
          catalogos={catalogos}
          propuestas={propuestas.map((p) => ({ clave: p.clave, nombre: p.nombre }))}
          propuestaActual={propuesta.clave}
          onCerrar={() => setPegado(null)}
          onAgregar={(filas, destino) => {
            if (destino === 'nueva') {
              const nueva: PropuestaEditable = {
                clave: claveNueva('propuesta'),
                nombre: `Propuesta ${propuestas.filter((p) => !p.es_adicional).length + 1}`,
                tipo: '',
                es_adicional: false,
                partidas: filas,
              };
              setPropuestas((ps) => [...ps, nueva]);
              setActiva(nueva.clave);
            } else {
              setPropuestas((ps) =>
                ps.map((p) => (p.clave === destino ? { ...p, partidas: [...p.partidas, ...filas] } : p)),
              );
              setActiva(destino);
            }
            setPegado(null);
            setMensaje({ texto: `${filas.length} partidas agregadas. Revisa y guarda.` });
          }}
        />
      )}

      {propuesta && abierta && (abierta.clave === null || filaAbierta) && (
        <VentanaPartida
          fila={filaAbierta ?? null}
          modo={abierta.tipo}
          numero={
            abierta.tipo === 'partida' && filaAbierta
              ? lineas.findIndex((f) => f.clave === filaAbierta.clave) + 1
              : undefined
          }
          esAdicional={propuesta.es_adicional}
          cantidadPadre={padreAbierto?.cantidad}
          descripcionPadre={padreAbierto?.descripcion}
          destinos={lineas.map((f) => ({ clave: f.clave, descripcion: f.descripcion }))}
          catalogos={catalogos}
          soloLectura={!editable}
          onCerrar={() => setAbierta(null)}
          onGuardar={(fila, otra) => {
            if (abierta.tipo === 'adicional') {
              actualizarPropuesta(propuesta.clave, {
                partidas: propuesta.partidas.map((p) =>
                  p.clave !== abierta.padre
                    ? p
                    : {
                        ...p,
                        componentes: p.componentes.some((c) => c.clave === fila.clave)
                          ? p.componentes.map((c) => (c.clave === fila.clave ? fila : c))
                          : [...p.componentes, fila],
                      },
                ),
              });
            } else {
              const existe = propuesta.partidas.some((f) => f.clave === fila.clave);
              actualizarPropuesta(propuesta.clave, {
                partidas: existe
                  ? propuesta.partidas.map((f) => (f.clave === fila.clave ? fila : f))
                  : [...propuesta.partidas, fila],
              });
            }
            if (!otra) setAbierta(null);
          }}
        />
      )}
    </div>
  );
}

function PestanaPropuesta({
  p,
  activa,
  editable,
  puedeQuitar,
  onElegir,
  onRenombrar,
  onQuitar,
}: {
  p: PropuestaEditable;
  activa: boolean;
  editable: boolean;
  puedeQuitar: boolean;
  onElegir: () => void;
  onRenombrar: (nombre: string) => void;
  onQuitar: () => void;
}) {
  const [renombrando, setRenombrando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  if (renombrando)
    return (
      <input
        autoFocus
        defaultValue={p.nombre}
        maxLength={80}
        aria-label="Nombre de la propuesta"
        onBlur={(e) => {
          if (e.target.value.trim()) onRenombrar(e.target.value.trim());
          setRenombrando(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setRenombrando(false);
        }}
        className="h-10 w-44 rounded-pill border-2 border-acento bg-superficie px-3.5 text-[13px] font-semibold outline-none"
      />
    );
  return (
    <div
      className={`group/p inline-flex min-h-10 items-center rounded-pill border text-[13px] font-semibold transition-colors ${
        activa
          ? 'border-paso bg-paso text-white'
          : 'border-borde bg-superficie text-texto-suave hover:text-texto'
      }`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activa}
        onClick={onElegir}
        onDoubleClick={() => editable && setRenombrando(true)}
        title={editable ? 'Doble clic para renombrar' : undefined}
        className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 pr-1.5 pl-3.5"
      >
        {p.es_adicional && <Icon name="mas" size={13} strokeWidth={2.6} />}
        {p.nombre}
        <span
          className={`tabular rounded-pill px-1.5 text-[11px] ${activa ? 'bg-white/20' : 'bg-superficie-2'}`}
        >
          {p.partidas.length}
        </span>
      </button>
      {puedeQuitar &&
        (confirmar ? (
          <span className="inline-flex items-center gap-1 pr-2 text-xs">
            ¿Quitar?
            <button type="button" onClick={onQuitar} className="cursor-pointer rounded-sm px-1 underline">
              Sí
            </button>
            <button
              type="button"
              onClick={() => setConfirmar(false)}
              className="cursor-pointer rounded-sm px-1 underline"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (p.partidas.length ? setConfirmar(true) : onQuitar())}
            aria-label={`Quitar ${p.nombre}`}
            className="mr-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-full opacity-60 hover:bg-white/15 hover:opacity-100"
          >
            <Icon name="cerrar" size={13} />
          </button>
        ))}
    </div>
  );
}

function BotonChico({
  onClick,
  icono,
  children,
}: {
  onClick: () => void;
  icono: 'mas';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-pill border border-dashed border-texto/25 px-3 text-[13px] font-semibold text-acento-texto hover:border-acento"
    >
      <Icon name={icono} size={14} strokeWidth={2.4} />
      {children}
    </button>
  );
}

function Vacio({ editable, onPegar }: { editable: boolean; onPegar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-acento-suave text-acento-texto">
        <Icon name="cotizaciones" size={22} />
      </span>
      <div>
        <p className="text-sm font-semibold">Esta propuesta aún no tiene partidas</p>
        <p className="mt-1 text-[13px] text-texto-suave">
          {editable
            ? 'Copia las filas de tu Solicitud de precios en Excel y pégalas aquí (Ctrl + V), o agrégalas una por una.'
            : 'No hay partidas en esta propuesta.'}
        </p>
      </div>
      {editable && (
        <button
          type="button"
          onClick={onPegar}
          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-borde bg-superficie px-3.5 text-[13px] font-semibold hover:bg-superficie-2"
        >
          <Icon name="copiar" size={16} />
          Pegar desde Excel
        </button>
      )}
    </div>
  );
}

function ResumenPropuesta({ p }: { p: PropuestaEditable }) {
  const r = resumenPropuesta(p);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-borde bg-superficie-2/60 px-5 py-3 text-[13px]">
      <span className="text-texto-suave">
        <strong className="text-texto tabular">{r.partidas}</strong> partidas ·{' '}
        <strong className="text-texto tabular">{r.piezas}</strong> piezas
      </span>
      {r.sinCosto > 0 && <span className="font-semibold text-aviso">{r.sinCosto} sin costo</span>}
      <span className="ml-auto text-texto-suave">
        Costo total de la propuesta (sin IVA):{' '}
        <strong className="text-[15px] text-texto tabular">{r.costoTexto}</strong>
      </span>
    </div>
  );
}
