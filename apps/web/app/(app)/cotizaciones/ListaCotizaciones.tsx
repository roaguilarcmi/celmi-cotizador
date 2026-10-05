import { etiquetaRevision } from '@celmi/core';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui';
import type { CotizacionFila } from '@/lib/datos';
import { haceCuanto } from '@/lib/presentacion';
import { ESTADOS } from './estados';

/** Filas de cotizaciones (lista general y ficha de la oportunidad); la revisión que se muestra es la más reciente. */
export function ListaCotizaciones({
  cotizaciones,
  mostrarOportunidad,
  vacio,
}: {
  cotizaciones: CotizacionFila[];
  mostrarOportunidad?: boolean;
  vacio: string;
}) {
  if (!cotizaciones.length)
    return (
      <p className="rounded-md border border-dashed border-borde px-4 py-6 text-center text-[13px] text-texto-suave">
        {vacio}
      </p>
    );
  return (
    <ul className="flex flex-col">
      {cotizaciones.map((c) => {
        const ultima = c.revisiones[0];
        const estado = ultima ? ESTADOS[ultima.estado] : null;
        return (
          <li key={c.id}>
            <Link
              href={`/cotizaciones/${c.id}`}
              className="group -mx-2 flex items-center gap-3 rounded-md border-b border-borde px-2 py-3 last:border-0 hover:bg-superficie-2/70"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-acento-suave text-acento-texto">
                <Icon name="cotizaciones" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {c.folio ?? 'Sin folio'}
                  {ultima && (
                    <span className="font-normal text-texto-suave"> · {etiquetaRevision(ultima.numero)}</span>
                  )}
                </span>
                <span className="block truncate text-xs text-texto-suave">
                  {mostrarOportunidad && c.oportunidad
                    ? `${c.oportunidad.cliente?.razon_social ?? ''} · ${c.oportunidad.nombre} · `
                    : ''}
                  creada {haceCuanto(c.creado_en)}
                </span>
              </span>
              {estado && <Pill tono={estado.tono}>{estado.texto}</Pill>}
              <Icon
                name="derecha"
                size={16}
                className="text-texto-suave opacity-50 group-hover:opacity-100"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
