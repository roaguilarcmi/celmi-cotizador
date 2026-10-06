'use client';

import { aEscalado, formatearMXN, mejoraDePrecio } from '@celmi/core';
import { useMemo, useRef } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, clasesBoton, Tarjeta, type TamanoBoton } from '@/components/ui';
import { usePreferencia } from '@/lib/preferencias';

/**
 * Piezas de la corrida de precios compartidas por la pantalla de autorización y la demostración EPOXEMEX: grupos y
 * columnas del «FORMATO CORRIDA COTIZACIÓN», menú de columnas con vistas rápidas e indicadores.
 */
/** Grupos de columnas en el mismo orden que el «FORMATO CORRIDA COTIZACIÓN» que usa Alejandro. */
export type Grupo = 'producto' | 'costo' | 'utilidad' | 'venta';

export const GRUPOS: Record<Grupo, { titulo: string; banda: string; texto: string }> = {
  producto: { titulo: 'Producto', banda: 'bg-neutro-suave', texto: 'text-neutro' },
  costo: { titulo: 'Costo', banda: 'bg-info-suave', texto: 'text-info' },
  utilidad: { titulo: 'Utilidad', banda: 'bg-exito-suave', texto: 'text-exito' },
  venta: { titulo: 'Precio de venta', banda: 'bg-acento-suave', texto: 'text-acento-texto' },
};

export interface Columna {
  id: string;
  titulo: string;
  grupo: Grupo;
  /** Columna informativa con IVA: se puede ocultar. */
  iva?: boolean;
  numero?: boolean;
}

export const COLUMNAS: Columna[] = [
  { id: 'marca', titulo: 'Marca', grupo: 'producto' },
  { id: 'mayorista', titulo: 'Mayorista', grupo: 'producto' },
  { id: 'modelo', titulo: 'Modelo', grupo: 'producto' },
  { id: 'entrega', titulo: 'Tiempo de entrega', grupo: 'producto' },
  { id: 'unidad', titulo: 'Unidad de medida', grupo: 'producto' },
  { id: 'cantidad', titulo: 'Cantidad', grupo: 'producto', numero: true },
  { id: 'unitario', titulo: 'Unitario sin IVA', grupo: 'costo', numero: true },
  { id: 'moneda', titulo: 'Moneda', grupo: 'costo' },
  { id: 'tc', titulo: 'T.C.', grupo: 'costo', numero: true },
  { id: 'unitarioFinal', titulo: 'Unitario final sin IVA', grupo: 'costo', numero: true },
  { id: 'compra', titulo: 'Costo compra sin IVA', grupo: 'costo', numero: true },
  { id: 'compraIva', titulo: 'Costo compra con IVA', grupo: 'costo', numero: true, iva: true },
  { id: 'utilidadPct', titulo: 'Utilidad en %', grupo: 'utilidad', numero: true },
  { id: 'utilidadUnit', titulo: 'Utilidad en $ unitaria sin IVA', grupo: 'utilidad', numero: true },
  { id: 'utilidadTotal', titulo: 'Total utilidad sin IVA', grupo: 'utilidad', numero: true },
  { id: 'utilidadTotalIva', titulo: 'Total utilidad con IVA', grupo: 'utilidad', numero: true, iva: true },
  { id: 'pvUnit', titulo: 'Precio de venta unitario sin IVA', grupo: 'venta', numero: true },
  { id: 'pvUnitIva', titulo: 'Precio de venta unitario con IVA', grupo: 'venta', numero: true, iva: true },
  { id: 'venta', titulo: 'Total de venta sin IVA', grupo: 'venta', numero: true },
  { id: 'ventaIva', titulo: 'Total de venta con IVA', grupo: 'venta', numero: true, iva: true },
];

/** «Utilidad en %» es donde se autoriza: siempre visible. */
export const FIJAS = new Set(['utilidadPct']);
const ESENCIALES = new Set([
  'cantidad',
  'mayorista',
  'unitario',
  'compra',
  'utilidadPct',
  'utilidadUnit',
  'utilidadTotal',
  'pvUnit',
  'venta',
]);

const VISTAS: { nombre: string; ocultas: string[] }[] = [
  { nombre: 'Como la corrida', ocultas: [] },
  { nombre: 'Sin IVA', ocultas: COLUMNAS.filter((c) => c.iva).map((c) => c.id) },
  { nombre: 'Esencial', ocultas: COLUMNAS.filter((c) => !ESENCIALES.has(c.id)).map((c) => c.id) },
];

const mismaSeleccion = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));

/** Menú para elegir qué columnas de la corrida se ven; la elección se recuerda en este navegador. */
export function MenuColumnas({
  ocultas,
  onCambio,
  columnas = COLUMNAS,
  tamano = 'normal',
}: {
  ocultas: Set<string>;
  onCambio: (s: Set<string>) => void;
  /** Columnas que ofrece la pantalla (por omisión, las de la corrida de Excel). */
  columnas?: Columna[];
  /** Tamaño del botón (el mismo que los demás botones de la interfaz). */
  tamano?: TamanoBoton;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const alternar = (id: string) => {
    const s = new Set(ocultas);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onCambio(s);
  };
  return (
    <details ref={ref} className="relative">
      <summary
        className={`${clasesBoton('secundario', tamano)} list-none [&::-webkit-details-marker]:hidden`}
      >
        <Icon name="columnas" size={tamano === 'chico' ? 16 : 18} />
        Columnas
        <span className="tabular rounded-pill bg-neutro-suave px-2 py-0.5 text-xs text-neutro">
          {columnas.filter((c) => !ocultas.has(c.id)).length}/{columnas.length}
        </span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[min(600px,calc(100vw-2rem))] rounded-lg border border-borde bg-superficie p-5 sombra">
        <div className="text-xs font-semibold text-texto-suave">Vistas rápidas</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {VISTAS.map((v) => {
            const activa = mismaSeleccion(ocultas, v.ocultas);
            return (
              <button
                key={v.nombre}
                type="button"
                aria-pressed={activa}
                onClick={() => onCambio(new Set(v.ocultas))}
                className={`min-h-10 cursor-pointer rounded-pill border px-3.5 text-[13px] font-semibold transition-colors ${
                  activa
                    ? 'border-acento bg-acento-suave text-acento-texto'
                    : 'border-borde text-texto hover:bg-superficie-2'
                }`}
              >
                {v.nombre}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(Object.keys(GRUPOS) as Grupo[]).map((g) => (
            <fieldset key={g}>
              <legend
                className={`mb-1.5 w-full rounded-sm px-2 py-1 text-xs font-bold tracking-wide uppercase ${GRUPOS[g].banda} ${GRUPOS[g].texto}`}
              >
                {GRUPOS[g].titulo}
              </legend>
              {columnas
                .filter((c) => c.grupo === g)
                .map((c) => (
                  <label
                    key={c.id}
                    className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-[13px] hover:bg-superficie-2"
                  >
                    <input
                      type="checkbox"
                      checked={!ocultas.has(c.id)}
                      disabled={FIJAS.has(c.id)}
                      onChange={() => alternar(c.id)}
                      className="size-4 accent-[var(--c-acento)]"
                    />
                    <span className={FIJAS.has(c.id) ? 'text-texto-suave' : ''}>
                      {c.titulo}
                      {FIJAS.has(c.id) && ' · siempre visible'}
                    </span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
        <div className="mt-4 flex justify-between gap-3 border-t border-borde pt-4">
          <p className="text-xs text-texto-suave">Tu elección se recuerda en este navegador.</p>
          <Boton variante="primario" onClick={() => ref.current?.removeAttribute('open')}>
            Listo
          </Boton>
        </div>
      </div>
    </details>
  );
}

export function Indicador({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: string;
}) {
  return (
    <Tarjeta className="min-w-52 flex-1 px-5 py-4">
      <div className="text-[13px] font-semibold text-texto-suave">{etiqueta}</div>
      <div className={`tabular mt-1.5 text-2xl font-bold tracking-tight ${tono ?? ''}`}>{valor}</div>
      <div className="tabular mt-1 text-[13px] text-texto-suave">{detalle}</div>
    </Tarjeta>
  );
}

/** Columnas ocultas, recordadas en este navegador. «Utilidad en %» nunca se oculta. */
export function useColumnasOcultas() {
  const [guardadas, guardar] = usePreferencia('celmi-corrida-columnas');
  const ocultas = useMemo(() => {
    try {
      const lista: unknown = JSON.parse(guardadas ?? '[]');
      return new Set(
        Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string' && !FIJAS.has(x)) : [],
      );
    } catch {
      return new Set<string>();
    }
  }, [guardadas]);
  const cambiar = (s: Set<string>) => guardar(s.size ? JSON.stringify([...s]) : null);
  return [ocultas, cambiar] as const;
}

/** Precio anterior tachado y la mejora obtenida, debajo del costo actual. */
export function PrecioAnterior({ anterior, actual }: { anterior: string; actual: string }) {
  const m = mejoraDePrecio(anterior, actual);
  const mejoro = m.ahorro > 0n;
  return (
    <div className="mt-1.5 flex flex-col items-end gap-0.5 text-[11px] leading-tight">
      <span className="text-texto-suave">Precio anterior</span>
      <s className="text-xs text-texto-suave">{formatearMXN(aEscalado(anterior, 2))}</s>
      <span
        className={`mt-0.5 rounded-pill px-2 py-0.5 font-bold ${mejoro ? 'bg-exito-suave text-exito' : 'bg-peligro-suave text-peligro'}`}
      >
        {mejoro ? `Mejora ${m.porcentaje} %` : `Aumento ${m.porcentaje.replace('-', '')} %`}
      </span>
    </div>
  );
}
