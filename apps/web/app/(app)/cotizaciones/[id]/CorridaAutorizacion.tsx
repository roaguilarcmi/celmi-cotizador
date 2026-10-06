'use client';

import {
  aEscalado,
  calcularPartida,
  conIva,
  ESCALA_DINERO,
  formatearMXN,
  importeConLetra,
  presentarPropuestas,
  type ResultadoPartida,
} from '@celmi/core';
import { porcentaje } from '@celmi/validation';
import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  COLUMNAS,
  GRUPOS,
  Indicador,
  MenuColumnas,
  PrecioAnterior,
  useColumnasOcultas,
  type Columna,
  type Grupo,
} from '@/components/corrida/Corrida';
import { Icon } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Boton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import { decimal, entradaCorrida } from '@/lib/corrida';
import type { PartidaFila, RevisionDetalle } from '@/lib/datos';
import { autorizarRevision, guardarUtilidades, rechazarRevision } from '../acciones';
import { nombreCatalogo, type Catalogos } from './modelo';

const pesos = (c: bigint) => formatearMXN(c);
const fechaHora = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

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

/**
 * Corrida de precios con datos reales (Fase 3C): quien autoriza define la utilidad de cada partida, adicional y
 * cargo; los precios se calculan con @celmi/core al escribir y el servidor los vuelve a calcular al autorizar.
 * Es la misma pantalla aprobada en la demostración EPOXEMEX (grupos de columnas, vistas rápidas, separadores).
 */
export function CorridaAutorizacion({
  revision,
  cotizacionId,
  catalogos,
  utilidadesIniciales,
  puedeAutorizar,
  solicitante,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  catalogos: Catalogos;
  utilidadesIniciales: Record<string, string>;
  puedeAutorizar: boolean;
  solicitante: string | null;
}) {
  const editable = puedeAutorizar && revision.estado === 'pendiente_autorizacion';
  const [general, setGeneral] = useState('');
  const [porPartida, setPorPartida] = useState<Record<string, string>>(utilidadesIniciales);
  const [base, setBase] = useState(() => JSON.stringify(utilidadesIniciales));
  const [previas, setPrevias] = useState(utilidadesIniciales);
  if (utilidadesIniciales !== previas) {
    setPrevias(utilidadesIniciales);
    setPorPartida(utilidadesIniciales);
    setBase(JSON.stringify(utilidadesIniciales));
  }
  const [ocultas, cambiarOcultas] = useColumnasOcultas();
  const [nota, setNota] = useState('');
  const [rechazando, setRechazando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const todas = useMemo(() => revision.propuestas.flatMap((p) => p.partidas), [revision]);
  const utilidadDe = (id: string) => porPartida[id] ?? general;
  const efectivas = Object.fromEntries(todas.map((p) => [p.id, utilidadDe(p.id)]));
  const sucio = editable && (JSON.stringify(porPartida) !== base || general !== '');

  useEffect(() => {
    const salir = (e: BeforeUnloadEvent) => {
      if (sucio) e.preventDefault();
    };
    window.addEventListener('beforeunload', salir);
    return () => window.removeEventListener('beforeunload', salir);
  }, [sucio]);

  // Cada partida por separado: una utilidad inválida sólo marca su fila.
  const entrada = useMemo(() => {
    try {
      return entradaCorrida(revision, () => '0');
    } catch {
      return null;
    }
  }, [revision]);
  // El costo no depende de la utilidad: se muestra aunque falte.
  const costos = new Map<string, ResultadoPartida>();
  const resultados = new Map<string, ResultadoPartida | null>();
  for (const prop of entrada ?? [])
    for (const p of prop.partidas) {
      costos.set(p.id, calcularPartida(p));
      try {
        resultados.set(p.id, calcularPartida({ ...p, utilidadPct: utilidadDe(p.id) }));
      } catch {
        resultados.set(p.id, null);
      }
    }
  const validas =
    todas.length > 0 && [...resultados.values()].every(Boolean) && resultados.size === todas.length;
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
  const pctUtilidad = costo > 0n ? (Number((utilidad * 10000n) / costo) / 100).toFixed(1) : '0.0';
  const principales = presentadas?.filter((p) => !p.esAdicional).map((p) => p.totales.total) ?? [];
  const numAdicionales = revision.propuestas.filter((p) => p.es_adicional).length;
  const generalValida = general === '' || porcentaje.safeParse(general).success;
  const columnas = COLUMNAS.filter((c) => !ocultas.has(c.id));
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

  const accion = (fn: () => Promise<{ error?: string; ok?: string }>) =>
    iniciar(async () => {
      const r = await fn();
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
      if (!r.error) setGeneral('');
    });

  const rechazar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '');
    iniciar(async () => {
      const r = await rechazarRevision(revision.id, cotizacionId, motivo);
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
      if (!r.error) setRechazando(false);
    });
  };

  const celda = (col: Columna, f: FilaCorrida, r: ResultadoPartida | null | undefined): ReactNode => {
    const { p } = f;
    const k = costos.get(p.id);
    const v = (c: bigint | undefined) => (c === undefined ? '—' : pesos(c));
    const linea = f.tipo === 'partida' ? lineaDe.get(p.id) : undefined;
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
        return (
          <span className="inline-flex min-w-11 items-center justify-center rounded-md bg-neutro-suave px-2.5 py-1 text-base font-bold text-texto">
            {p.cantidad}
          </span>
        );
      case 'unitario': {
        if (!p.costo) return '—';
        const unitario = decimal(p.costo.costo_unitario, 2);
        return (
          <>
            {p.costo.moneda !== 'MXN' && (
              <span className="text-[11px] text-texto-suave">{p.costo.moneda} </span>
            )}
            {pesos(aEscalado(unitario, ESCALA_DINERO))}
            {p.costo.costo_anterior != null && (
              <PrecioAnterior anterior={decimal(p.costo.costo_anterior, 2)} actual={unitario} />
            )}
          </>
        );
      }
      case 'moneda':
        return p.costo?.moneda ?? '—';
      case 'tc':
        return p.costo ? decimal(p.costo.tipo_cambio, 5) : '—';
      case 'unitarioFinal':
        return v(k?.costoUnitarioMXN);
      case 'compra':
        return <span className="font-semibold">{v(k?.costoTotal)}</span>;
      case 'compraIva':
        return v(k ? conIva(k.costoTotal) : undefined);
      case 'utilidadPct': {
        const valor = utilidadDe(p.id);
        const valida = porcentaje.safeParse(valor).success;
        if (!editable)
          return (
            <span className="font-bold">
              {valor ? `${valor} %` : <span className="text-texto-suave">—</span>}
            </span>
          );
        return (
          <label className="relative inline-flex items-center">
            <span className="sr-only">Utilidad en porcentaje, partida {f.ref}</span>
            <input
              value={valor}
              inputMode="decimal"
              placeholder="%"
              aria-invalid={!valida}
              onChange={(e) => setPorPartida((s) => ({ ...s, [p.id]: e.target.value.trim() }))}
              className={`tabular h-10 w-20 rounded-sm border-2 bg-superficie px-2.5 text-right text-sm font-bold text-texto outline-none focus:border-acento ${
                valida ? 'border-exito/40' : 'border-peligro'
              }`}
            />
          </label>
        );
      }
      case 'utilidadUnit':
        return <span className="text-exito">{v(r?.utilidadUnitaria)}</span>;
      case 'utilidadTotal':
        return <span className="font-semibold text-exito">{v(r?.utilidadTotal)}</span>;
      case 'utilidadTotalIva':
        return <span className="text-exito">{v(r ? conIva(r.utilidadTotal) : undefined)}</span>;
      case 'pvUnit':
        return (
          <>
            <span className="text-[15px] font-bold text-acento-texto">{v(r?.precioUnitario)}</span>
            {linea && r && linea.precioUnitario !== r.precioUnitario && (
              <span
                className="mt-1 block text-[11px] text-texto-suave"
                title="Precio unitario que ve el cliente: con sus adicionales incluidos y los cargos prorrateados"
              >
                Al cliente <strong className="text-texto">{pesos(linea.precioUnitario)}</strong>
              </span>
            )}
          </>
        );
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

  // Las dos primeras columnas quedan fijas al desplazarse a la derecha.
  const fija1 = 'sticky left-0 z-10 w-16 min-w-16';
  const fija2 = 'sticky left-16 z-10 w-72 min-w-72 border-r border-borde';

  return (
    <div className="flex flex-col gap-5">
      {revision.estado === 'pendiente_autorizacion' && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-texto-suave">
          <Icon name="reloj" size={16} />
          {solicitante ? <strong className="text-texto">{solicitante}</strong> : 'El ejecutivo'} solicitó
          autorización
          {revision.enviada_en ? ` el ${fechaHora.format(new Date(revision.enviada_en))}` : ''}
          {!puedeAutorizar && ' Sólo quien autoriza puede definir la utilidad.'}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <Indicador
          etiqueta="Costo compra sin IVA"
          valor={pesos(costo)}
          detalle={`Con IVA ${pesos(conIva(costo))}`}
        />
        <Indicador
          etiqueta="Total utilidad sin IVA"
          valor={validas ? pesos(utilidad) : '—'}
          detalle={
            validas
              ? `${pctUtilidad} % sobre el costo · con IVA ${pesos(conIva(utilidad))}`
              : 'Falta utilidad'
          }
          tono="text-exito"
        />
        <Indicador
          etiqueta="Total de venta sin IVA"
          valor={validas ? pesos(venta) : '—'}
          detalle={validas ? `Con IVA ${pesos(conIva(venta))}` : 'Falta utilidad'}
          tono="text-acento-texto"
        />
        <Indicador
          etiqueta="Propuestas para el cliente"
          valor={`${revision.propuestas.length - numAdicionales}${numAdicionales ? ` + ${numAdicionales} adicional` : ''}`}
          detalle={
            principales.length
              ? principales.length === 1
                ? `Total con IVA ${pesos(principales[0]!)}`
                : `De ${pesos(principales.reduce((a, b) => (b < a ? b : a)))} a ${pesos(principales.reduce((a, b) => (b > a ? b : a)))} con IVA`
              : '—'
          }
        />
      </div>

      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 border-b border-borde px-5 py-4">
          <div className="mr-auto">
            <Titulo2>
              Corrida · {revision.propuestas.length} propuestas, {todas.length} partidas
            </Titulo2>
            <p className="mt-1 text-[13px] text-texto-suave">
              Precio = costo × T.C. × (1 + utilidad), unitario redondeado a 2 decimales. Cada adicional y cada
              cargo lleva su propia utilidad.
            </p>
          </div>
          <MenuColumnas ocultas={ocultas} onCambio={cambiarOcultas} />
          {editable && (
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
              Utilidad general (%)
              <span className="flex gap-2">
                <input
                  value={general}
                  onChange={(e) => setGeneral(e.target.value.trim())}
                  inputMode="decimal"
                  placeholder="Ej. 13.5"
                  aria-invalid={!generalValida}
                  className={`tabular h-11 w-28 rounded-md border-2 bg-superficie px-3 text-right text-base font-bold text-texto outline-none ${
                    generalValida ? 'border-acento' : 'border-peligro'
                  }`}
                />
                <Boton onClick={() => setPorPartida({})} disabled={!general || !generalValida}>
                  Aplicar a todas
                </Boton>
              </span>
            </label>
          )}
        </div>

        <div className="max-h-[72vh] overflow-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={2}
                  className="sticky left-0 z-10 border-r border-b border-borde bg-superficie px-3 py-2 text-left text-xs font-bold text-texto-suave"
                >
                  Partida y descripción
                </th>
                {gruposVisibles.map(({ g, span }) => (
                  <th
                    key={g}
                    scope="colgroup"
                    colSpan={span}
                    className={`border-b border-l-2 border-b-borde border-l-superficie px-3 py-2 text-left text-xs font-bold tracking-wide uppercase ${GRUPOS[g].banda} ${GRUPOS[g].texto}`}
                  >
                    {GRUPOS[g].titulo}
                  </th>
                ))}
              </tr>
              <tr className="text-xs font-semibold text-texto-suave">
                <th
                  scope="col"
                  className={`${fija1} border-b border-borde bg-superficie-2 px-3 py-2.5 text-left`}
                >
                  Partida
                </th>
                <th scope="col" className={`${fija2} border-b bg-superficie-2 px-3 py-2.5 text-left`}>
                  Descripción del equipo
                </th>
                {columnas.map((c, i) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={`max-w-32 border-b border-borde bg-superficie-2 px-3 py-2.5 align-bottom leading-tight ${c.numero ? 'text-right' : 'text-left'} ${
                      i > 0 && columnas[i - 1]?.grupo !== c.grupo ? 'border-l-2 border-l-superficie' : ''
                    }`}
                  >
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>

            {revision.propuestas.map((prop, pi) => {
              const filas = filasPorPropuesta[pi] ?? [];
              const presentada = presentadas?.[pi];
              const par = pi % 2 === 0;
              const barra = `before:absolute before:top-0 before:-bottom-px before:left-0 before:w-1.5 before:content-[''] ${prop.es_adicional ? 'before:bg-aviso' : par ? 'before:bg-acento' : 'before:bg-info'}`;
              const inicio = pi > 0 ? 'border-t-[3px] border-t-texto/25' : '';
              const fondo = prop.es_adicional
                ? 'bg-aviso-suave/50'
                : par
                  ? 'bg-acento-suave/60'
                  : 'bg-info-suave/60';
              return (
                <tbody key={prop.id}>
                  <tr>
                    <td
                      colSpan={2 + columnas.length}
                      className={`border-b border-borde p-0 ${fondo} ${inicio}`}
                    >
                      <div
                        className={`sticky left-0 z-0 flex w-fit flex-wrap items-center gap-x-3 gap-y-1 py-2 pt-4 pr-3 pl-4 ${barra}`}
                      >
                        <span
                          className={`text-sm font-bold ${prop.es_adicional ? 'text-aviso' : par ? 'text-acento-texto' : 'text-info'}`}
                        >
                          {prop.nombre}
                        </span>
                        {prop.tipo && <span className="text-[13px] text-texto-suave">{prop.tipo}</span>}
                        {prop.es_adicional && (
                          <Pill tono="aviso" punto={false}>
                            Adicionales
                          </Pill>
                        )}
                        <span className="text-[13px] text-texto-suave">
                          · {presentada?.lineas.length ?? '—'} líneas para el cliente · Total con IVA{' '}
                          <strong className="tabular text-texto">
                            {presentada ? pesos(presentada.totales.total) : '—'}
                          </strong>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {filas.map((f) => {
                    const r = resultados.get(f.p.id);
                    const cargo = f.tipo === 'cargo' ? cargoDe.get(f.p.id) : undefined;
                    const sub = f.tipo === 'incluida' || f.tipo === 'visible';
                    return (
                      <tr key={f.p.id} className="group">
                        <td
                          className={`${fija1} ${barra} tabular border-b border-borde bg-superficie py-3.5 pr-3 pl-4 align-top font-semibold text-texto-suave group-hover:bg-superficie-2`}
                        >
                          {f.ref}
                        </td>
                        <td
                          className={`${fija2} bg-superficie px-3 py-3 align-top group-hover:bg-superficie-2`}
                        >
                          <div className={sub ? 'border-l-2 border-borde pl-2.5' : ''}>
                            <Etiquetas f={f} />
                            <Descripcion p={f.p} />
                            {f.tipo === 'cargo' && (
                              <p className="mt-1 text-[11px] text-texto-suave">
                                Se reparte entre{' '}
                                {f.p.prorrateos.map((x) => refDe.get(x.destino_id) ?? '?').join(', ')}
                                {cargo && cargo.diferencia !== 0n && (
                                  <span className="ml-1 font-semibold text-aviso">
                                    · redondeo {cargo.diferencia > 0n ? '+' : '−'}
                                    {pesos(cargo.diferencia < 0n ? -cargo.diferencia : cargo.diferencia)}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </td>
                        {columnas.map((c, ci) => (
                          <td
                            key={c.id}
                            className={`border-b border-borde px-3 py-3 align-top whitespace-nowrap group-hover:bg-superficie-2 ${
                              c.numero ? 'tabular text-right' : ''
                            } ${c.grupo === 'venta' ? 'bg-acento-suave/35' : ''} ${
                              ci > 0 && columnas[ci - 1]?.grupo !== c.grupo
                                ? 'border-l-2 border-l-superficie'
                                : ''
                            }`}
                          >
                            {celda(c, f, r)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}

            <tfoot className="sticky bottom-0 z-20">
              <tr className="font-bold">
                <td
                  colSpan={2}
                  className="sticky left-0 z-10 border-t-2 border-r border-t-texto/20 border-r-borde bg-superficie-2 px-3 py-3.5 text-sm"
                >
                  Totales de la corrida
                </td>
                {columnas.map((c, ci) => {
                  const t = totalPie[c.id];
                  return (
                    <td
                      key={c.id}
                      className={`tabular border-t-2 border-t-texto/20 bg-superficie-2 px-3 py-3.5 text-right whitespace-nowrap ${
                        c.grupo === 'utilidad' ? 'text-exito' : c.grupo === 'venta' ? 'text-acento-texto' : ''
                      } ${ci > 0 && columnas[ci - 1]?.grupo !== c.grupo ? 'border-l-2 border-l-superficie' : ''}`}
                    >
                      {t !== undefined && (validas || c.grupo === 'costo') ? pesos(t) : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </Tarjeta>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Resumen para el cliente" className="min-w-0 flex-[999_1_640px]">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <Titulo2>Resumen para el cliente</Titulo2>
            <span className="text-[13px] text-texto-suave">IVA 16 % sobre el subtotal de cada propuesta</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {revision.propuestas.map((prop, i) => {
              const c = presentadas?.[i];
              const sumadas =
                !prop.es_adicional &&
                presentadas?.some((x) => x.esAdicional && x.lineas.some((l) => l.seSuma));
              return (
                <Tarjeta key={prop.id} className="p-4">
                  <div
                    className={`text-xs font-bold tracking-wide uppercase ${prop.es_adicional ? 'text-aviso' : 'text-acento-texto'}`}
                  >
                    {prop.nombre}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] text-texto-suave">
                    {c ? `${c.lineas.length} líneas` : `${prop.partidas.length} partidas`}
                    {sumadas ? ' · con adicionales sumados' : ''}
                    {prop.es_adicional ? ' · opcionales salvo «se suma»' : ''}
                  </div>
                  {c ? (
                    <>
                      <dl className="tabular mt-3 space-y-1 text-[13px]">
                        <div className="flex justify-between">
                          <dt className="text-texto-suave">Subtotal</dt>
                          <dd>{pesos(c.totales.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-texto-suave">IVA</dt>
                          <dd>{pesos(c.totales.iva)}</dd>
                        </div>
                        <div className="flex justify-between border-t border-borde pt-1.5 text-[15px] font-bold">
                          <dt>Total</dt>
                          <dd>{pesos(c.totales.total)}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-[11px] leading-snug text-texto-suave">
                        {importeConLetra(c.totales.total)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-[13px] font-semibold text-peligro">
                      Falta la utilidad de alguna partida
                    </p>
                  )}
                </Tarjeta>
              );
            })}
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:sticky lg:top-6">
          <Tarjeta className="p-5">
            <Titulo2>Decisión</Titulo2>
            {revision.estado === 'autorizada' || revision.estado === 'emitida' ? (
              <div className="mt-3 flex gap-3 rounded-md bg-exito-suave px-4 py-3.5 text-exito">
                <Icon name="candado" size={20} />
                <div className="text-[13px]">
                  <p className="text-sm font-bold">Precios autorizados</p>
                  <p className="mt-0.5 text-texto">
                    {revision.autorizada_en
                      ? `El ${fechaHora.format(new Date(revision.autorizada_en))}. `
                      : ''}
                    Partidas, costos y precios quedaron bloqueados.
                  </p>
                  {revision.comentario_autorizacion && (
                    <p className="mt-1.5 text-texto">Nota: «{revision.comentario_autorizacion}»</p>
                  )}
                </div>
              </div>
            ) : revision.estado === 'rechazada' ? (
              <div className="mt-3 rounded-md bg-peligro-suave px-4 py-3.5 text-[13px]">
                <p className="text-sm font-bold text-peligro">Rechazada</p>
                <p className="mt-0.5">Motivo: «{revision.comentario_autorizacion}»</p>
              </div>
            ) : editable ? (
              <div className="mt-4 flex flex-col gap-2.5">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
                  Nota para el ejecutivo (opcional)
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    maxLength={2000}
                    rows={2}
                    className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm font-normal text-texto outline-none focus:border-acento"
                  />
                </label>
                <Boton
                  variante="primario"
                  icono="candado"
                  className="min-h-13 w-full text-[15px]"
                  disabled={!validas || pendiente}
                  onClick={() => accion(() => autorizarRevision(revision.id, cotizacionId, efectivas, nota))}
                >
                  {pendiente ? 'Procesando…' : 'Autorizar y bloquear precios'}
                </Boton>
                <div className="flex flex-wrap gap-2.5">
                  <Boton
                    icono="guardado"
                    className="flex-[1_1_140px]"
                    disabled={pendiente || !sucio}
                    onClick={() =>
                      accion(() =>
                        guardarUtilidades(
                          revision.id,
                          cotizacionId,
                          Object.fromEntries(
                            Object.entries(efectivas).filter(([, v]) => porcentaje.safeParse(v).success),
                          ),
                        ),
                      )
                    }
                  >
                    Guardar avance
                  </Boton>
                  <Boton
                    variante="peligro"
                    icono="cerrar"
                    className="flex-[1_1_140px]"
                    disabled={pendiente}
                    onClick={() => setRechazando(true)}
                  >
                    Rechazar
                  </Boton>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-texto-suave">En espera de quien autoriza.</p>
            )}
            <p
              role="status"
              className={`mt-3 flex gap-1.5 text-xs ${mensaje ? (mensaje.error ? 'font-semibold text-peligro' : 'font-semibold text-exito') : 'text-texto-suave'}`}
            >
              {mensaje ? (
                mensaje.texto
              ) : editable ? (
                <>
                  <Icon name="candado" size={14} />
                  {validas
                    ? 'Al autorizar, el ejecutivo ya no puede cambiar partidas, costos ni precios.'
                    : 'Define la utilidad de todas las partidas para autorizar.'}
                </>
              ) : null}
            </p>
          </Tarjeta>
        </aside>
      </div>

      {rechazando && (
        <VentanaFlotante titulo="Rechazar la cotización" onCerrar={() => setRechazando(false)}>
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
                autoFocus
                placeholder="Ej. Pide otra cotización del SSD; el costo es alto."
                className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm font-normal text-texto outline-none focus:border-acento"
              />
            </label>
            <div className="flex flex-wrap gap-2.5">
              <Boton type="submit" variante="peligro" icono="cerrar" disabled={pendiente}>
                {pendiente ? 'Rechazando…' : 'Rechazar'}
              </Boton>
              <Boton onClick={() => setRechazando(false)}>Cancelar</Boton>
            </div>
            {mensaje?.error && <p className="text-[13px] font-semibold text-peligro">{mensaje.texto}</p>}
          </form>
        </VentanaFlotante>
      )}
    </div>
  );
}

function Etiquetas({ f }: { f: FilaCorrida }) {
  const chips: { texto: string; tono: 'info' | 'aviso' | 'neutro' }[] = [];
  if (f.tipo === 'incluida') chips.push({ texto: 'Incluido en su partida', tono: 'neutro' });
  if (f.tipo === 'visible') chips.push({ texto: 'Adicional visible', tono: 'info' });
  if (f.tipo === 'cargo') chips.push({ texto: 'Cargo prorrateado', tono: 'aviso' });
  if (f.p.se_suma) chips.push({ texto: 'Se suma', tono: 'info' });
  if (!chips.length) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <Pill key={c.texto} tono={c.tono} punto={false}>
          {c.texto}
        </Pill>
      ))}
    </div>
  );
}

/** Descripción con formato recortada a tres líneas, con «Ver más». */
function Descripcion({ p }: { p: PartidaFila }) {
  const [abierta, setAbierta] = useState(false);
  const larga = p.descripcion.length > 120;
  return (
    <div className="whitespace-normal">
      <div
        className={`leading-snug [&_.texto-enriquecido]:text-[13px] [&_.texto-enriquecido]:leading-snug ${
          abierta ? '' : 'line-clamp-3'
        }`}
      >
        {p.descripcion_contenido != null ? (
          <TextoEnriquecido contenido={p.descripcion_contenido} respaldo={p.descripcion} />
        ) : (
          <span className="font-bold">{p.descripcion}</span>
        )}
      </div>
      {larga && (
        <button
          type="button"
          onClick={() => setAbierta((x) => !x)}
          aria-expanded={abierta}
          className="mt-0.5 cursor-pointer text-[11px] font-semibold text-acento-texto hover:underline"
        >
          {abierta ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}
