'use client';

import {
  aEscalado,
  anticipoDe,
  ATAJOS_VIGENCIA,
  calcularPartida,
  esFinDeSemana,
  HORA_VIGENCIA,
  vigenciaSugerida,
  dividirRedondeando,
  ESCALA_PORCENTAJE,
  centavosADecimal,
  conIva,
  ESCALA_DINERO,
  formatearMXN,
  importeConLetra,
  mejoraDePrecio,
  presentarPropuestas,
  sumarPorcentajes,
  variacion,
  type ResultadoPartida,
} from '@celmi/core';
import { fueraDeZona, porcentaje, tipoCambio as tipoCambioSchema, ZONA_ENTREGA } from '@celmi/validation';
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  COLUMNAS,
  GRUPOS,
  MenuColumnas,
  useColumnasOcultas,
  type Columna,
  type Grupo,
} from '@/components/corrida/Corrida';
import { Icon } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Boton, Pill } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import {
  decimal,
  entradaCorrida,
  monedasExtranjeras,
  partidasDeOtroProveedor,
  transaccionPorPartida,
} from '@/lib/corrida';
import type { PartidaFila, RevisionDetalle } from '@/lib/datos';
import { usePreferencia } from '@/lib/preferencias';
import { aLocal, hoyLocal, textoVigencia } from '@/lib/vigencia';
import {
  autorizarRevision,
  cambiarEstadoRevision,
  guardarUtilidades,
  rechazarRevision,
  retirarParaCorregir,
} from '../acciones';
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
/** Utilidad y precio de la Rev anterior de cada partida (sólo como referencia; 2026-10-06). */
export interface ReferenciaCorrida {
  /** «Original», «Rev A»… */
  etiqueta: string;
  porPartida: Record<string, { utilidad?: string; precio?: string }>;
}

/** Columnas centradas (como en Excel, los importes van a la derecha y el texto a la izquierda). */
const CENTRADAS = new Set(['cantidad', 'unidad', 'moneda', 'tc', 'utilidadPct', 'entrega', 'vigenciaPrecio']);

const fechaCorta = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Estado de la vigencia del costo de una partida frente a hoy y a la vigencia de la cotización (2026-10-08):
 * vencido, vence antes que la cotización o vigente.
 */
function estadoVigenciaPrecio(fecha: string | null | undefined, hoy: string, vigenciaCotizacion: string) {
  if (!fecha) return null;
  if (fecha < hoy) return 'vencido' as const;
  if (vigenciaCotizacion && fecha < vigenciaCotizacion) return 'antes' as const;
  return 'vigente' as const;
}

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

/** T.C. inicial por moneda: el ya guardado (o el de la Rev anterior); si no hay, lo captura quien autoriza (0027). */
function tiposCambioIniciales(revision: RevisionDetalle, guardados: Record<string, string>) {
  return Object.fromEntries(monedasExtranjeras(revision).map((m) => [m, guardados[m] ?? '']));
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
  referencia,
  puedeAutorizar,
  puedeRetirar,
  solicitante,
  capturista,
  estadoEntrega,
  ciudadEntrega,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  catalogos: Catalogos;
  utilidadesIniciales: Record<string, string>;
  tiposCambioIniciales: Record<string, string>;
  referencia?: ReferenciaCorrida | null;
  puedeAutorizar: boolean;
  /** Quien preparó la cotización puede retirarla mientras espera. */
  puedeRetirar: boolean;
  solicitante: string | null;
  /** Quien creó la revisión (recibe el aviso si se retira para corregir). */
  capturista: string | null;
  /** Estado de entrega de la oportunidad (0024); fuera de la zona habitual se avisa. */
  estadoEntrega: string | null;
  /** Texto libre anterior a 0024, sólo como referencia si aún no hay estado. */
  ciudadEntrega: string;
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
  // Parámetros y cifras plegables para dar más alto a la hoja (2026-10-09); se recuerda en este navegador.
  const [plegadoGuardado, guardarPlegado] = usePreferencia('celmi-corrida-plegada');
  const plegado = plegadoGuardado === '1';
  const [dialogo, setDialogo] = useState<'autorizar' | 'rechazar' | 'retirar' | null>(null);
  // Avisos (2026-10-08): contador rojo que parpadea hasta abrirlo, filas marcadas y confirmación al autorizar.
  const [verAvisos, setVerAvisos] = useState(false);
  const [avisosVistos, setAvisosVistos] = useState(false);
  const [confirmados, setConfirmados] = useState<Set<string>>(new Set());
  const [devolver, setDevolver] = useState(false);
  /** Fila resaltada un momento al saltar a ella desde el aviso de revisión. */
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const area = useRef<HTMLDivElement>(null);
  const menuDevolver = useRef<HTMLDivElement>(null);
  const menuAvisos = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!verAvisos) return;
    const fuera = (e: MouseEvent) => {
      if (!menuAvisos.current?.contains(e.target as Node)) setVerAvisos(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVerAvisos(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [verAvisos]);
  useEffect(() => {
    if (!devolver) return;
    const fuera = (e: MouseEvent) => {
      if (!menuDevolver.current?.contains(e.target as Node)) setDevolver(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDevolver(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [devolver]);
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
  // Anticipo (adquisición) y transaccionalidad (arrendamiento con otro mayorista), 2026-10-07.
  const texto = (v: number | string | null) => (v == null ? '' : String(Number(v)));
  const [anticipo, setAnticipo] = useState(texto(revision.anticipo_pct));
  const [transaccion, setTransaccion] = useState(texto(revision.transaccion_pct));
  const [alcance, setAlcance] = useState<'todas' | 'diferentes' | null>(revision.transaccion_alcance);
  // Vigencia de la cotización: la fija quien autoriza (0027); fecha y hora, 14:00 por omisión, nunca en fin de semana.
  const [vigencia, setVigencia] = useState(aLocal(revision.vigencia_hasta));
  const fechaVigencia = vigencia.slice(0, 10);
  const horaVigencia = vigencia.slice(11, 16) || HORA_VIGENCIA;
  let vigenciaEnFinDeSemana = false;
  try {
    vigenciaEnFinDeSemana = Boolean(fechaVigencia) && esFinDeSemana(fechaVigencia);
  } catch {
    vigenciaEnFinDeSemana = false;
  }
  const vigenciaIso = vigencia && !Number.isNaN(Date.parse(vigencia)) ? new Date(vigencia).toISOString() : '';
  const vigenciaValida = Boolean(vigenciaIso) && !vigenciaEnFinDeSemana;
  const [datosBase] = useState(() =>
    JSON.stringify([
      texto(revision.anticipo_pct),
      texto(revision.transaccion_pct),
      revision.transaccion_alcance,
      aLocal(revision.vigencia_hasta),
    ]),
  );
  const esAdquisicion = revision.esquema === 'adquisicion';
  const diferentes = partidasDeOtroProveedor(revision);
  const conTransaccion =
    revision.esquema === 'arrendamiento' && (diferentes.length > 0 || Boolean(transaccion));
  const anticipoValido =
    !esAdquisicion || (porcentaje.safeParse(anticipo).success && Number(anticipo) <= 100);
  const transaccionValida =
    !transaccion || (porcentaje.safeParse(transaccion).success && Number(transaccion) <= 100);
  const falsaAlcance = Number(transaccion) > 0 && !alcance;
  const transacciones = transaccionValida ? transaccionPorPartida(revision, transaccion, alcance) : {};
  const datosAutorizacion = {
    anticipo_pct: esAdquisicion ? anticipo : '',
    transaccion_pct: revision.esquema === 'arrendamiento' ? transaccion : '',
    transaccion_alcance: Number(transaccion) > 0 ? alcance : null,
    vigencia_hasta: vigenciaIso,
  };
  const sucio =
    editable &&
    (JSON.stringify([porPartida, tcs]) !== base ||
      general !== '' ||
      JSON.stringify([anticipo, transaccion, alcance, vigencia]) !== datosBase);

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
      if (
        e.key === 'Escape' &&
        completa &&
        !devolver &&
        !verAvisos &&
        !document.querySelector('dialog[open]')
      )
        guardarCompleta(null);
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
  }, [completa, sucio, guardarCompleta, devolver, verAvisos]);

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
        const t = transacciones[p.id];
        resultados.set(
          p.id,
          calcularPartida({
            ...p,
            utilidadPct: t ? sumarPorcentajes(utilidadDe(p.id), t) : utilidadDe(p.id),
          }),
        );
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

  // Transaccionalidad en pesos (costo × %): va aparte de la utilidad para que se vea la utilidad real.
  const escala = 100n * 10n ** BigInt(ESCALA_PORCENTAJE);
  const transaccionDe = (id: string, base: bigint | undefined) => {
    const t = transacciones[id];
    if (!t || base === undefined) return 0n;
    try {
      return dividirRedondeando(base * BigInt(Math.round(Number(t) * 10 ** ESCALA_PORCENTAJE)), escala);
    } catch {
      return 0n;
    }
  };
  const transaccionTotal = [...costos.entries()].reduce(
    (s, [id, k]) => s + transaccionDe(id, k.costoTotal),
    0n,
  );
  const lista = [...resultados.values()].filter((r): r is ResultadoPartida => r !== null);
  const costo = [...costos.values()].reduce((s, r) => s + r.costoTotal, 0n);
  const venta = lista.reduce((s, r) => s + r.importe, 0n);
  const utilidad = venta - costo - transaccionTotal;
  const principales = presentadas?.filter((p) => !p.esAdicional).map((p) => p.totales.total) ?? [];
  const numAdicionales = revision.propuestas.filter((p) => p.es_adicional).length;
  const generalValida = general === '' || porcentaje.safeParse(general).success;

  // Precio = costo × T.C. + utilidad (% sobre el costo en pesos); en pesos el T.C. es 1 y no se modifica (2026-10-06).
  const conCliente = todas.some((p) => p.presentacion !== 'linea');
  const disponibles = COLUMNAS.flatMap((c) =>
    c.id === 'utilidadPct' && conTransaccion
      ? [
          c,
          { id: 'transPct', titulo: 'Transaccionalidad %', grupo: 'utilidad', numero: true } as Columna,
          {
            id: 'transMonto',
            titulo: 'Transaccionalidad $ total',
            grupo: 'utilidad',
            numero: true,
          } as Columna,
          ...(referencia
            ? [
                {
                  id: 'utilidadAnt',
                  titulo: `Utilidad ${referencia.etiqueta}`,
                  grupo: 'utilidad',
                  numero: true,
                } as Columna,
              ]
            : []),
        ]
      : c.id === 'pvUnit'
        ? [
            c,
            ...(conCliente ? [COLUMNA_CLIENTE] : []),
            ...(referencia
              ? [
                  {
                    id: 'pvAnt',
                    titulo: `P.U. ${referencia.etiqueta} sin IVA`,
                    grupo: 'venta',
                    numero: true,
                  } as Columna,
                ]
              : []),
          ]
        : c.id === 'utilidadPct' && referencia
          ? [
              c,
              {
                id: 'utilidadAnt',
                titulo: `Utilidad ${referencia.etiqueta}`,
                grupo: 'utilidad',
                numero: true,
              } as Columna,
            ]
          : [c],
  );
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
  // Cargos prorrateados y adicionales: llaman la atención de quien autoriza para revisarlos a detalle (2026-10-06).
  const especiales = filasPorPropuesta.flat().filter((f) => f.tipo !== 'partida');
  const cuenta = (t: FilaCorrida['tipo']) => especiales.filter((f) => f.tipo === t).length;
  const resumenEspeciales = (() => {
    const cargos = cuenta('cargo');
    const incluidos = cuenta('incluida');
    const visibles = cuenta('visible');
    const adicionales = incluidos + visibles;
    const partes: string[] = [];
    if (cargos) partes.push(`${cargos} ${cargos === 1 ? 'cargo prorrateado' : 'cargos prorrateados'}`);
    if (adicionales) {
      const detalle = [
        incluidos ? `${incluidos} ${incluidos === 1 ? 'incluido' : 'incluidos'} en su partida` : '',
        visibles ? `${visibles} ${visibles === 1 ? 'visible' : 'visibles'}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      partes.push(`${adicionales} ${adicionales === 1 ? 'adicional' : 'adicionales'} (${detalle})`);
    }
    return partes.join(' y ');
  })();
  const irAFila = (id: string) => {
    document
      .getElementById(`fila-${id}`)
      ?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    setResaltada(id);
    window.setTimeout(() => setResaltada((r) => (r === id ? null : r)), 2200);
  };

  /** Utilidad de lo que paga el cliente en cada propuesta: subtotal menos el costo de lo que incluye. */
  const utilidadPropuesta = (i: number) => {
    const c = presentadas?.[i];
    if (!c) return null;
    const costoDe = (id: string) =>
      (costos.get(id)?.costoTotal ?? 0n) + transaccionDe(id, costos.get(id)?.costoTotal);
    const costoDeLinea = (l: { partidaId: string; incluidas: string[] }) =>
      [l.partidaId, ...l.incluidas].reduce((s, id) => s + costoDe(id), 0n);
    let costoProp = c.lineas.reduce((s, l) => s + costoDeLinea(l), 0n);
    costoProp += c.cargos.reduce((s, x) => s + costoDe(x.partidaId), 0n);
    if (!c.esAdicional)
      for (const a of presentadas?.filter((x) => x.esAdicional) ?? [])
        costoProp += a.lineas.filter((l) => l.seSuma).reduce((s, l) => s + costoDeLinea(l), 0n);
    const monto = c.totales.subtotal - costoProp;
    return { monto, porcentaje: pct(monto, costoProp) };
  };

  /**
   * `cierra`: la decisión termina la revisión en esta pantalla (autorizar, rechazar, retirar). Se sale de pantalla
   * completa: la revisión pasa a sólo lectura y la capa a pantalla completa se quedaba trabada (2026-10-07).
   */
  const resultado = (r: { error?: string; ok?: string }, cierra = false) => {
    setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
    if (!r.error) {
      setGeneral('');
      setDialogo(null);
      setDevolver(false);
      if (cierra) guardarCompleta(null);
    }
  };

  // El aviso de éxito se va solo; los errores se quedan hasta cerrarlos.
  useEffect(() => {
    if (!mensaje || mensaje.error) return;
    const t = window.setTimeout(() => setMensaje(null), 5000);
    return () => window.clearTimeout(t);
  }, [mensaje]);

  const guardarAvance = () =>
    iniciar(async () =>
      resultado(
        await guardarUtilidades(
          revision.id,
          cotizacionId,
          Object.fromEntries(Object.entries(efectivas).filter(([, v]) => porcentaje.safeParse(v).success)),
          Object.fromEntries(Object.entries(tcs).filter(([, v]) => tipoCambioSchema.safeParse(v).success)),
          {
            anticipo_pct: anticipoValido ? datosAutorizacion.anticipo_pct : '',
            transaccion_pct: transaccionValida ? datosAutorizacion.transaccion_pct : '',
            transaccion_alcance: transaccionValida ? datosAutorizacion.transaccion_alcance : null,
            vigencia_hasta: vigenciaValida ? vigenciaIso : '',
          },
        ),
      ),
    );

  const autorizar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const nota = String(new FormData(e.currentTarget).get('nota') ?? '');
    iniciar(async () =>
      resultado(
        await autorizarRevision(revision.id, cotizacionId, efectivas, tcs, nota, datosAutorizacion),
        true,
      ),
    );
  };

  const rechazar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '');
    iniciar(async () => resultado(await rechazarRevision(revision.id, cotizacionId, motivo), true));
  };

  const retirar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '');
    iniciar(async () => resultado(await retirarParaCorregir(revision.id, cotizacionId, motivo), true));
  };

  const celda = (col: Columna, f: FilaCorrida): ReactNode => {
    const { p } = f;
    const r = resultados.get(p.id);
    const k = costos.get(p.id);
    const v = (c: bigint | undefined) =>
      c === undefined ? <span className="text-texto-suave">—</span> : pesos(c);
    switch (col.id) {
      case 'marca':
        return p.marca || '—';
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
        // Sin cambio de costo no se marca nada (2026-10-08: aparecía «▲ 0.0 %»).
        if (p.costo.costo_anterior != null && decimal(p.costo.costo_anterior, 2) !== unitario) {
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
      case 'vigenciaPrecio': {
        const fecha = p.costo?.vigencia;
        if (!fecha) return <span className="text-texto-suave">Sin fecha</span>;
        const estado = estadoVigenciaPrecio(fecha, hoyLocal(), fechaVigencia);
        const texto = fechaCorta.format(new Date(`${fecha}T00:00:00Z`));
        return estado === 'vencido' ? (
          <span
            title="El precio del mayorista ya venció"
            className="rounded-sm bg-peligro px-1.5 py-0.5 text-[11px] font-bold text-white"
          >
            {texto} · vencido
          </span>
        ) : estado === 'antes' ? (
          <span
            title="El precio del mayorista vence antes que la cotización"
            className="rounded-sm bg-aviso-suave px-1.5 py-0.5 text-[11px] font-bold text-aviso"
          >
            {texto}
          </span>
        ) : (
          texto
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
      case 'transPct':
        return transacciones[p.id] ? (
          <span className="font-semibold text-aviso">{transacciones[p.id]} %</span>
        ) : (
          <span className="text-texto-suave">—</span>
        );
      case 'transMonto':
        return transacciones[p.id] ? (
          <span className="text-aviso">{pesos(transaccionDe(p.id, k?.costoTotal))}</span>
        ) : (
          <span className="text-texto-suave">—</span>
        );
      case 'utilidadUnit':
        return (
          <span className="text-exito">
            {v(r ? r.utilidadUnitaria - transaccionDe(p.id, k?.costoUnitarioMXN) : undefined)}
          </span>
        );
      case 'utilidadTotal':
        return (
          <span className="font-semibold text-exito">
            {v(r ? r.utilidadTotal - transaccionDe(p.id, k?.costoTotal) : undefined)}
          </span>
        );
      case 'utilidadTotalIva':
        return (
          <span className="text-exito">
            {v(r ? conIva(r.utilidadTotal - transaccionDe(p.id, k?.costoTotal)) : undefined)}
          </span>
        );
      case 'pvUnit':
        return <span className="font-bold text-acento-texto">{v(r?.precioUnitario)}</span>;
      case 'pvCliente': {
        const l = f.tipo === 'partida' || f.tipo === 'visible' ? lineaDe.get(p.id) : undefined;
        return l ? <span className="font-bold text-acento-texto">{pesos(l.precioUnitario)}</span> : null;
      }
      case 'utilidadAnt': {
        const u = referencia?.porPartida[p.id]?.utilidad;
        return u ? (
          <span className="text-texto-suave">{u} %</span>
        ) : (
          <span className="text-texto-suave">—</span>
        );
      }
      case 'pvAnt': {
        const antes = referencia?.porPartida[p.id]?.precio;
        if (!antes)
          return <span className="text-texto-suave">{referencia?.porPartida[p.id] ? '—' : 'Nueva'}</span>;
        const cambio = r ? variacion(antes, centavosADecimal(r.precioUnitario)) : null;
        return (
          <>
            {cambio && Number(cambio) !== 0 && (
              <span
                className={`mr-1.5 rounded-sm px-1 text-[11px] font-bold ${cambio.startsWith('-') ? 'bg-exito-suave text-exito' : 'bg-aviso-suave text-aviso'}`}
              >
                {cambio.startsWith('-') ? '▼' : '▲'} {cambio.replace('-', '')} %
              </span>
            )}
            <span className="text-texto-suave">{pesos(aEscalado(antes, ESCALA_DINERO))}</span>
          </>
        );
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
    transMonto: transaccionTotal,
    venta,
    ventaIva: conIva(venta),
  };

  // Rejilla tipo Excel: cada celda con borde derecho e inferior; el cambio de grupo, un poco más marcado.
  const borde = 'border-r border-b border-borde';
  const inicioGrupo = (i: number) =>
    i > 0 && columnas[i - 1]?.grupo !== columnas[i]?.grupo ? 'border-l border-l-texto/25' : '';
  const alinear = (c: Columna) =>
    CENTRADAS.has(c.id) ? 'text-center' : c.numero ? 'tabular text-right' : 'text-left';
  const fija1 = 'sticky left-0 z-10 w-16 min-w-16';
  const fija2 = 'sticky left-16 z-10 w-72 min-w-72 max-w-72';

  const estadoPill =
    revision.estado === 'autorizada' || revision.estado === 'emitida' ? (
      <Pill tono="exito">Precios autorizados</Pill>
    ) : revision.estado === 'rechazada' ? (
      <Pill tono="peligro">Rechazada</Pill>
    ) : (
      <Pill tono="aviso">Pendiente de autorización</Pill>
    );

  // Avisos para quien autoriza: fuera de zona, otro proveedor y «revisa a detalle».
  const mayoristaArrendamiento =
    catalogos.mayoristas.find((m) => m.id === revision.mayorista_arrendamiento_id)?.nombre ??
    'el mayorista del arrendamiento';
  const avisos: {
    id: string;
    tono: 'peligro' | 'aviso';
    titulo: string;
    detalle: string;
    filas?: { id: string; ref: string; descripcion: string; tipo?: FilaCorrida['tipo'] }[];
  }[] = [];
  if (fueraDeZona(estadoEntrega))
    avisos.push({
      id: 'zona',
      tono: 'peligro',
      titulo: estadoEntrega ? `Entrega en ${estadoEntrega}` : 'Sin estado de entrega',
      detalle: estadoEntrega
        ? `Fuera de la zona habitual (${ZONA_ENTREGA.join(', ')}): considera fletes, viáticos o costos adicionales.`
        : `${ciudadEntrega ? `Dato anterior: «${ciudadEntrega}». ` : ''}Revisa si la entrega es fuera de ${ZONA_ENTREGA.join(', ')}.`,
    });
  if (diferentes.length > 0)
    avisos.push({
      id: 'proveedor',
      tono: 'aviso',
      titulo: `Otro proveedor que ${mayoristaArrendamiento}`,
      detalle: `El arrendamiento es con ${mayoristaArrendamiento}; ${diferentes.length} ${diferentes.length === 1 ? 'partida es' : 'partidas son'} de otro proveedor. Considera el % de transaccionalidad.`,
      filas: diferentes.map((pa) => ({
        id: pa.id,
        ref: refDe.get(pa.id) ?? pa.sku,
        descripcion: pa.descripcion,
      })),
    });
  if (especiales.length > 0)
    avisos.push({
      id: 'especiales',
      tono: 'aviso',
      titulo: 'Revisa a detalle',
      detalle: `Esta cotización tiene ${resumenEspeciales}.`,
      filas: especiales.map((f) => ({ id: f.p.id, ref: f.ref, descripcion: f.p.descripcion, tipo: f.tipo })),
    });

  // Precios del mayorista vencidos o que vencen antes que la cotización (2026-10-08).
  const conPrecioVencido = todas.filter(
    (pa) => estadoVigenciaPrecio(pa.costo?.vigencia, hoyLocal(), fechaVigencia) === 'vencido',
  );
  const conPrecioAntes = todas.filter(
    (pa) => estadoVigenciaPrecio(pa.costo?.vigencia, hoyLocal(), fechaVigencia) === 'antes',
  );
  if (conPrecioVencido.length + conPrecioAntes.length > 0)
    avisos.push({
      id: 'vigencias',
      tono: conPrecioVencido.length ? 'peligro' : 'aviso',
      titulo: conPrecioVencido.length
        ? 'Precios de mayorista vencidos'
        : 'Precios que vencen antes que la cotización',
      detalle:
        [
          conPrecioVencido.length ? `${conPrecioVencido.length} con el precio del mayorista ya vencido` : '',
          conPrecioAntes.length
            ? `${conPrecioAntes.length} vencen antes que la vigencia de la cotización`
            : '',
        ]
          .filter(Boolean)
          .join('; ') + '. Confirma el costo con el mayorista.',
      filas: [...conPrecioVencido, ...conPrecioAntes].map((pa) => ({
        id: pa.id,
        ref: refDe.get(pa.id) ?? pa.sku,
        descripcion: pa.descripcion,
      })),
    });

  // Filas señaladas por un aviso: llevan franja, campana y etiqueta en la propia hoja (propuesta 2, 2026-10-08).
  const avisoDeFila = new Map<string, string>();
  for (const pa of diferentes) avisoDeFila.set(pa.id, 'Otro proveedor');
  for (const f of especiales) if (!avisoDeFila.has(f.p.id)) avisoDeFila.set(f.p.id, 'Revisa a detalle');
  for (const pa of conPrecioVencido) avisoDeFila.set(pa.id, 'Precio vencido');
  for (const pa of conPrecioAntes) if (!avisoDeFila.has(pa.id)) avisoDeFila.set(pa.id, 'Precio vence antes');
  const atajos = ATAJOS_VIGENCIA.map((a) => ({ ...a, fecha: vigenciaSugerida(hoyLocal(), a.dias) }));

  const contenido = (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-borde bg-superficie">
      {/* Renglón 1: estado, avisos y decisión. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borde px-4 py-2.5">
        <h2 className="text-[15px] font-bold tracking-tight">Corrida de precios</h2>
        {estadoPill}
        {avisos.length > 0 && (
          <div ref={menuAvisos} className="relative">
            <button
              type="button"
              onClick={() => {
                setVerAvisos((x) => !x);
                setAvisosVistos(true);
              }}
              aria-expanded={verAvisos}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-pill bg-peligro px-3 text-xs font-bold text-white transition-transform hover:brightness-110 ${
                avisosVistos ? '' : 'animate-pulse'
              }`}
            >
              <Icon name="campana" size={14} strokeWidth={2.4} />
              {avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}
              <Icon name={verAvisos ? 'arriba' : 'abajo'} size={12} strokeWidth={2.6} />
            </button>
            {verAvisos && (
              <div
                role="dialog"
                aria-label="Avisos de esta cotización"
                className="animar-entrada absolute top-full left-0 z-40 mt-1.5 w-[min(440px,calc(100vw-2rem))] rounded-lg border border-borde bg-superficie p-2 sombra"
              >
                {avisos.map((a) => (
                  <div key={a.id} className="flex gap-3 rounded-md px-3 py-2.5">
                    <span
                      className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white ${
                        a.tono === 'peligro' ? 'bg-peligro' : 'bg-aviso'
                      }`}
                    >
                      <Icon name="campana" size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold">{a.titulo}</div>
                      <div className="text-xs text-texto-suave">{a.detalle}</div>
                      {a.filas && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {a.filas.map((x) => (
                            <button
                              key={x.id}
                              type="button"
                              onClick={() => {
                                setVerAvisos(false);
                                irAFila(x.id);
                              }}
                              title={`Ir a ${x.ref}: ${x.descripcion}`}
                              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm border border-aviso/40 px-2 text-[11px] font-bold text-aviso tabular hover:bg-aviso-suave"
                            >
                              {x.ref}
                              <Icon name="derecha" size={11} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {/*
            Cifras en dos renglones, junto a la decisión (2026-10-08). La transaccionalidad va aparte: no entra en la
            utilidad (ni en monto ni en %).
          */}
          <div
            className={`grid shrink-0 grid-flow-col grid-rows-2 gap-x-4 gap-y-1 border-l border-borde pl-3 ${plegado ? 'hidden' : ''}`}
          >
            <Dato etiqueta="Costo sin IVA" valor={pesos(costo)} />
            <Dato etiqueta="Venta sin IVA" valor={validas ? pesos(venta) : '—'} tono="text-acento-texto" />
            <Dato
              etiqueta="Utilidad sin IVA"
              valor={validas ? pesos(utilidad) : '—'}
              detalle={validas ? `${pct(utilidad, costo)} %` : undefined}
              tono="text-exito"
            />
            <Dato
              etiqueta={`Al cliente con IVA${numAdicionales ? ` (+${numAdicionales} adic.)` : ''}`}
              valor={
                principales.length === 0
                  ? '—'
                  : principales.length === 1
                    ? pesos(principales[0] ?? 0n)
                    : `${pesos(principales.reduce((a, b) => (b < a ? b : a)))} – ${pesos(principales.reduce((a, b) => (b > a ? b : a)))}`
              }
            />
            {conTransaccion && (
              <Dato
                etiqueta="Transaccionalidad sin IVA"
                valor={pesos(transaccionTotal)}
                detalle={Number(transaccion) > 0 ? `${transaccion} %` : undefined}
                tono="text-aviso"
              />
            )}
          </div>
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <Boton tamano="chico" icono="guardado" disabled={pendiente || !sucio} onClick={guardarAvance}>
                Guardar avance
              </Boton>
              {/* Retirar y rechazar en un solo menú: menos botones a la vista (2026-10-07). */}
              <div ref={menuDevolver} className="relative">
                <Boton
                  tamano="chico"
                  variante="peligro"
                  icono="izquierda"
                  iconoFinal="abajo"
                  disabled={pendiente}
                  aria-expanded={devolver}
                  aria-haspopup="menu"
                  onClick={() => setDevolver((x) => !x)}
                >
                  Devolver
                </Boton>
                {devolver && (
                  <div
                    role="menu"
                    className="animar-entrada absolute top-full right-0 z-40 mt-1.5 w-80 rounded-lg border border-borde bg-superficie p-1.5 sombra"
                  >
                    {(
                      [
                        {
                          id: 'retirar',
                          titulo: 'Retirar para corregir',
                          detalle: `Regresa a borrador. Se avisa a ${[capturista, solicitante].filter((x, i, xs) => x && xs.indexOf(x) === i).join(' y ') || 'quien la preparó'}.`,
                          icono: 'izquierda',
                        },
                        {
                          id: 'rechazar',
                          titulo: 'Rechazar',
                          detalle: 'Queda rechazada con el motivo que escribas.',
                          icono: 'cerrar',
                        },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setDevolver(false);
                          setDialogo(o.id);
                        }}
                        className="flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-superficie-2"
                      >
                        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-peligro-suave text-peligro">
                          <Icon name={o.icono} size={14} />
                        </span>
                        <span>
                          <span className="block text-[13px] font-semibold">{o.titulo}</span>
                          <span className="block text-xs text-texto-suave">{o.detalle}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Boton
                tamano="chico"
                icono="candado"
                variante="primario"
                disabled={
                  pendiente ||
                  !validas ||
                  !tcsValidos ||
                  !anticipoValido ||
                  !transaccionValida ||
                  falsaAlcance ||
                  !vigenciaValida
                }
                onClick={() => {
                  setConfirmados(new Set());
                  setDialogo('autorizar');
                }}
                title={
                  !vigenciaValida
                    ? 'Define la vigencia de la cotización'
                    : validas && tcsValidos
                      ? undefined
                      : `Define ${monedas.length ? 'el T.C. y ' : ''}la utilidad de todas las partidas`
                }
              >
                Autorizar
              </Boton>
            </div>
          )}
        </div>
      </div>

      {/*
        Renglón 2 (propuesta C, 2026-10-08): tarjetas de parámetros siempre visibles y editables, y las cifras a la
        derecha en el mismo bloque.
      */}
      <div
        className={`flex flex-wrap items-stretch gap-2 border-b border-borde bg-superficie-2/60 px-3 py-2.5 ${plegado ? 'hidden' : ''}`}
      >
        <Tarjeta2
          borde={vigenciaValida ? 'border-acento/40' : 'border-peligro/60'}
          etiqueta="Vigencia"
          ayuda={
            vigenciaEnFinDeSemana
              ? 'No puede caer en sábado ni domingo'
              : vigenciaValida
                ? undefined
                : 'Obligatoria para autorizar'
          }
          error={!vigenciaValida}
        >
          <input
            type="date"
            aria-label="Fecha de vigencia"
            value={fechaVigencia}
            disabled={!editable}
            autoComplete="off"
            aria-invalid={!vigenciaValida}
            onChange={(e) => setVigencia(e.target.value ? `${e.target.value}T${horaVigencia}` : '')}
            className={`${controlParametro} w-[128px] font-bold ${vigenciaValida ? '' : 'border-peligro'}`}
          />
          {/* Hora en 24 h (el control nativo la mostraba como «02:00» sin a. m./p. m.). */}
          <select
            aria-label="Hora de vigencia"
            value={horaVigencia}
            disabled={!editable || !fechaVigencia}
            onChange={(e) => setVigencia(fechaVigencia ? `${fechaVigencia}T${e.target.value}` : '')}
            className={`${controlParametro} tabular w-[74px] cursor-pointer`}
          >
            {(HORAS.includes(horaVigencia) ? HORAS : [...HORAS, horaVigencia].sort()).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          {editable && (
            <select
              aria-label="Atajos de vigencia"
              title="Atajos de vigencia (a las 14:00 h)"
              value=""
              onChange={(e) => e.target.value && setVigencia(`${e.target.value}T${HORA_VIGENCIA}`)}
              className={`${controlParametro} w-[76px] cursor-pointer text-texto-suave`}
            >
              <option value="">Atajos</option>
              {atajos.map((a) => (
                <option key={a.dias} value={a.fecha}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          )}
        </Tarjeta2>

        <Tarjeta2
          borde={tcsValidos ? 'border-aviso/50' : 'border-peligro/60'}
          etiqueta="Tipo de cambio"
          ayuda={monedas.length ? undefined : 'Todo en pesos'}
          error={!tcsValidos}
        >
          <span
            title="En pesos mexicanos el tipo de cambio es 1 y no se modifica"
            className="inline-flex h-10 items-center gap-1 text-xs font-semibold text-texto-suave"
          >
            <Icon name="candado" size={11} />
            MXN <strong className="text-texto">1</strong>
          </span>
          {monedas.map((m) => {
            const valido = tipoCambioSchema.safeParse(tcs[m] ?? '').success;
            return (
              <label key={m} className="inline-flex items-center gap-1 text-xs font-bold text-aviso">
                {m}
                <input
                  value={tcs[m] ?? ''}
                  disabled={!editable}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00000"
                  aria-label={`Tipo de cambio ${m}`}
                  aria-invalid={!valido}
                  onChange={(e) => setTcs((s) => ({ ...s, [m]: e.target.value.replace(/[^\d.]/g, '') }))}
                  className={`${controlParametro} tabular w-[92px] text-center font-bold ${valido ? '' : 'border-peligro'}`}
                />
              </label>
            );
          })}
        </Tarjeta2>

        {editable && (
          <Tarjeta2 borde="border-exito/50" etiqueta="Utilidad general">
            <CampoPorcentaje
              valor={general}
              onCambio={(v) => setGeneral(v.trim())}
              valido={generalValida}
              placeholder="13.5"
              etiqueta="Utilidad general"
              ancho="w-[76px]"
            />
            <Boton
              tamano="chico"
              variante="exito"
              onClick={() => setPorPartida({})}
              disabled={!general || !generalValida}
              title="Aplicar a todas las partidas"
            >
              Aplicar
            </Boton>
          </Tarjeta2>
        )}

        {esAdquisicion && (
          <Tarjeta2
            borde={anticipoValido && anticipo ? 'border-info/50' : 'border-peligro/60'}
            etiqueta="Anticipo"
            ayuda="Del total con IVA"
            error={!(anticipoValido && anticipo)}
          >
            <CampoPorcentaje
              valor={anticipo}
              onCambio={(v) => setAnticipo(v.replace(/[^\d.]/g, ''))}
              valido={anticipoValido}
              placeholder="50"
              etiqueta="Anticipo"
              deshabilitado={!editable}
              ancho="w-[76px]"
            />
          </Tarjeta2>
        )}

        {conTransaccion && (
          <Tarjeta2
            borde={falsaAlcance ? 'border-peligro/60' : 'border-aviso/50'}
            etiqueta="Transaccionalidad"
            ayuda={falsaAlcance ? '¿A qué partidas aplica?' : undefined}
            error={falsaAlcance}
          >
            <CampoPorcentaje
              valor={transaccion}
              onCambio={(v) => setTransaccion(v.replace(/[^\d.]/g, ''))}
              valido={transaccionValida}
              placeholder="3"
              etiqueta="Transaccionalidad"
              deshabilitado={!editable}
              ancho="w-[64px]"
            />
            {Number(transaccion) > 0 && (
              <div
                role="radiogroup"
                aria-label="¿A qué partidas aplica?"
                className={`inline-flex h-10 rounded-sm border p-0.5 ${falsaAlcance ? 'border-peligro' : 'border-borde'}`}
              >
                {(
                  [
                    ['todas', 'Todas'],
                    ['diferentes', `Otro prov. (${diferentes.length})`],
                  ] as const
                ).map(([id, nombre]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={alcance === id}
                    disabled={!editable}
                    onClick={() => setAlcance(id)}
                    className={`cursor-pointer rounded-[3px] px-2 text-[11px] font-semibold transition-colors ${
                      alcance === id ? 'bg-aviso text-white' : 'text-texto-suave hover:text-texto'
                    }`}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
            )}
          </Tarjeta2>
        )}
      </div>

      {/* Renglón 3: la entrega fuera de zona no está en una fila: va en una banda roja. */}
      {fueraDeZona(estadoEntrega) && (
        <div
          role="note"
          className="flex items-center gap-2.5 border-b border-peligro bg-peligro px-4 py-2 text-[13px] text-white"
        >
          <Icon name="campana" size={16} strokeWidth={2.4} className="shrink-0" />
          <span>
            <strong>{estadoEntrega ? `Entrega en ${estadoEntrega}` : 'Sin estado de entrega'}:</strong>{' '}
            {avisos.find((a) => a.id === 'zona')?.detalle}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-borde px-3 py-1.5">
        <button
          type="button"
          onClick={() => guardarPlegado(plegado ? null : '1')}
          aria-expanded={!plegado}
          title={plegado ? 'Mostrar parámetros y cifras' : 'Plegar parámetros y cifras para ver más filas'}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-borde bg-superficie px-2.5 text-xs font-semibold text-texto hover:bg-superficie-2"
        >
          <Icon name={plegado ? 'abajo' : 'arriba'} size={13} strokeWidth={2.6} />
          {plegado ? 'Mostrar parámetros' : 'Plegar'}
        </button>
        {plegado && (
          // Resumen en una línea: lo que falta, en rojo, y las cifras clave.
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {[
              vigenciaValida
                ? { t: `Vigencia ${textoVigencia(vigenciaIso)}` }
                : { t: 'Falta la vigencia', falta: true },
              ...monedas.map((m) =>
                tipoCambioSchema.safeParse(tcs[m] ?? '').success
                  ? { t: `T.C. ${m} ${tcs[m]}` }
                  : { t: `Falta el T.C. ${m}`, falta: true },
              ),
              ...(esAdquisicion && !(anticipoValido && anticipo)
                ? [{ t: 'Falta el anticipo', falta: true }]
                : []),
              {
                t: `Utilidad ${validas ? `${pesos(utilidad)} · ${pct(utilidad, costo)} %` : '—'}`,
                exito: true,
              },
              ...(conTransaccion ? [{ t: `Transacc. ${pesos(transaccionTotal)}` }] : []),
            ].map((x: { t: string; falta?: boolean; exito?: boolean }) => (
              <button
                key={x.t}
                type="button"
                onClick={() => guardarPlegado(null)}
                className={`inline-flex h-7 shrink-0 cursor-pointer items-center rounded-pill border px-2.5 text-xs font-semibold whitespace-nowrap ${
                  x.falta
                    ? 'border-peligro/40 bg-peligro-suave text-peligro'
                    : x.exito
                      ? 'border-exito/30 bg-exito-suave text-exito'
                      : 'border-borde bg-superficie text-texto hover:bg-superficie-2'
                }`}
              >
                {x.t}
              </button>
            ))}
          </div>
        )}
        <p className={`min-w-0 truncate text-xs text-texto-suave ${plegado ? 'hidden 2xl:block' : ''}`}>
          {revision.estado === 'pendiente_autorizacion' ? (
            <>
              <strong className="text-texto">{solicitante ?? 'El ejecutivo'}</strong> solicitó autorización
              {revision.enviada_en ? ` el ${fechaHora.format(new Date(revision.enviada_en))}` : ''}
              {puedeRetirar && !puedeAutorizar && (
                <>
                  {' · '}
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      iniciar(async () =>
                        resultado(await cambiarEstadoRevision(revision.id, cotizacionId, 'borrador'), true),
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
        <span
          tabIndex={0}
          title="Precio = costo × T.C. + utilidad (% sobre el costo); unitario redondeado a 2 decimales."
          aria-label="Precio = costo × T.C. + utilidad (% sobre el costo); unitario redondeado a 2 decimales."
          className="inline-flex size-7 shrink-0 cursor-help items-center justify-center rounded-full text-[13px] font-bold text-texto-suave italic hover:bg-superficie-2 hover:text-texto"
        >
          ƒ
        </span>

        <div className="ml-auto flex items-center gap-2">
          <MenuColumnas ocultas={ocultas} onCambio={cambiarOcultas} columnas={disponibles} tamano="chico" />
          <Boton
            tamano="chico"
            variante="paso"
            icono={completa ? 'compactar' : 'expandir'}
            onClick={() => guardarCompleta(completa ? null : '1')}
            title={completa ? 'Salir de pantalla completa (Esc)' : 'Usar toda la pantalla'}
          >
            {completa ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </Boton>
        </div>
      </div>

      {/* Mensajes: flotan sobre la hoja en lugar de empujarla. */}
      {mensaje && (
        <div
          role="status"
          className={`animar-entrada absolute right-4 bottom-4 z-30 flex max-w-[480px] items-start gap-2 rounded-lg border px-4 py-3 text-[13px] font-semibold sombra ${
            mensaje.error
              ? 'border-peligro/30 bg-peligro-suave text-peligro'
              : 'border-exito/30 bg-exito-suave text-exito'
          }`}
        >
          <Icon
            name={mensaje.error ? 'cerrar' : 'palomita'}
            size={16}
            strokeWidth={2.4}
            className="mt-px shrink-0"
          />
          <span className="flex-1">{mensaje.texto}</span>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            aria-label="Cerrar mensaje"
            className="-my-1 -mr-2 inline-flex size-7 cursor-pointer items-center justify-center rounded-sm hover:bg-superficie/60"
          >
            <Icon name="cerrar" size={13} />
          </button>
        </div>
      )}

      {/* La hoja: único scroll vertical (y horizontal para las columnas). */}
      <div ref={hoja} className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px] leading-snug">
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                scope="colgroup"
                colSpan={2}
                className={`sticky left-0 z-10 ${borde} bg-superficie px-3 py-1.5 text-left text-xs font-bold text-texto-suave`}
              >
                Partida y descripción
              </th>
              {gruposVisibles.map(({ g, span }) => (
                <th
                  key={g}
                  scope="colgroup"
                  colSpan={span}
                  className={`${borde} border-l border-l-texto/25 px-3 py-1.5 text-left text-xs font-bold tracking-wide uppercase ${GRUPOS[g].banda} ${GRUPOS[g].texto}`}
                >
                  {GRUPOS[g].titulo}
                </th>
              ))}
            </tr>
            <tr className="text-xs font-semibold text-texto-suave">
              <th scope="col" className={`${fija1} ${borde} bg-superficie-2 px-3 py-2 text-center`}>
                Partida
              </th>
              <th scope="col" className={`${fija2} ${borde} bg-superficie-2 px-3 py-2 text-left`}>
                Descripción del equipo
              </th>
              {columnas.map((c, i) => (
                <th
                  key={c.id}
                  scope="col"
                  className={`${borde} ${i === 0 ? 'border-l border-l-texto/25' : inicioGrupo(i)} ${
                    c.id === 'utilidadPct'
                      ? 'w-[86px] max-w-[86px] min-w-[86px] bg-exito-suave px-2'
                      : 'max-w-32 min-w-20 bg-superficie-2 px-3'
                  } py-2 align-middle leading-tight ${
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
                <tr className="h-9">
                  <td colSpan={2 + columnas.length} className={`${borde} p-0 ${fondo}`}>
                    <div
                      className={`sticky left-0 flex w-fit items-center gap-x-3 py-1.5 pr-3 pl-4 whitespace-nowrap ${barra}`}
                    >
                      <span className={`text-[13px] font-bold ${texto}`}>{prop.nombre}</span>
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
                  // Fondo opaco para las columnas fijas; tinte suave para el resto de la fila.
                  const aviso = avisoDeFila.get(f.p.id);
                  const fijo =
                    resaltada === f.p.id
                      ? 'bg-acento-suave'
                      : aviso
                        ? 'bg-aviso-suave'
                        : f.tipo === 'cargo'
                          ? 'bg-aviso-suave'
                          : f.tipo === 'partida'
                            ? 'bg-superficie group-hover:bg-superficie-2'
                            : 'bg-info-suave';
                  const tinte =
                    resaltada === f.p.id
                      ? 'bg-acento-suave'
                      : aviso
                        ? 'bg-aviso-suave/50'
                        : f.tipo === 'cargo'
                          ? 'bg-aviso-suave/50'
                          : f.tipo === 'partida'
                            ? ''
                            : 'bg-info-suave/40';
                  return (
                    <tr key={f.p.id} id={`fila-${f.p.id}`} className="group h-10 transition-colors">
                      <td
                        className={`${fija1} ${barra} ${borde} ${fijo} tabular px-3 text-center font-semibold ${
                          aviso ? 'text-aviso' : 'text-texto-suave'
                        }`}
                      >
                        {aviso ? (
                          <span className="inline-flex items-center gap-1" title={aviso}>
                            <Icon name="campana" size={12} strokeWidth={2.4} />
                            {f.ref}
                          </span>
                        ) : (
                          f.ref
                        )}
                      </td>
                      <td className={`${fija2} ${borde} ${fijo} px-3`}>
                        <Descripcion
                          f={f}
                          aviso={aviso}
                          extra={
                            f.tipo === 'cargo'
                              ? `Se reparte entre ${f.p.prorrateos.map((x) => refDe.get(x.destino_id) ?? '?').join(', ')}${
                                  cargo && cargo.diferencia !== 0n
                                    ? ` · redondeo ${cargo.diferencia > 0n ? '+' : '−'}${pesos(cargo.diferencia < 0n ? -cargo.diferencia : cargo.diferencia)}`
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
                              className={`${clases} relative w-[86px] max-w-[86px] min-w-[86px] px-2 text-center ${
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
                                <span className="relative mx-auto block w-[70px]">
                                  <input
                                    value={valor}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    aria-label={`Utilidad en porcentaje, partida ${f.ref}`}
                                    aria-invalid={!valida}
                                    onChange={(e) =>
                                      setPorPartida((s) => ({ ...s, [f.p.id]: e.target.value.trim() }))
                                    }
                                    className={`tabular block h-7 w-full rounded-sm border bg-superficie pr-5 pl-1 text-right text-[13px] font-bold shadow-sm outline-none hover:border-exito focus:ring-2 focus:ring-acento ${
                                      valida ? 'border-exito/50 text-texto' : 'border-peligro text-peligro'
                                    }`}
                                  />
                                  <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-xs font-semibold text-texto-suave"
                                  >
                                    %
                                  </span>
                                </span>
                              ) : (
                                <span className="font-bold">{valor ? `${valor} %` : '—'}</span>
                              )}
                            </td>
                          );
                        return (
                          <td
                            key={c.id}
                            className={`${clases} px-3 whitespace-nowrap group-hover:bg-superficie-2 ${alinear(c)} ${
                              tinte ||
                              (c.id === 'tc' && f.p.costo?.moneda !== 'MXN'
                                ? 'bg-aviso-suave/60'
                                : c.grupo === 'venta'
                                  ? 'bg-acento-suave/30'
                                  : '')
                            }`}
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
            <tr className="h-10 font-bold">
              <td
                colSpan={2}
                className="sticky left-0 z-10 border-t-2 border-r border-t-texto/25 border-r-borde bg-superficie-2 px-3"
              >
                Totales de la corrida
              </td>
              {columnas.map((c, ci) => {
                const t = totalPie[c.id];
                return (
                  <td
                    key={c.id}
                    className={`tabular border-t-2 border-r border-t-texto/25 border-r-borde ${ci === 0 ? 'border-l border-l-texto/25' : inicioGrupo(ci)} bg-superficie-2 px-3 text-right whitespace-nowrap ${
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
                      {esAdquisicion &&
                        anticipoValido &&
                        anticipo &&
                        (() => {
                          const a = anticipoDe(c.totales.total, anticipo);
                          return (
                            <dl className="tabular mb-2 space-y-0.5 rounded-sm bg-info-suave px-2 py-1.5 text-xs text-info">
                              <div className="flex justify-between">
                                <dt>Anticipo ({anticipo} %)</dt>
                                <dd className="font-bold">{pesos(a.anticipo)}</dd>
                              </div>
                              <div className="flex justify-between">
                                <dt>Monto para liquidar</dt>
                                <dd className="font-bold">{pesos(a.liquidar)}</dd>
                              </div>
                            </dl>
                          );
                        })()}
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
              <dt className="text-texto-suave">Vigencia</dt>
              <dd className="text-right font-bold">{textoVigencia(vigenciaIso || null)}</dd>
              <dt className="text-texto-suave">Costo sin IVA</dt>
              <dd className="text-right">{pesos(costo)}</dd>
              <dt className="text-texto-suave">Utilidad sin IVA</dt>
              <dd className="text-right font-bold text-exito">
                {pesos(utilidad)} · {pct(utilidad, costo)} %
              </dd>
              <dt className="text-texto-suave">Venta sin IVA</dt>
              <dd className="text-right font-bold">{pesos(venta)}</dd>
              {esAdquisicion && (
                <>
                  <dt className="text-texto-suave">Anticipo</dt>
                  <dd className="text-right font-bold text-info">{anticipo} % del total con IVA</dd>
                </>
              )}
              {Number(transaccion) > 0 && (
                <>
                  <dt className="text-texto-suave">Transaccionalidad</dt>
                  <dd className="text-right font-bold text-aviso">
                    {transaccion} % · {alcance === 'todas' ? 'todas las partidas' : 'sólo otro proveedor'} ·{' '}
                    {pesos(transaccionTotal)}
                  </dd>
                </>
              )}
            </dl>
            {avisos.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-bold">Confirma que revisaste los avisos</legend>
                {avisos.map((a) => (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${
                      confirmados.has(a.id)
                        ? 'border-exito/40 bg-exito-suave/40'
                        : 'border-borde hover:bg-superficie-2'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={confirmados.has(a.id)}
                      onChange={(e) =>
                        setConfirmados((xs) => {
                          const n = new Set(xs);
                          if (e.target.checked) n.add(a.id);
                          else n.delete(a.id);
                          return n;
                        })
                      }
                      className="mt-0.5 size-4 shrink-0 accent-[var(--c-acento)]"
                    />
                    <Icon
                      name="campana"
                      size={15}
                      className={`mt-0.5 shrink-0 ${a.tono === 'peligro' ? 'text-peligro' : 'text-aviso'}`}
                    />
                    <span>
                      <strong>{a.titulo}</strong>
                      <span className="block text-xs text-texto-suave">{a.detalle}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
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
              <Boton
                type="submit"
                variante="primario"
                icono="candado"
                disabled={pendiente || avisos.some((a) => !confirmados.has(a.id))}
                title={avisos.some((a) => !confirmados.has(a.id)) ? 'Confirma primero cada aviso' : undefined}
              >
                {pendiente ? 'Autorizando…' : 'Autorizar y bloquear'}
              </Boton>
              <Boton variante="fantasma" onClick={() => setDialogo(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </VentanaFlotante>
      )}

      {dialogo === 'retirar' && (
        <VentanaFlotante titulo="Retirar para corregir" onCerrar={() => setDialogo(null)}>
          <form onSubmit={retirar} className="flex flex-col gap-4">
            <p className="text-sm text-texto-suave">
              La cotización regresa a borrador para que la corrijan y la vuelvan a enviar. Se avisará a{' '}
              <strong className="text-texto">
                {[capturista, solicitante].filter((x, i, xs) => x && xs.indexOf(x) === i).join(' y ') ||
                  'quien la preparó'}
              </strong>{' '}
              con este motivo.
            </p>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              ¿Qué hay que corregir?
              <textarea
                name="motivo"
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                autoComplete="off"
                placeholder="Ej. Falta el costo del flete a Guadalajara; confirma el SKU del monitor."
                className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm font-normal text-texto outline-none focus:border-acento"
              />
            </label>
            {mensaje?.error && <p className="text-[13px] font-semibold text-peligro">{mensaje.texto}</p>}
            <div className="flex flex-wrap gap-2.5">
              <Boton type="submit" variante="peligroFuerte" icono="izquierda" disabled={pendiente}>
                {pendiente ? 'Retirando…' : 'Retirar y avisar'}
              </Boton>
              <Boton variante="fantasma" onClick={() => setDialogo(null)}>
                Cancelar
              </Boton>
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
              <Boton type="submit" variante="peligroFuerte" icono="cerrar" disabled={pendiente}>
                {pendiente ? 'Rechazando…' : 'Rechazar'}
              </Boton>
              <Boton variante="fantasma" onClick={() => setDialogo(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </VentanaFlotante>
      )}
    </>
  );
}

/** Horas para la vigencia, cada media hora de 08:00 a 20:00 (14:00 por omisión). */
const HORAS = Array.from({ length: 25 }, (_, i) => {
  const minutos = 8 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${minutos % 60 ? '30' : '00'}`;
});

const controlParametro =
  'h-10 rounded-sm border border-texto/20 bg-superficie px-2 text-[13px] text-texto outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave disabled:bg-superficie-2 disabled:text-texto-suave';

/** Tarjeta de un parámetro, siempre visible y editable (propuesta C, 2026-10-08). */
function Tarjeta2({
  borde,
  etiqueta,
  ayuda,
  error,
  children,
}: {
  borde: string;
  etiqueta: string;
  ayuda?: string;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col justify-center gap-1 rounded-md border-2 bg-superficie px-2.5 py-1.5 ${borde}`}
    >
      <span className="flex items-baseline gap-2 text-[11px] font-bold text-texto-suave">
        {etiqueta}
        {ayuda && <span className={`font-semibold ${error ? 'text-peligro' : ''}`}>· {ayuda}</span>}
      </span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Porcentaje con el símbolo «%» siempre visible después del número (2026-10-07). */
function CampoPorcentaje({
  valor,
  onCambio,
  valido,
  placeholder,
  etiqueta,
  deshabilitado,
  ancho = 'w-20',
}: {
  valor: string;
  onCambio: (v: string) => void;
  valido: boolean;
  placeholder?: string;
  etiqueta: string;
  deshabilitado?: boolean;
  ancho?: string;
}) {
  return (
    <span className={`relative inline-block ${ancho}`}>
      <input
        value={valor}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={`${etiqueta} en porcentaje`}
        aria-invalid={!valido}
        disabled={deshabilitado}
        onChange={(e) => onCambio(e.target.value)}
        className={`${controlParametro} tabular w-full pr-6 text-right font-bold ${valido ? '' : 'border-peligro'}`}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-texto-suave"
      >
        %
      </span>
    </span>
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

/** Descripción en una sola línea (fila baja, como en Excel); un clic la despliega completa. */
function Descripcion({ f, extra, aviso }: { f: FilaCorrida; extra?: string; aviso?: string }) {
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
      className={`flex w-full cursor-pointer items-start gap-1.5 py-2 text-left ${sub ? 'pl-4' : ''}`}
    >
      {etiqueta && (
        <span className={`mt-px shrink-0 rounded-sm px-1.5 text-[11px] font-bold ${etiqueta.clase}`}>
          {etiqueta.texto}
        </span>
      )}
      {f.p.se_suma && (
        <span className="mt-px shrink-0 rounded-sm bg-info-suave px-1.5 text-[11px] font-bold text-info">
          Se suma
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={`[&_.texto-enriquecido]:text-[13px] [&_.texto-enriquecido]:leading-snug ${abierta ? 'block whitespace-normal' : 'line-clamp-1'}`}
        >
          {f.p.descripcion_contenido != null ? (
            <TextoEnriquecido contenido={f.p.descripcion_contenido} respaldo={f.p.descripcion} />
          ) : (
            <span className="font-semibold">{f.p.descripcion}</span>
          )}
        </span>
        {/* Avisos de la fila debajo de la descripción para no taparla (2026-10-09). */}
        {aviso && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-aviso">
            <Icon name="campana" size={11} strokeWidth={2.6} />
            {aviso}
          </span>
        )}
        {extra && <span className="mt-0.5 block text-[11px] font-semibold text-aviso">{extra}</span>}
      </span>
    </button>
  );
}
