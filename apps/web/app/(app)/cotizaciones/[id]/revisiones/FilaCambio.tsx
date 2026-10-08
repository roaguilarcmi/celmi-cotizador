'use client';

import { aEscalado, ESCALA_DINERO, formatearMXN, type FilaComparacion } from '@celmi/core';
import { Fragment, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui';

/** Piezas de la comparación de revisiones (Fase 3D). */

const pesos = (v: string) => formatearMXN(aEscalado(v, ESCALA_DINERO));

export const TIPOS: Record<
  FilaComparacion['tipo'],
  { texto: string; tono: 'neutro' | 'aviso' | 'exito' | 'peligro' }
> = {
  igual: { texto: 'Sin cambios', tono: 'neutro' },
  modificada: { texto: 'Modificada', tono: 'aviso' },
  nueva: { texto: 'Nueva', tono: 'exito' },
  eliminada: { texto: 'Eliminada', tono: 'peligro' },
};

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-5 py-12 text-center text-sm text-texto-suave">{children}</p>;
}

/** «antes → después» con la variación en %; si no cambió, sólo el valor. */
export function Cambio({
  antes,
  despues,
  variacionPct,
  bajaEsBuena = true,
}: {
  antes: string;
  despues: string;
  variacionPct?: string | null;
  bajaEsBuena?: boolean;
}) {
  if (antes === despues) return <span>{despues}</span>;
  const baja = variacionPct?.startsWith('-');
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 whitespace-nowrap">
      <s className="text-texto-suave">{antes}</s>
      <Icon name="derecha" size={12} className="text-texto-suave" />
      <strong>{despues}</strong>
      {variacionPct && variacionPct !== '0.0' && (
        <span
          className={`rounded-sm px-1 text-[11px] font-bold ${
            baja === bajaEsBuena ? 'bg-exito-suave text-exito' : 'bg-aviso-suave text-aviso'
          }`}
        >
          {baja ? '▼' : '▲'} {variacionPct.replace('-', '')} %
        </span>
      )}
    </span>
  );
}

type Tramo = { texto: string; tipo: 'igual' | 'quitado' | 'agregado' };

/** Diferencia palabra por palabra (subsecuencia común más larga), para resaltar qué cambió en una descripción. */
export function diferenciaPalabras(antes: string, despues: string): { antes: Tramo[]; despues: Tramo[] } {
  const a = antes.split(/(s+)/).filter(Boolean);
  const b = despues.split(/(s+)/).filter(Boolean);
  // Descripciones muy largas: sin resaltado fino (evita una tabla enorme).
  if (a.length * b.length > 400_000)
    return { antes: [{ texto: antes, tipo: 'quitado' }], despues: [{ texto: despues, tipo: 'agregado' }] };
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  const ra: Tramo[] = [];
  const rb: Tramo[] = [];
  const poner = (lista: Tramo[], texto: string, tipo: Tramo['tipo']) => {
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto;
    else lista.push({ texto, tipo });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      poner(ra, a[i]!, 'igual');
      poner(rb, b[j]!, 'igual');
      i++;
      j++;
    } else if (t[i + 1]![j]! >= t[i]![j + 1]!) poner(ra, a[i++]!, 'quitado');
    else poner(rb, b[j++]!, 'agregado');
  }
  while (i < a.length) poner(ra, a[i++]!, 'quitado');
  while (j < b.length) poner(rb, b[j++]!, 'agregado');
  return { antes: ra, despues: rb };
}

function Texto({ tramos }: { tramos: Tramo[] }) {
  return (
    <>
      {tramos.map((x, i) =>
        x.tipo === 'igual' || !x.texto.trim() ? (
          <span key={i}>{x.texto}</span>
        ) : x.tipo === 'quitado' ? (
          <del key={i} className="rounded-sm bg-peligro-suave px-0.5 text-peligro decoration-peligro/60">
            {x.texto}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-exito-suave px-0.5 font-semibold text-exito no-underline">
            {x.texto}
          </ins>
        ),
      )}
    </>
  );
}

export function FilaCambio({
  f,
  veUtilidad,
  columnas,
}: {
  f: FilaComparacion;
  veUtilidad: boolean;
  /** Columnas de la tabla (para el detalle a todo lo ancho). */
  columnas: number;
}) {
  const [abierta, setAbierta] = useState(false);
  const p = f.despues ?? f.antes;
  if (!p) return null;
  const cambioDescripcion = Boolean(f.antes && f.despues && f.campos.includes('descripcion'));
  const larga = p.descripcion.length > 70;
  const a = f.antes;
  const d = f.despues;
  const valor = (x: typeof a, campo: 'costo' | 'precio') => {
    const v = campo === 'costo' ? x?.costoUnitario : x?.precioUnitario;
    return v ? `${x?.moneda !== 'MXN' && campo === 'costo' ? `${x?.moneda} ` : ''}${pesos(v)}` : '—';
  };
  const marcado = (c: string) => (f.campos.includes(c as never) ? 'bg-aviso-suave/50' : '');
  return (
    <Fragment>
      <tr className={f.tipo === 'eliminada' ? 'text-texto-suave' : ''}>
        <td className="border-b border-borde px-4 py-2.5 align-top">
          <Pill tono={TIPOS[f.tipo].tono}>{TIPOS[f.tipo].texto}</Pill>
        </td>
        <td
          className={`border-b border-borde px-3 py-2.5 align-top ${marcado('descripcion')} ${marcado('sku')}`}
        >
          <span className={`font-semibold ${f.tipo === 'eliminada' ? 'line-through' : ''}`}>
            {p.sku || '—'}
          </span>
          <span className="ml-2 text-texto-suave" title={abierta ? undefined : p.descripcion}>
            {/* Corta a 70 caracteres salvo al desplegarla; si cambió, el detalle de abajo trae ambas completas. */}
            {larga && (cambioDescripcion || !abierta) ? `${p.descripcion.slice(0, 70)}…` : p.descripcion}
          </span>
          {(cambioDescripcion || larga) && (
            <button
              type="button"
              onClick={() => setAbierta((x) => !x)}
              aria-expanded={abierta}
              className={`mt-1 flex cursor-pointer items-center gap-1 text-[11px] font-semibold hover:underline ${cambioDescripcion ? 'text-aviso' : 'text-acento-texto'}`}
            >
              <Icon name={abierta ? 'arriba' : 'abajo'} size={12} strokeWidth={2.4} />
              {cambioDescripcion
                ? abierta
                  ? 'Ocultar antes y después'
                  : 'Descripción modificada · ver antes y después'
                : abierta
                  ? 'Ver menos'
                  : 'Ver descripción completa'}
            </button>
          )}
        </td>
        <td
          className={`border-b border-borde px-3 py-2.5 text-center align-top tabular ${marcado('cantidad')}`}
        >
          {a && d ? <Cambio antes={String(a.cantidad)} despues={String(d.cantidad)} /> : p.cantidad}
        </td>
        <td className={`border-b border-borde px-3 py-2.5 text-right align-top tabular ${marcado('costo')}`}>
          {a && d ? (
            <Cambio antes={valor(a, 'costo')} despues={valor(d, 'costo')} variacionPct={f.variacionCosto} />
          ) : (
            valor(p, 'costo')
          )}
        </td>
        <td className={`border-b border-borde px-3 py-2.5 text-right align-top tabular ${marcado('precio')}`}>
          {a && d ? (
            <Cambio
              antes={valor(a, 'precio')}
              despues={valor(d, 'precio')}
              variacionPct={f.variacionPrecio}
            />
          ) : (
            valor(p, 'precio')
          )}
        </td>
        {veUtilidad && (
          <td
            className={`border-b border-borde px-4 py-2.5 text-center align-top tabular ${marcado('utilidad')}`}
          >
            {a && d ? (
              <Cambio
                antes={a.utilidadPct ? `${a.utilidadPct} %` : '—'}
                despues={d.utilidadPct ? `${d.utilidadPct} %` : '—'}
              />
            ) : p.utilidadPct ? (
              `${p.utilidadPct} %`
            ) : (
              '—'
            )}
          </td>
        )}
      </tr>
      {abierta && cambioDescripcion && f.antes && f.despues && (
        <tr>
          <td colSpan={columnas} className="border-b border-borde bg-superficie-2/50 px-4 py-3">
            {(() => {
              const d = diferenciaPalabras(f.antes.descripcion, f.despues.descripcion);
              return (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-peligro/25 bg-superficie p-3">
                    <div className="mb-1.5 text-[11px] font-bold tracking-wide text-peligro uppercase">
                      Antes
                    </div>
                    <p className="text-[13px] leading-relaxed whitespace-pre-line">
                      <Texto tramos={d.antes} />
                    </p>
                  </div>
                  <div className="rounded-md border border-exito/30 bg-superficie p-3">
                    <div className="mb-1.5 text-[11px] font-bold tracking-wide text-exito uppercase">
                      Después
                    </div>
                    <p className="text-[13px] leading-relaxed whitespace-pre-line">
                      <Texto tramos={d.despues} />
                    </p>
                  </div>
                </div>
              );
            })()}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
