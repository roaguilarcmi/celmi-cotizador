'use client';

import {
  aEscalado,
  calcularPartida,
  conIva,
  ESCALA_DINERO,
  formatearMXN,
  importeConLetra,
  mejoraDePrecio,
  presentarPropuestas,
  type ResultadoPartida,
} from '@celmi/core';
import { porcentaje, tipoCambio as tipoCambioSchema } from '@celmi/validation';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  COLUMNAS,
  GRUPOS,
  MenuColumnas,
  useColumnasOcultas,
  type Columna,
  type Grupo,
} from '@/components/corrida/Corrida';
import { Icon, type IconName } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Pill } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import { decimal, entradaCorrida, monedasExtranjeras } from '@/lib/corrida';
import type { PartidaFila, RevisionDetalle } from '@/lib/datos';
import { usePreferencia } from '@/lib/preferencias';
import { autorizarRevision, cambiarEstadoRevision, guardarUtilidades, rechazarRevision } from '../acciones';
import { nombreCatalogo, type Catalogos } from './modelo';

const pesos = (c: bigint) => formatearMXN(c);
const fechaHora = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});
const pct = (parte: bigint, base: bigint) =>
  base > 0n ? (Number((parte * 10000n) / base) / 100).toFixed(1) : '0.0';

/** «Unitario al cliente»: sólo aparece si hay adicionales incluidos o cargos prorrateados. */
const COLUMNA_CLIENTE: Columna = {
  id: 'pvCliente',
  titulo: 'Unitario al cliente sin IVA',
  grupo: 'venta',
  numero: true,
};
/** Columnas centradas (como en Excel, los importes van a la derecha y el texto a la izquierda). */
const CENTRADAS = new Set(['cantidad', 'unidad', 'moneda', 'tc', 'utilidadPct', 'entrega']);

/** Fila de la corrida: partida, adicional (incluido o visible) o cargo prorrateado, con su referencia. */
interface FilaCorrida {
  p: PartidaFila;
  ref: string;
  tipo: 'partida' | 'incluida' | 'visible' | 'cargo';
}

function filasDe(partidas: PartidaFila[], numero: number): FilaCorrida[] {
  const filas: FilaCorrida[] = [];
  let n = 0;
  for (const p of partidas.filter((x) => !x.partida_padre_id && x.presentacion === 'linea')) {
    const ref = `${numero}.${++n}`;
    filas.push({ p, ref, tipo: 'partida' });
    partidas
      .filter((c) => c.partida_padre_id === p.id)
      .forEach((c, i) =>
        filas.push({
          p: c,
          ref: `${ref}.${String.fromCharCode(97 + i)}`,
          tipo: c.presentacion === 'incluida' ? 'incluida' : 'visible',
        }),
      );
  }
  partidas
    .filter((x) => x.presentacion === 'prorrateada')
    .forEach((p, i) => filas.push({ p, ref: `${numero}.C${i + 1}`, tipo: 'cargo' }));
  return filas;
}

/** T.C. inicial por moneda: el ya guardado o, si todas las partidas de esa moneda traen el mismo, ése. */
function tiposCambioIniciales(revision: RevisionDetalle, guardados: Record<string, string>) {
  return Object.fromEntries(
    monedasExtranjeras(revision).map((m) => {
      if (guardados[m]) return [m, guardados[m]];
      const capturados = new Set(
        revision.propuestas.flatMap((p) =>
          p.partidas
            .filter((pa) => pa.costo?.moneda === m)
            .map((pa) => decimal(pa.costo?.tipo_cambio ?? 0, 5)),
        ),
      );
      return [m, capturados.size === 1 ? ([...capturados][0] ?? '') : ''];
    }),
  );
}

/**
 * Corrida de precios con datos reales (Fase 3C), con aspecto de hoja de Excel: celdas delimitadas, filas bajas,
 * encabezados y primeras columnas fijos, y un solo scroll (la hoja ocupa el alto disponible y el resumen para el
 * cliente va dentro de ella, al final). Quien autoriza fija el T.C. de cada moneda extranjera (sólo si la hay) y la
 * utilidad de cada partida, adicional y cargo; los precios se calculan con @celmi/core al escribir y el servidor los
 * vuelve a calcular al autorizar.
 */
export function CorridaAutorizacion({
  revision,
  cotizacionId,
  catalogos,
  utilidadesIniciales,
  tiposCambioIniciales: tcGuardados,
  puedeAutorizar,
  puedeRetirar,
  solicitante,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  catalogos: Catalogos;
  utilidadesIniciales: Record<string, string>;
  tiposCambioIniciales: Record<string, string>;
  puedeAutorizar: boolean;
  /** Quien preparó la cotización puede retirarla mientras espera. */
  puedeRetirar: boolean;
  solicitante: string | null;
}) {
  const editable = puedeAutorizar && revision.estado === 'pendiente_autorizacion';
  const monedas = monedasExtranjeras(revision);
  const [general, setGeneral] = useState('');
  const [porPartida, setPorPartida] = useState<Record<string, string>>(utilidadesIniciales);
  const [tcs, setTcs] = useState(() => tiposCambioIniciales(revision, tcGuardados));
  const [base, setBase] = useState(() =>
    JSON.stringify([utilidadesIniciales, tiposCambioIniciales(revision, tcGuardados)]),
  );
  // Cuando el servidor trae datos nuevos (tras guardar o autorizar), se adoptan.
  const [previa, setPrevia] = useState(revision);
  if (revision !== previa) {
    setPrevia(revision);
    const iniciales = tiposCambioIniciales(revision, tcGuardados);
    setPorPartida(utilidadesIniciales);
    setTcs(iniciales);
    setBase(JSON.stringify([utilidadesIniciales, iniciales]));
  }
  const [ocultas, cambiarOcultas] = useColumnasOcultas();
  const [completaGuardada, guardarCompleta] = usePreferencia('celmi-corrida-completa');
  const completa = completaGuardada === '1';
  const [dialogo, setDialogo] = useState<'autorizar' | 'rechazar' | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const area = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLDivElement>(null);

  const todas = revision.propuestas.flatMap((p) => p.partidas);
  const utilidadDe = (id: string) => porPartida[id] ?? general;
  const efectivas = Object.fromEntries(todas.map((p) => [p.id, utilidadDe(p.id)]));
  const utilidadBase = (() => {
    if (general) return general;
    const cuenta = new Map<string, number>();
    for (const v of Object.values(efectivas)) if (v) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    return [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  })();
  const tcsValidos = monedas.every((m) => tipoCambioSchema.safeParse(tcs[m] ?? '').success);
  const sucio = editable && (JSON.stringify([porPartida, tcs]) !== base || general !== '');

  // Un solo scroll: la hoja ocupa exactamente el alto que queda en la ventana (en pantallas grandes); en celular la
  // página crece y es la página la que se desplaza.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ajustar = () => {
      if (window.innerWidth < 1024) {
        el.style.height = '';
        return;
      }
      const main = el.closest('main');
      const pie = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(460, Math.floor(window.innerHeight - arriba - pie))}px`;
    };
    ajustar();
    // Tras la animación de entrada la posición ya es la definitiva.
    const t = window.setTimeout(ajustar, 350);
    const ro = new ResizeObserver(ajustar);
    ro.observe(document.body);
    window.addEventListener('resize', ajustar);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('resize', ajustar);
    };
  }, [completa]);

  // El resumen para el cliente va dentro de la hoja: se le da el ancho visible para que no se desplace de lado.
  useEffect(() => {
    const el = hoja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.style.setProperty('--ancho-visible', `${el.clientWidth}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [completa]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && completa && !document.querySelector('dialog[open]')) guardarCompleta(null);
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
  }, [completa, sucio, guardarCompleta]);

  // Costo (no depende de la utilidad) y resultado de cada partida por separado: un dato inválido sólo marca su fila.
  let entrada: ReturnType<typeof entradaCorrida> | null = null;
  try {
    entrada = entradaCorrida(revision, () => '0', tcs);
  } catch {
    entrada = null;
  }
  const costos = new Map<string, ResultadoPartida>();
  const resultados = new Map<string, ResultadoPartida | null>();
  for (const prop of entrada ?? [])
    for (const p of prop.partidas) {
      try {
        costos.set(p.id, calcularPartida(p));
      } catch {
        // T.C. vacío o no válido: la fila queda sin costo hasta corregirlo.
      }
      try {
        resultados.set(p.id, calcularPartida({ ...p, utilidadPct: utilidadDe(p.id) }));
      } catch {
        resultados.set(p.id, null);
      }
    }
  const validas =
    todas.length > 0 && resultados.size === todas.length && [...resultados.values()].every(Boolean);
  const presentadas = (() => {
    if (!validas || !entrada) return null;
    try {
      return presentarPropuestas(
        entrada.map((prop) => ({
          ...prop,
          partidas: prop.partidas.map((p) => ({
            ...p,
            precioUnitario: resultados.get(p.id)?.precioUnitario ?? 0n,
          })),
        })),
      );
    } catch {
      return null;
    }
  })();

  const lista = [...resultados.values()].filter((r): r is ResultadoPartida => r !== null);
  const costo = [...costos.values()].reduce((s, r) => s + r.costoTotal, 0n);
  const venta = lista.reduce((s, r) => s + r.importe, 0n);
  const utilidad = venta - costo;
  const principales = presentadas?.filter((p) => !p.esAdicional).map((p) => p.totales.total) ?? [];
  const numAdicionales = revision.propuestas.filter((p) => p.es_adicional).length;
  const generalValida = general === '' || porcentaje.safeParse(general).success;

  // Precio = costo × T.C. × (1 + utilidad): en pesos el T.C. es 1 y no se modifica (decisión 2026-10-06).
  const conCliente = todas.some((p) => p.presentacion !== 'linea');
  const disponibles = COLUMNAS.flatMap((c) => (c.id === 'pvUnit' && conCliente ? [c, COLUMNA_CLIENTE] : [c]));
  const columnas = disponibles.filter((c) => !ocultas.has(c.id));
  const gruposVisibles = (Object.keys(GRUPOS) as Grupo[])
    .map((g) => ({ g, span: columnas.filter((c) => c.grupo === g).length }))
    .filter((x) => x.span > 0);
  const lineaDe = new Map(presentadas?.flatMap((p) => p.lineas.map((l) => [l.partidaId, l] as const)) ?? []);
  const cargoDe = new Map(presentadas?.flatMap((p) => p.cargos.map((c) => [c.partidaId, c] as const)) ?? []);
  const refDe = new Map<string, string>();
  const filasPorPropuesta = revision.propuestas.map((prop, i) => {
    const filas = filasDe(prop.partidas, i + 1);
    for (const f of filas) refDe.set(f.p.id, f.ref);
    return filas;
  });

  /** Utilidad de lo que paga el cliente en cada propuesta: subtotal menos el costo de lo que incluye. */
  const utilidadPropuesta = (i: number) => {
    const c = presentadas?.[i];
    if (!c) return null;
    const costoDeLinea = (l: { partidaId: string; incluidas: string[] }) =>
      [l.partidaId, ...l.incluidas].reduce((s, id) => s + (costos.get(id)?.costoTotal ?? 0n), 0n);
    let costoProp = c.lineas.reduce((s, l) => s + costoDeLinea(l), 0n);
    costoProp += c.cargos.reduce((s, x) => s + (costos.get(x.partidaId)?.costoTotal ?? 0n), 0n);
    if (!c.esAdicional)
      for (const a of presentadas?.filter((x) => x.esAdicional) ?? [])
        costoProp += a.lineas.filter((l) => l.seSuma).reduce((s, l) => s + costoDeLinea(l), 0n);
    const monto = c.totales.subtotal - costoProp;
    return { monto, porcentaje: pct(monto, costoProp) };
  };

  const resultado = (r: { error?: string; ok?: string }) => {
    setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
    if (!r.error) {
      setGeneral('');
      setDialogo(null);
    }
  };

  const guardarAvance = () =>
    iniciar(async () =>
      resultado(
        await guardarUtilidades(
          revision.id,
          cotizacionId,
          Object.fromEntries(Object.entries(efectivas).filter(([, v]) => porcentaje.safeParse(v).success)),
          Object.fromEntries(Object.entries(tcs).filter(([, v]) => tipoCambioSchema.safeParse(v).success)),
        ),
      ),
    );

  const autorizar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const nota = String(new FormData(e.currentTarget).get('nota') ?? '');
    iniciar(async () => resultado(await autorizarRevision(revision.id, cotizacionId, efectivas, tcs, nota)));
  };

  const rechazar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '');
    iniciar(async () => resultado(await rechazarRevision(revision.id, cotizacionId, motivo)));
  };

  const celda = (col: Columna, f: FilaCorrida): ReactNode => {
    const { p } = f;
    const r = resultados.get(p.id);
    const k = costos.get(p.id);
    const v = (c: bigint | undefined) =>
      c === undefined ? <span className="text-texto-suave">—</span> : pesos(c);
    switch (col.id) {
      case 'marca':
        return nombreCatalogo(catalogos.marcas, p.marca_id) || '—';
      case 'mayorista':
        return nombreCatalogo(catalogos.mayoristas, p.costo?.mayorista_id ?? null) || '—';
      case 'modelo':
        return <span className="font-semibold">{p.sku || '—'}</span>;
      case 'entrega':
        return p.entrega || '—';
      case 'unidad': {
        const u = catalogos.unidades.find((x) => x.id === p.unidad_id);
        return u?.abreviatura ?? u?.nombre ?? '—';
      }
      case 'cantidad':
        return <span className="font-bold">{p.cantidad}</span>;
      case 'unitario': {
        if (!p.costo) return '—';
        const unitario = decimal(p.costo.costo_unitario, 2);
        let mejora: ReactNode = null;
        if (p.costo.costo_anterior != null) {
          const anterior = decimal(p.costo.costo_anterior, 2);
          const m = mejoraDePrecio(anterior, unitario);
          mejora = (
            <span
              title={`Precio anterior ${pesos(aEscalado(anterior, ESCALA_DINERO))}`}
              className={`mr-1.5 rounded-sm px-1 text-[10px] font-bold ${m.ahorro > 0n ? 'bg-exito-suave text-exito' : 'bg-peligro-suave text-peligro'}`}
            >
              {m.ahorro > 0n ? '▼' : '▲'} {m.porcentaje.replace('-', '')} %
            </span>
          );
        }
        return (
          <>
            {mejora}
            {p.costo.moneda !== 'MXN' && (
              <span className="text-[10px] text-texto-suave">{p.costo.moneda} </span>
            )}
            {pesos(aEscalado(unitario, ESCALA_DINERO))}
          </>
        );
      }
      case 'moneda':
        return p.costo?.moneda ?? '—';
      case 'tc':
        if (!p.costo || p.costo.moneda === 'MXN')
          return (
            <span className="text-texto-suave" title="Pesos mexicanos: T.C. fijo en 1">
              1
            </span>
          );
        return (
          <span className="font-semibold text-aviso" title="T.C. que fija quien autoriza">
            {tcs[p.costo.moneda] || '?'}
          </span>
        );
      case 'unitarioFinal':
        return v(k?.costoUnitarioMXN);
      case 'compra':
        return <span className="font-semibold">{v(k?.costoTotal)}</span>;
      case 'compraIva':
        return v(k ? conIva(k.costoTotal) : undefined);
      case 'utilidadUnit':
        return <span className="text-exito">{v(r?.utilidadUnitaria)}</span>;
      case 'utilidadTotal':
        return <span className="font-semibold text-exito">{v(r?.utilidadTotal)}</span>;
      case 'utilidadTotalIva':
        return <span className="text-exito">{v(r ? conIva(r.utilidadTotal) : undefined)}</span>;
      case 'pvUnit':
        return <span className="font-bold text-acento-texto">{v(r?.precioUnitario)}</span>;
      case 'pvCliente': {
        const l = f.tipo === 'partida' || f.tipo === 'visible' ? lineaDe.get(p.id) : undefined;
        return l ? <span className="font-bold text-acento-texto">{pesos(l.precioUnitario)}</span> : null;
      }
      case 'pvUnitIva':
        return v(r ? conIva(r.precioUnitario) : undefined);
      case 'venta':
        return <span className="font-bold">{v(r?.importe)}</span>;
      case 'ventaIva':
        return v(r ? conIva(r.importe) : undefined);
      default:
        return null;
    }
  };

  const totalPie: Partial<Record<string, bigint>> = {
    compra: costo,
    compraIva: conIva(costo),
    utilidadTotal: utilidad,
    utilidadTotalIva: conIva(utilidad),
    venta,
    ventaIva: conIva(venta),
  };

  // Rejilla tipo Excel: cada celda con borde derecho e inferior; el cambio de grupo, un poco más marcado.
  const borde = 'border-r border-b border-borde';
  const inicioGrupo = (i: number) =>
    i > 0 && columnas[i - 1]?.grupo !== columnas[i]?.grupo ? 'border-l border-l-texto/25' : '';
  const alinear = (c: Columna) =>
    CENTRADAS.has(c.id) ? 'text-center' : c.numero ? 'tabular text-right' : 'text-left';
  const fija1 = 'sticky left-0 z-10 w-14 min-w-14';
  const fija2 = 'sticky left-14 z-10 w-64 min-w-64 max-w-64';

  const estadoPill =
    revision.estado === 'autorizada' || revision.estado === 'emitida' ? (
      <Pill tono="exito">Precios autorizados</Pill>
    ) : revision.estado === 'rechazada' ? (
      <Pill tono="peligro">Rechazada</Pill>
    ) : (
      <Pill tono="aviso">Pendiente de autorización</Pill>
    );

  const contenido = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-borde bg-superficie">
      {/* Barra 1: estado, cifras clave y decisión. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-borde px-3 py-2">
        <div className="mr-auto min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold tracking-tight">Corrida de precios</h2>
            {estadoPill}
          </div>
          <p className="mt-0.5 text-xs text-texto-suave">
            {revision.estado === 'pendiente_autorizacion' ? (
              <>
                <strong className="text-texto">{solicitante ?? 'El ejecutivo'}</strong> solicitó autorización
                {revision.enviada_en ? ` el ${fechaHora.format(new Date(revision.enviada_en))}` : ''}
                {puedeRetirar && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        iniciar(async () =>
                          resultado(await cambiarEstadoRevision(revision.id, cotizacionId, 'borrador')),
                        )
                      }
                      className="cursor-pointer font-semibold text-acento-texto hover:underline"
                    >
                      Retirar para corregir
                    </button>
                  </>
                )}
              </>
            ) : revision.estado === 'rechazada' ? (
              <>Motivo: «{revision.comentario_autorizacion}»</>
            ) : (
              <>
                {revision.autorizada_en
                  ? `Autorizada el ${fechaHora.format(new Date(revision.autorizada_en))}`
                  : ''}
                {revision.comentario_autorizacion ? ` · Nota: «${revision.comentario_autorizacion}»` : ''}
              </>
            )}
          </p>
        </div>
        <Dato etiqueta="Costo sin IVA" valor={pesos(costo)} />
        <Dato
          etiqueta="Utilidad sin IVA"
          valor={validas ? pesos(utilidad) : '—'}
          detalle={validas ? `${pct(utilidad, costo)} %` : undefined}
          tono="text-exito"
        />
        <Dato etiqueta="Venta sin IVA" valor={validas ? pesos(venta) : '—'} tono="text-acento-texto" />
        <Dato
          etiqueta={`${revision.propuestas.length - numAdicionales} propuestas${numAdicionales ? ` + ${numAdicionales} adic.` : ''} · con IVA`}
          valor={
            principales.length === 0
              ? '—'
              : principales.length === 1
                ? pesos(principales[0] ?? 0n)
                : `${pesos(principales.reduce((a, b) => (b < a ? b : a)))} – ${pesos(principales.reduce((a, b) => (b > a ? b : a)))}`
          }
        />
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <BotonBarra icono="guardado" disabled={pendiente || !sucio} onClick={guardarAvance}>
              Guardar avance
            </BotonBarra>
            <BotonBarra
              icono="cerrar"
              tono="peligro"
              disabled={pendiente}
              onClick={() => setDialogo('rechazar')}
            >
              Rechazar
            </BotonBarra>
            <BotonBarra
              icono="candado"
              tono="primario"
              disabled={pendiente || !validas || !tcsValidos}
              onClick={() => setDialogo('autorizar')}
              title={
                validas && tcsValidos
                  ? undefined
                  : `Define ${monedas.length ? 'el T.C. y ' : ''}la utilidad de todas las partidas`
              }
            >
              Autorizar
            </BotonBarra>
          </div>
        )}
      </div>

      {/* Barra 2: parámetros de la autorización. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borde bg-superficie-2/60 px-3 py-2">
        <span
          title="En pesos mexicanos el tipo de cambio es 1 y no se modifica"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-borde bg-superficie px-2.5 text-xs font-semibold text-texto-suave"
        >
          <Icon name="candado" size={12} />
          T.C. MXN <strong className="text-texto">1</strong>
        </span>
        {monedas.map((m) => {
          const valido = tipoCambioSchema.safeParse(tcs[m] ?? '').success;
          return (
            <label
              key={m}
              className="flex items-center gap-2 rounded-md border-2 border-aviso/50 bg-aviso-suave py-1 pr-1 pl-2.5"
            >
              <span className="text-xs leading-tight font-bold text-aviso">
                T.C. {m}
                <span className="block text-[10px] font-semibold opacity-80">5 decimales</span>
              </span>
              <input
                value={tcs[m] ?? ''}
                disabled={!editable}
                inputMode="decimal"
                placeholder="0.00000"
                aria-invalid={!valido}
                onChange={(e) => setTcs((s) => ({ ...s, [m]: e.target.value.replace(/[^\d.]/g, '') }))}
                className={`tabular h-8 w-28 rounded-sm border bg-superficie px-2 text-center text-sm font-bold text-texto outline-none focus:ring-2 focus:ring-aviso disabled:opacity-80 ${
                  valido ? 'border-aviso/40' : 'border-peligro'
                }`}
              />
            </label>
          );
        })}
        {editable && (
          <div className="flex items-center gap-2 rounded-md border-2 border-exito/40 bg-exito-suave py-1 pr-1 pl-2.5">
            <label htmlFor="utilidad-general" className="text-xs leading-tight font-bold text-exito">
              Utilidad general
              <span className="block text-[10px] font-semibold opacity-80">% sobre el costo</span>
            </label>
            <input
              id="utilidad-general"
              value={general}
              onChange={(e) => setGeneral(e.target.value.trim())}
              inputMode="decimal"
              placeholder="13.5"
              aria-invalid={!generalValida}
              className={`tabular h-8 w-20 rounded-sm border bg-superficie px-2 text-center text-sm font-bold text-texto outline-none focus:ring-2 focus:ring-exito ${
                generalValida ? 'border-exito/40' : 'border-peligro'
              }`}
            />
            <button
              type="button"
              onClick={() => setPorPartida({})}
              disabled={!general || !generalValida}
              className="h-8 cursor-pointer rounded-sm bg-exito px-2.5 text-xs font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aplicar a todas
            </button>
          </div>
        )}
        {editable && (
          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-exito">
            <span className="inline-block size-0 border-t-[7px] border-l-[7px] border-t-acento border-l-transparent" />
            <span>
              Cada partida puede llevar su propia utilidad:
              <br />
              escríbela en su celda (▲ = personalizada).
            </span>
          </p>
        )}
        <p className="text-[11px] leading-tight text-texto-suave">
          Precio = costo × T.C. × (1 + utilidad %),
          <br />
          unitario redondeado a 2 decimales.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <MenuColumnas ocultas={ocultas} onCambio={cambiarOcultas} columnas={disponibles} compacto />
          <button
            type="button"
            onClick={() => guardarCompleta(completa ? null : '1')}
            title={completa ? 'Salir de pantalla completa (Esc)' : 'Usar toda la pantalla'}
            className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-borde bg-superficie px-3 text-[13px] font-semibold hover:bg-superficie-2"
          >
            <Icon name={completa ? 'compactar' : 'expandir'} size={16} />
            {completa ? 'Salir' : 'Pantalla completa'}
          </button>
        </div>
      </div>

      {mensaje && (
        <p
          role="status"
          className={`border-b border-borde px-3 py-1.5 text-xs font-semibold ${mensaje.error ? 'bg-peligro-suave text-peligro' : 'bg-exito-suave text-exito'}`}
        >
          {mensaje.texto}
        </p>
      )}

      {/* La hoja: único scroll vertical (y horizontal para las columnas). */}
      <div ref={hoja} className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[12px] leading-tight">
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                scope="colgroup"
                colSpan={2}
                className={`sticky left-0 z-10 ${borde} bg-superficie px-2 py-1 text-left text-[11px] font-bold text-texto-suave`}
              >
                Partida y descripción
              </th>
              {gruposVisibles.map(({ g, span }) => (
                <th
                  key={g}
                  scope="colgroup"
                  colSpan={span}
                  className={`${borde} border-l border-l-texto/25 px-2 py-1 text-left text-[11px] font-bold tracking-wide uppercase ${GRUPOS[g].banda} ${GRUPOS[g].texto}`}
                >
                  {GRUPOS[g].titulo}
                </th>
              ))}
            </tr>
            <tr className="text-[11px] font-semibold text-texto-suave">
              <th scope="col" className={`${fija1} ${borde} bg-superficie-2 px-2 py-1.5 text-center`}>
                Partida
              </th>
              <th scope="col" className={`${fija2} ${borde} bg-superficie-2 px-2 py-1.5 text-left`}>
                Descripción del equipo
              </th>
              {columnas.map((c, i) => (
                <th
                  key={c.id}
                  scope="col"
                  className={`${borde} ${i === 0 ? 'border-l border-l-texto/25' : inicioGrupo(i)} ${
                    c.id === 'utilidadPct'
                      ? 'w-14 max-w-14 min-w-14 bg-exito-suave px-1'
                      : 'max-w-28 min-w-16 bg-superficie-2 px-2'
                  } py-1.5 align-middle leading-tight ${
                    CENTRADAS.has(c.id) ? 'text-center' : c.numero ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.id === 'utilidadPct' ? (
                    <>
                      <span className="text-exito">Utilidad %</span>
                      {editable && (
                        <span className="mt-0.5 block text-[9px] font-bold tracking-wide text-exito uppercase">
                          Editable
                        </span>
                      )}
                    </>
                  ) : (
                    c.titulo
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {revision.propuestas.map((prop, pi) => {
            const filas = filasPorPropuesta[pi] ?? [];
            const presentada = presentadas?.[pi];
            const tono = prop.es_adicional ? 'aviso' : pi % 2 === 0 ? 'acento' : 'info';
            const barra = `before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${
              tono === 'aviso' ? 'before:bg-aviso' : tono === 'acento' ? 'before:bg-acento' : 'before:bg-info'
            }`;
            const fondo =
              tono === 'aviso' ? 'bg-aviso-suave' : tono === 'acento' ? 'bg-acento-suave' : 'bg-info-suave';
            const texto =
              tono === 'aviso' ? 'text-aviso' : tono === 'acento' ? 'text-acento-texto' : 'text-info';
            return (
              <tbody key={prop.id}>
                <tr className="h-7">
                  <td colSpan={2 + columnas.length} className={`${borde} p-0 ${fondo}`}>
                    <div
                      className={`sticky left-0 flex w-fit items-center gap-x-2.5 py-1 pr-3 pl-3 whitespace-nowrap ${barra}`}
                    >
                      <span className={`text-[12px] font-bold ${texto}`}>{prop.nombre}</span>
                      {prop.tipo && <span className="text-texto-suave">{prop.tipo}</span>}
                      {prop.es_adicional && <span className="font-semibold text-aviso">· Adicionales</span>}
                      <span className="text-texto-suave">
                        · {presentada?.lineas.length ?? '—'} líneas para el cliente · Total con IVA{' '}
                        <strong className="tabular text-texto">
                          {presentada ? pesos(presentada.totales.total) : '—'}
                        </strong>
                      </span>
                    </div>
                  </td>
                </tr>
                {filas.map((f) => {
                  const cargo = f.tipo === 'cargo' ? cargoDe.get(f.p.id) : undefined;
                  const valor = utilidadDe(f.p.id);
                  const valida = porcentaje.safeParse(valor).success;
                  const personalizada = editable && valor !== '' && valor !== utilidadBase;
                  return (
                    <tr key={f.p.id} className="group h-8">
                      <td
                        className={`${fija1} ${barra} ${borde} tabular bg-superficie px-2 text-center font-semibold text-texto-suave group-hover:bg-superficie-2`}
                      >
                        {f.ref}
                      </td>
                      <td className={`${fija2} ${borde} bg-superficie px-2 group-hover:bg-superficie-2`}>
                        <Descripcion
                          f={f}
                          extra={
                            f.tipo === 'cargo'
                              ? `→ ${f.p.prorrateos.map((x) => refDe.get(x.destino_id) ?? '?').join(', ')}${
                                  cargo && cargo.diferencia !== 0n
                                    ? ` · ${cargo.diferencia > 0n ? '+' : '−'}${pesos(cargo.diferencia < 0n ? -cargo.diferencia : cargo.diferencia)}`
                                    : ''
                                }`
                              : undefined
                          }
                        />
                      </td>
                      {columnas.map((c, ci) => {
                        const clases = `${borde} ${ci === 0 ? 'border-l border-l-texto/25' : inicioGrupo(ci)}`;
                        if (c.id === 'utilidadPct')
                          return (
                            <td
                              key={c.id}
                              title={personalizada ? 'Utilidad personalizada de esta partida' : undefined}
                              className={`${clases} relative w-14 max-w-14 min-w-14 px-1 text-center ${
                                editable ? (valida ? 'bg-exito-suave/60' : 'bg-peligro-suave') : ''
                              }`}
                            >
                              {personalizada && (
                                <span
                                  aria-hidden="true"
                                  className="pointer-events-none absolute top-0 right-0 size-0 border-t-[7px] border-l-[7px] border-t-acento border-l-transparent"
                                />
                              )}
                              {editable ? (
                                <input
                                  value={valor}
                                  inputMode="decimal"
                                  placeholder="%"
                                  aria-label={`Utilidad en porcentaje, partida ${f.ref}`}
                                  aria-invalid={!valida}
                                  onChange={(e) =>
                                    setPorPartida((s) => ({ ...s, [f.p.id]: e.target.value.trim() }))
                                  }
                                  className={`tabular mx-auto block h-6 w-12 rounded-sm border bg-superficie px-0.5 text-center text-[12px] font-bold shadow-sm outline-none hover:border-exito focus:ring-2 focus:ring-acento ${
                                    valida ? 'border-exito/50 text-texto' : 'border-peligro text-peligro'
                                  }`}
                                />
                              ) : (
                                <span className="font-bold">{valor ? `${valor} %` : '—'}</span>
                              )}
                            </td>
                          );
                        return (
                          <td
                            key={c.id}
                            className={`${clases} px-2 whitespace-nowrap group-hover:bg-superficie-2 ${alinear(c)} ${
                              c.grupo === 'venta' ? 'bg-acento-suave/30' : ''
                            } ${c.id === 'tc' && f.p.costo?.moneda !== 'MXN' ? 'bg-aviso-suave/60' : ''}`}
                          >
                            {celda(c, f)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}

          <tfoot className="sticky bottom-0 z-20">
            <tr className="h-8 font-bold">
              <td
                colSpan={2}
                className="sticky left-0 z-10 border-t-2 border-r border-t-texto/25 border-r-borde bg-superficie-2 px-2"
              >
                Totales de la corrida
              </td>
              {columnas.map((c, ci) => {
                const t = totalPie[c.id];
                return (
                  <td
                    key={c.id}
                    className={`tabular border-t-2 border-r border-t-texto/25 border-r-borde ${ci === 0 ? 'border-l border-l-texto/25' : inicioGrupo(ci)} bg-superficie-2 px-2 text-right whitespace-nowrap ${
                      c.grupo === 'utilidad' ? 'text-exito' : c.grupo === 'venta' ? 'text-acento-texto' : ''
                    }`}
                  >
                    {t !== undefined && (validas || c.grupo === 'costo') ? pesos(t) : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>

        {/* Resumen para el cliente: dentro de la hoja (mismo scroll), con el ancho visible. */}
        <section
          aria-label="Resumen para el cliente"
          className="sticky left-0 w-[var(--ancho-visible,100%)] px-3 pt-3 pb-4"
        >
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-bold">Resumen para el cliente</h3>
            <span className="text-xs text-texto-suave">IVA 16 % sobre el subtotal de cada propuesta</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
            {revision.propuestas.map((prop, i) => {
              const c = presentadas?.[i];
              const u = utilidadPropuesta(i);
              const sumadas =
                !prop.es_adicional &&
                presentadas?.some((x) => x.esAdicional && x.lineas.some((l) => l.seSuma));
              return (
                <div key={prop.id} className="flex flex-col rounded-md border border-borde p-3">
                  <div
                    className={`text-[11px] font-bold tracking-wide uppercase ${prop.es_adicional ? 'text-aviso' : 'text-acento-texto'}`}
                  >
                    {prop.nombre}
                  </div>
                  <div className="truncate text-xs text-texto-suave">
                    {c ? `${c.lineas.length} líneas` : `${prop.partidas.length} partidas`}
                    {sumadas ? ' · con adicionales sumados' : ''}
                    {prop.es_adicional ? ' · opcionales salvo «se suma»' : ''}
                  </div>
                  {c ? (
                    <>
                      <dl className="tabular mt-2 space-y-0.5 text-xs">
                        <div className="flex justify-between">
                          <dt className="text-texto-suave">Subtotal</dt>
                          <dd>{pesos(c.totales.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-texto-suave">IVA</dt>
                          <dd>{pesos(c.totales.iva)}</dd>
                        </div>
                        <div className="flex justify-between border-t border-borde pt-1 text-sm font-bold">
                          <dt>Total</dt>
                          <dd>{pesos(c.totales.total)}</dd>
                        </div>
                      </dl>
                      <p className="mt-1.5 mb-2 text-[10px] leading-snug text-texto-suave">
                        {importeConLetra(c.totales.total)}
                      </p>
                      {u && (
                        <div className="tabular mt-auto flex items-center justify-between gap-2 rounded-sm bg-exito-suave px-2 py-1.5 text-xs font-semibold text-exito">
                          <span>Utilidad {u.porcentaje} %</span>
                          <span>{pesos(u.monto)} sin IVA</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-peligro">
                      Falta la utilidad{monedas.length ? ' o el T.C.' : ''} de alguna partida
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <>
      {completa ? (
        // Portal: el contenedor del wizard tiene una animación con transform que encerraría al «fixed».
        createPortal(<div className="fixed inset-0 z-40 bg-fondo p-2">{contenido}</div>, document.body)
      ) : (
        <div ref={area} className="min-h-0">
          {contenido}
        </div>
      )}

      {dialogo === 'autorizar' && (
        <VentanaFlotante titulo="Autorizar y bloquear precios" onCerrar={() => setDialogo(null)}>
          <form onSubmit={autorizar} className="flex flex-col gap-4">
            <dl className="tabular grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-superficie-2 px-4 py-3 text-sm">
              {monedas.map((m) => (
                <div key={m} className="contents">
                  <dt className="text-texto-suave">T.C. {m}</dt>
                  <dd className="text-right font-bold text-aviso">{tcs[m]}</dd>
                </div>
              ))}
              <dt className="text-texto-suave">Costo sin IVA</dt>
              <dd className="text-right">{pesos(costo)}</dd>
              <dt className="text-texto-suave">Utilidad sin IVA</dt>
              <dd className="text-right font-bold text-exito">
                {pesos(utilidad)} · {pct(utilidad, costo)} %
              </dd>
              <dt className="text-texto-suave">Venta sin IVA</dt>
              <dd className="text-right font-bold">{pesos(venta)}</dd>
            </dl>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
              Nota para el ejecutivo (opcional)
              <textarea
                name="nota"
                maxLength={2000}
                rows={3}
                className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm font-normal text-texto outline-none focus:border-acento"
              />
            </label>
            <p className="flex gap-1.5 text-xs text-texto-suave">
              <Icon name="candado" size={14} />
              Al autorizar, partidas, costos y precios quedan bloqueados.
            </p>
            {mensaje?.error && <p className="text-[13px] font-semibold text-peligro">{mensaje.texto}</p>}
            <div className="flex flex-wrap gap-2.5">
              <button
                type="submit"
                disabled={pendiente}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:opacity-60"
              >
                <Icon name="candado" size={16} />
                {pendiente ? 'Autorizando…' : 'Autorizar y bloquear'}
              </button>
              <button
                type="button"
                onClick={() => setDialogo(null)}
                className="min-h-11 cursor-pointer rounded-md px-4 text-sm font-semibold text-texto-suave hover:bg-superficie-2"
              >
                Cancelar
              </button>
            </div>
          </form>
        </VentanaFlotante>
      )}

      {dialogo === 'rechazar' && (
        <VentanaFlotante titulo="Rechazar la cotización" onCerrar={() => setDialogo(null)}>
          <form onSubmit={rechazar} className="flex flex-col gap-4">
            <p className="text-sm text-texto-suave">
              Regresa al ejecutivo para que la corrija y la vuelva a enviar. Verá este motivo en el paso
              «Autorización».
            </p>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
              Motivo del rechazo
              <textarea
                name="motivo"
                required
                maxLength={2000}
                rows={4}
                placeholder="Ej. Pide otra cotización del SSD; el costo es alto."
                className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm font-normal text-texto outline-none focus:border-acento"
              />
            </label>
            {mensaje?.error && <p className="text-[13px] font-semibold text-peligro">{mensaje.texto}</p>}
            <div className="flex flex-wrap gap-2.5">
              <button
                type="submit"
                disabled={pendiente}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-peligro px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                <Icon name="cerrar" size={16} />
                {pendiente ? 'Rechazando…' : 'Rechazar'}
              </button>
              <button
                type="button"
                onClick={() => setDialogo(null)}
                className="min-h-11 cursor-pointer rounded-md px-4 text-sm font-semibold text-texto-suave hover:bg-superficie-2"
              >
                Cancelar
              </button>
            </div>
          </form>
        </VentanaFlotante>
      )}
    </>
  );
}

/** Cifra compacta de la barra superior. */
function Dato({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-texto-suave">{etiqueta}</div>
      <div className={`tabular text-[15px] leading-tight font-bold whitespace-nowrap ${tono ?? ''}`}>
        {valor}
        {detalle && <span className="ml-1.5 text-xs font-semibold">{detalle}</span>}
      </div>
    </div>
  );
}

function BotonBarra({
  icono,
  tono = 'secundario',
  children,
  ...props
}: {
  icono: IconName;
  tono?: 'primario' | 'secundario' | 'peligro';
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const clases = {
    primario: 'bg-acento text-sobre-acento hover:brightness-110',
    secundario: 'border border-borde bg-superficie text-texto hover:bg-superficie-2',
    peligro: 'border border-peligro/40 bg-superficie text-peligro hover:bg-peligro-suave',
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${clases[tono]}`}
    >
      <Icon name={icono} size={15} />
      {children}
    </button>
  );
}

/** Descripción en una sola línea (fila baja, como en Excel); un clic la despliega completa. */
function Descripcion({ f, extra }: { f: FilaCorrida; extra?: string }) {
  const [abierta, setAbierta] = useState(false);
  const etiqueta = {
    partida: null,
    incluida: { texto: 'Incluido', clase: 'bg-neutro-suave text-neutro' },
    visible: { texto: 'Visible', clase: 'bg-info-suave text-info' },
    cargo: { texto: 'Cargo', clase: 'bg-aviso-suave text-aviso' },
  }[f.tipo];
  const sub = f.tipo === 'incluida' || f.tipo === 'visible';
  return (
    <button
      type="button"
      onClick={() => setAbierta((x) => !x)}
      aria-expanded={abierta}
      title={abierta ? 'Contraer' : f.p.descripcion}
      className={`flex w-full cursor-pointer items-center gap-1 py-1 text-left ${sub ? 'pl-3' : ''}`}
    >
      {etiqueta && (
        <span className={`shrink-0 rounded-sm px-1 text-[10px] font-bold ${etiqueta.clase}`}>
          {etiqueta.texto}
        </span>
      )}
      {f.p.se_suma && (
        <span className="shrink-0 rounded-sm bg-info-suave px-1 text-[10px] font-bold text-info">
          Se suma
        </span>
      )}
      {extra && <span className="shrink-0 text-[10px] font-semibold text-aviso">{extra}</span>}
      <span
        className={`min-w-0 flex-1 [&_.texto-enriquecido]:text-[12px] [&_.texto-enriquecido]:leading-tight ${abierta ? 'whitespace-normal' : 'line-clamp-1'}`}
      >
        {f.p.descripcion_contenido != null ? (
          <TextoEnriquecido contenido={f.p.descripcion_contenido} respaldo={f.p.descripcion} />
        ) : (
          <span className="font-semibold">{f.p.descripcion}</span>
        )}
      </span>
    </button>
  );
}
