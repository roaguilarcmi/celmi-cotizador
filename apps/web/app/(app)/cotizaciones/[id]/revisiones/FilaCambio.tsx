import { aEscalado, ESCALA_DINERO, formatearMXN, type FilaComparacion } from '@celmi/core';
import type { ReactNode } from 'react';
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

export function FilaCambio({ f, veUtilidad }: { f: FilaComparacion; veUtilidad: boolean }) {
  const p = f.despues ?? f.antes;
  if (!p) return null;
  const a = f.antes;
  const d = f.despues;
  const valor = (x: typeof a, campo: 'costo' | 'precio') => {
    const v = campo === 'costo' ? x?.costoUnitario : x?.precioUnitario;
    return v ? `${x?.moneda !== 'MXN' && campo === 'costo' ? `${x?.moneda} ` : ''}${pesos(v)}` : '—';
  };
  const marcado = (c: string) => (f.campos.includes(c as never) ? 'bg-aviso-suave/50' : '');
  return (
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
        <span className="ml-2 line-clamp-1 inline text-texto-suave" title={p.descripcion}>
          {p.descripcion.length > 70 ? `${p.descripcion.slice(0, 70)}…` : p.descripcion}
        </span>
        {f.campos.includes('descripcion') && (
          <span className="block text-[11px] font-semibold text-aviso">Descripción modificada</span>
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
          <Cambio antes={valor(a, 'precio')} despues={valor(d, 'precio')} variacionPct={f.variacionPrecio} />
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
  );
}
