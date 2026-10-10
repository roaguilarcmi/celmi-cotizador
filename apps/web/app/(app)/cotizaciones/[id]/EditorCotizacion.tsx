'use client';

import { etiquetaRevision } from '@celmi/core';
import Link from 'next/link';
import { useEffect, useState, useTransition, type ClipboardEvent, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { PasosWizard } from '@/components/PasosWizard';
import { Boton, Pill, Tarjeta } from '@/components/ui';
import type {
  CondicionCatalogo,
  CondicionRevision,
  CotizacionFila,
  Financiera,
  FinanciamientoFila,
  RevisionDetalle,
} from '@/lib/datos';
import type { TipoOportunidad } from '@/lib/tipos-oportunidad';
import { guardarPartidas } from '../acciones';
import { ESTADOS } from '../estados';
import {
  aPayload,
  claveNueva,
  desdeRevision,
  precioVencido,
  resumenPropuesta,
  todasLasFilas,
  type Catalogos,
  type PropuestaEditable,
} from './modelo';
import { EliminarCotizacion } from './EliminarCotizacion';
import { EsquemaCotizacion } from './EsquemaCotizacion';
import { MenuRevisiones } from './MenuRevisiones';
import { CorridaAutorizacion, type ReferenciaCorrida } from './CorridaAutorizacion';
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

const fechaRetiro = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hourCycle: 'h23',
  timeZone: 'America/Mexico_City',
});

export function EditorCotizacion({
  cotizacion,
  revision,
  catalogos,
  puedeEditar,
  pasoInicial,
  puedeEliminar,
  catalogoCondiciones,
  condiciones,
  financieras,
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
  financieras: Financiera[];
  financiamiento: FinanciamientoFila[];
  tipoOportunidad: TipoOportunidad;
  /** Sólo para quien ve la utilidad: la corrida de precios (Fase 3C). */
  autorizacion: {
    utilidades: Record<string, string>;
    tiposCambio: Record<string, string>;
    referencia: ReferenciaCorrida | null;
    puedeAutorizar: boolean;
  } | null;
}) {
  const editable = puedeEditar && (revision.estado === 'borrador' || revision.estado === 'rechazada');
  const [propuestas, setPropuestas] = useState(() => desdeRevision(revision));
  const [base, setBase] = useState(() => JSON.stringify(aPayload(desdeRevision(revision))));
  // Cuando el servidor trae la revisión actualizada (tras guardar), se adopta sin remontar la pantalla.
  const [previa, setPrevia] = useState(revision);
  if (revision !== previa) {
    setPrevia(revision);
    // Sólo se reemplaza lo capturado si cambiaron las partidas guardadas. Guardar otro dato de la revisión (esquema,
    // mayorista del arrendamiento, condiciones…) recarga la revisión y antes borraba lo no guardado (2026-10-10).
    const nuevas = desdeRevision(revision);
    const nuevaBase = JSON.stringify(aPayload(nuevas));
    if (nuevaBase !== base) {
      setPropuestas(nuevas);
      setBase(nuevaBase);
    }
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
  /** Tras el aviso de un adicional, la partida se abre con el foco en su descripción. */
  const [enfocarDescripcionAbierta, setEnfocarDescripcionAbierta] = useState(false);

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

  // Con precios de mayorista vencidos no se pasa al paso siguiente (2026-10-09).
  const vencidas = editable ? propuestas.flatMap(todasLasFilas).filter(precioVencido).length : 0;
  const irA = (nuevo: Paso) => {
    if (vencidas > 0 && nuevo > 1) {
      setMensaje({
        texto: `${vencidas} ${vencidas === 1 ? 'partida tiene' : 'partidas tienen'} el precio del mayorista vencido. Actualiza el costo o su vigencia para continuar.`,
        error: true,
      });
      return;
    }
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
  // «Revisa a detalle» desde la captura (2026-10-10): partidas con adicionales y cargos prorrateados de todas las
  // propuestas, para que quien captura refleje desde el inicio lo que implica cada adicional en la descripción.
  const porRevisar = propuestas.flatMap((p, pi) => {
    const lineasP = p.partidas.filter((f) => f.presentacion !== 'prorrateada');
    const conAdicionales = lineasP
      .map((f, i) => ({ p, f, ref: `${pi + 1}.${i + 1}`, tipo: 'partida' as const }))
      .filter((x) => x.f.componentes.length > 0);
    const cargos = p.partidas
      .filter((f) => f.presentacion === 'prorrateada')
      .map((f, i) => ({ p, f, ref: `${pi + 1}.C${i + 1}`, tipo: 'cargo' as const }));
    return [...conAdicionales, ...cargos];
  });
  const numAdicionales = porRevisar.reduce((s, x) => s + x.f.componentes.length, 0);
  const numCargos = porRevisar.filter((x) => x.tipo === 'cargo').length;
  const padreAbierto =
    abierta?.tipo === 'adicional' ? propuesta?.partidas.find((f) => f.clave === abierta.padre) : undefined;
  const filaAbierta =
    abierta?.tipo === 'adicional'
      ? padreAbierto?.componentes.find((c) => c.clave === abierta.clave)
      : propuesta?.partidas.find((f) => f.clave === abierta?.clave);

  // La corrida ocupa el alto disponible (un solo scroll): sin margen inferior extra.
  return (
    <div
      className={`animar-entrada mx-auto ${paso === 3 && verCorrida ? 'max-w-none' : 'max-w-[1440px] pb-24'}`}
    >
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
        <MenuRevisiones
          cotizacionId={cotizacion.id}
          revisiones={cotizacion.revisiones}
          actual={revision.numero}
          puedeEditar={puedeEditar}
        />
        {puedeEliminar && (
          <EliminarCotizacion
            cotizacionId={cotizacion.id}
            oportunidadId={cotizacion.oportunidad?.id ?? null}
          />
        )}
      </header>

      {cotizacion.revisiones[0] && cotizacion.revisiones[0].numero !== revision.numero && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-info/30 bg-info-suave px-4 py-2.5 text-[13px] text-info">
          <Icon name="reloj" size={16} />
          Estás viendo {etiquetaRevision(revision.numero)}, una revisión anterior (sólo lectura). La vigente
          es {etiquetaRevision(cotizacion.revisiones[0].numero)}.
          <Link href={`/cotizaciones/${cotizacion.id}`} className="font-semibold underline">
            Ir a la vigente
          </Link>
        </p>
      )}

      <div className="mb-5">
        <PasosWizard actual={paso} disponibles={[1, 2, 3, 4]} alElegir={(p) => irA(p as Paso)} />
      </div>

      {/* Retirada para corregir por quien autoriza (0027): el motivo queda a la vista hasta volver a enviarla. */}
      {revision.estado === 'borrador' && revision.motivo_retiro && (paso === 1 || paso === 3) && (
        <div
          role="note"
          className="mb-4 flex items-start gap-3 rounded-md border border-aviso/40 bg-aviso-suave px-4 py-3 text-[13px] text-aviso"
        >
          <Icon name="campana" size={18} className="mt-px shrink-0" />
          <p>
            <strong>
              {revision.retirador?.nombre ?? 'Quien autoriza'} la retiró para corregir
              {revision.retirada_en ? ` el ${fechaRetiro.format(new Date(revision.retirada_en))}` : ''}:
            </strong>{' '}
            «{revision.motivo_retiro}». Corrige y vuelve a enviarla a autorización.
          </p>
        </div>
      )}

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

      {paso === 1 && (
        <EsquemaCotizacion
          revision={revision}
          cotizacionId={cotizacion.id}
          editable={editable}
          mayoristas={catalogos.mayoristas}
        />
      )}
      {paso === 1 && porRevisar.length > 0 && (
        <div
          role="note"
          className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-aviso/50 bg-aviso-suave px-3 py-2"
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-aviso">
            <Icon name="campana" size={16} strokeWidth={2.6} className="motion-safe:animate-pulse" />
            Revisa a detalle
          </span>
          <span className="text-[13px] text-aviso">
            {numAdicionales > 0 &&
              `${numAdicionales} ${numAdicionales === 1 ? 'adicional' : 'adicionales'}: asegúrate de que la descripción de su partida incluya lo que implica`}
            {numAdicionales > 0 && numCargos > 0 && ' · '}
            {numCargos > 0 &&
              `${numCargos} ${numCargos === 1 ? 'cargo prorrateado' : 'cargos prorrateados'}: revisa entre qué partidas se reparte`}
            .
          </span>
          {porRevisar.map((x) => (
            <button
              key={x.f.clave}
              type="button"
              title={`Abrir ${x.ref}: ${x.f.descripcion}`}
              onClick={() => {
                setActiva(x.p.clave);
                setAbierta({ tipo: x.tipo, clave: x.f.clave });
                setEnfocarDescripcionAbierta(x.tipo === 'partida');
              }}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm bg-aviso px-2.5 text-[12px] font-bold text-superficie tabular hover:brightness-110"
            >
              {x.ref}
              {x.tipo === 'partida' && (
                <span className="font-semibold opacity-90">
                  · {x.f.componentes.length} {x.f.componentes.length === 1 ? 'adicional' : 'adicionales'}
                </span>
              )}
            </button>
          ))}
        </div>
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
                <Boton tamano="chico" icono="copiar" onClick={() => setPegado({ texto: '', html: '' })}>
                  Pegar desde Excel
                </Boton>
                <Boton
                  tamano="chico"
                  icono="columnas"
                  onClick={() => setAbierta({ tipo: 'cargo', clave: null })}
                  disabled={lineas.length === 0}
                  title={
                    lineas.length
                      ? 'Envío especial u otro cargo que se reparte entre partidas'
                      : 'Primero agrega partidas'
                  }
                >
                  Cargo a prorratear
                </Boton>
                <Boton
                  variante="primario"
                  tamano="chico"
                  icono="mas"
                  onClick={() => setAbierta({ tipo: 'partida', clave: null })}
                >
                  Agregar partida
                </Boton>
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
                onConvertida={(destino) => {
                  // Recordar ajustar la descripción de la partida que recibe el adicional.
                  setAbierta({ tipo: 'partida', clave: destino });
                  setEnfocarDescripcionAbierta(true);
                }}
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
          financieras={financieras}
          filasIniciales={financiamiento}
          // El esquema es de la cotización (0024); por omisión, el de la oportunidad.
          tipoOportunidad={revision.esquema ?? tipoOportunidad}
        />
      )}
      {paso === 3 && verCorrida && (
        <CorridaAutorizacion
          revision={revision}
          cotizacionId={cotizacion.id}
          catalogos={catalogos}
          utilidadesIniciales={autorizacion.utilidades}
          tiposCambioIniciales={autorizacion.tiposCambio}
          referencia={autorizacion.referencia}
          puedeAutorizar={autorizacion.puedeAutorizar}
          puedeRetirar={puedeEditar}
          solicitante={cotizacion.oportunidad?.ejecutivo?.nombre ?? null}
          capturista={cotizacion.revisiones.find((r) => r.id === revision.id)?.autor?.nombre ?? null}
          estadoEntrega={cotizacion.oportunidad?.estado_entrega ?? null}
          ciudadEntrega={cotizacion.oportunidad?.ciudad_entrega ?? ''}
        />
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
          <Boton variante="paso" iconoFinal="derecha" onClick={() => irA(2)}>
            Siguiente: Condiciones
          </Boton>
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
              <Boton
                variante="fantasma"
                tamano="chico"
                disabled={guardando}
                onClick={() => {
                  setPropuestas(desdeRevision(revision));
                  setMensaje(null);
                }}
              >
                Descartar
              </Boton>
              <Boton
                variante="primario"
                tamano="chico"
                icono="guardado"
                disabled={guardando}
                onClick={() => guardar()}
              >
                {guardando ? 'Guardando…' : 'Guardar'}
                <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1 text-[11px] font-medium sm:inline">
                  Ctrl S
                </kbd>
              </Boton>
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
          onAgregar={(grupos, destino) => {
            const filas = grupos.flatMap((g) => g.filas);
            const renglones = filas.reduce((s, f) => s + 1 + f.componentes.length, 0);
            if (grupos.some((g) => g.nombre !== null)) {
              // Varias propuestas (columna «Propuesta»): se completan las que existen con ese nombre; la primera
              // propuesta vacía toma el primer nombre nuevo; las demás se crean (2026-10-10).
              const lista = [...propuestas];
              let primera: string | null = null;
              for (const g of grupos) {
                const nombre = g.nombre ?? 'Propuesta';
                let i = lista.findIndex(
                  (p) => !p.es_adicional && p.nombre.trim().toLowerCase() === nombre.toLowerCase(),
                );
                if (i < 0) {
                  i = lista.findIndex(
                    (p) =>
                      !p.es_adicional &&
                      p.partidas.length === 0 &&
                      !grupos.some((x) => x.nombre === p.nombre),
                  );
                  if (i >= 0) lista[i] = { ...lista[i]!, nombre };
                }
                if (i >= 0) lista[i] = { ...lista[i]!, partidas: [...lista[i]!.partidas, ...g.filas] };
                else {
                  lista.push({
                    clave: claveNueva('propuesta'),
                    nombre,
                    tipo: '',
                    es_adicional: false,
                    partidas: g.filas,
                  });
                  i = lista.length - 1;
                }
                primera ??= lista[i]!.clave;
              }
              // Las propuestas de adicionales siguen al final.
              setPropuestas([
                ...lista.filter((p) => !p.es_adicional),
                ...lista.filter((p) => p.es_adicional),
              ]);
              if (primera) setActiva(primera);
              setPegado(null);
              setMensaje({
                texto: `${renglones} renglones agregados en ${grupos.length} propuestas. Revisa y guarda.`,
              });
              return;
            }
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
            setMensaje({ texto: `${renglones} renglones agregados. Revisa y guarda.` });
          }}
        />
      )}

      {propuesta && abierta && (abierta.clave === null || filaAbierta) && (
        <VentanaPartida
          key={`${abierta.tipo}-${abierta.clave ?? 'nueva'}`}
          enfocarAlAbrir={enfocarDescripcionAbierta}
          onIrADescripcion={
            abierta.tipo === 'adicional'
              ? () => {
                  setAbierta({ tipo: 'partida', clave: abierta.padre });
                  setEnfocarDescripcionAbierta(true);
                }
              : undefined
          }
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
          onCerrar={() => {
            setAbierta(null);
            setEnfocarDescripcionAbierta(false);
          }}
          onGuardar={(fila, otra) => {
            setEnfocarDescripcionAbierta(false);
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
        <Boton tamano="chico" icono="copiar" onClick={onPegar}>
          Pegar desde Excel
        </Boton>
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
