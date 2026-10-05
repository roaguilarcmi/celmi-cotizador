'use client';

import { aEscalado, ESCALA_DINERO, formatearMXN } from '@celmi/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@/components/Icon';
import { alClicLibre } from '@/components/tareas/clicLibre';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { mover } from '@/lib/reordenar';
import { PrecioAnterior } from './FormularioPartida';
import { costoDeFila, erroresDeFila, nombreCatalogo, type Catalogos, type FilaEditable } from './modelo';

const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const COLUMNAS = 'grid-cols-[32px_28px_minmax(0,1fr)_96px_180px_150px_130px_72px]';

/**
 * Partidas y costos en un solo paso (decisión 2026-10-05): cada fila resume todo de forma compacta (descripción con
 * formato, SKU, marca, entrega, cantidad, proveedor y costos). Se abre con un clic para capturar o editar en una
 * ventana; se reordena arrastrando la manija o con ↑ ↓ sobre ella.
 */
export function TablaPartidas({
  filas,
  esAdicional,
  catalogos,
  soloLectura,
  onCambiar,
  onAbrir,
}: {
  filas: FilaEditable[];
  esAdicional: boolean;
  catalogos: Catalogos;
  soloLectura: boolean;
  onCambiar: (filas: FilaEditable[]) => void;
  onAbrir: (clave: string) => void;
}) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const lista = useRef<HTMLOListElement>(null);
  const enfocar = useRef<string | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    lista.current?.querySelector<HTMLElement>(`[data-manija="${enfocar.current}"]`)?.focus();
    enfocar.current = null;
  }, [filas]);

  const teclas = (i: number, clave: string) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    enfocar.current = clave;
    onCambiar(mover(filas, i, i + (e.key === 'ArrowUp' ? -1 : 1)));
  };

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="min-w-[860px]">
        <div
          className={`grid ${COLUMNAS} gap-x-3 border-b border-borde px-1 py-2 text-xs font-semibold text-texto-suave`}
        >
          <span />
          <span>#</span>
          <span>Partida</span>
          <span className="text-right">Cantidad</span>
          <span>Proveedor</span>
          <span className="text-right">Costo unitario</span>
          <span className="text-right">Costo total MXN</span>
          <span />
        </div>
        <ol ref={lista} aria-label="Partidas">
          {filas.map((f, i) => {
            const costo = costoDeFila(f);
            const errores = erroresDeFila(f);
            const unidad = catalogos.unidades.find((u) => u.id === f.unidad_id);
            const marca = nombreCatalogo(catalogos.marcas, f.marca_id);
            const mayorista = nombreCatalogo(catalogos.mayoristas, f.mayorista_id);
            return (
              <li
                key={f.clave}
                onClick={alClicLibre(() => onAbrir(f.clave))}
                onDragOver={(e) => {
                  if (arrastrando === null || arrastrando === i) return;
                  e.preventDefault();
                  onCambiar(mover(filas, arrastrando, i));
                  setArrastrando(i);
                }}
                className={`group grid ${COLUMNAS} cursor-pointer items-start gap-x-3 border-b border-borde px-1 py-3 transition-colors last:border-0 ${
                  arrastrando === i ? 'bg-acento-suave/60' : 'hover:bg-superficie-2/70'
                }`}
              >
                <span className="pt-0.5">
                  {!soloLectura && (
                    <button
                      type="button"
                      draggable
                      data-manija={f.clave}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', f.clave);
                        setArrastrando(i);
                      }}
                      onDragEnd={() => setArrastrando(null)}
                      onKeyDown={teclas(i, f.clave)}
                      aria-label={`Mover partida ${i + 1}; usa las flechas`}
                      className="inline-flex size-8 cursor-grab items-center justify-center rounded-sm text-texto-suave opacity-40 group-hover:opacity-100 hover:bg-superficie focus-visible:opacity-100 active:cursor-grabbing"
                    >
                      <Icon name="arrastrar" size={16} strokeWidth={4} />
                    </button>
                  )}
                </span>
                <span className="pt-1.5 text-xs font-semibold text-texto-suave tabular">{i + 1}</span>

                <div className="min-w-0 pt-1">
                  <div className="line-clamp-2 text-[13px] leading-snug [&_p]:inline">
                    {f.descripcion_contenido != null ? (
                      <TextoEnriquecido contenido={f.descripcion_contenido} respaldo={f.descripcion} />
                    ) : (
                      f.descripcion || <span className="text-peligro">Sin descripción</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-texto-suave">
                    {f.sku && <span className="font-mono">{f.sku}</span>}
                    {marca && <span className="font-semibold">{marca}</span>}
                    {f.entrega && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="reloj" size={11} />
                        {f.entrega}
                      </span>
                    )}
                    {esAdicional && (
                      <button
                        type="button"
                        disabled={soloLectura}
                        onClick={() =>
                          onCambiar(filas.map((x, j) => (j === i ? { ...x, se_suma: !x.se_suma } : x)))
                        }
                        title="Clic para cambiar si se suma al total de cada propuesta"
                        className={`rounded-pill px-2 py-px font-semibold ${
                          f.se_suma
                            ? 'bg-acento-suave text-acento-texto'
                            : 'border border-dashed border-texto/25'
                        } ${soloLectura ? '' : 'cursor-pointer'}`}
                      >
                        {f.se_suma ? 'Se suma' : 'Opcional'}
                      </button>
                    )}
                    {Object.keys(errores).length > 0 && (
                      <span className="font-semibold text-peligro">Revisar datos</span>
                    )}
                  </div>
                </div>

                <div className="pt-1 text-right">
                  <span
                    className={`text-[13px] font-semibold tabular ${errores.cantidad ? 'text-peligro' : ''}`}
                  >
                    {f.cantidad || '?'}
                  </span>
                  <div className="text-[11px] text-texto-suave">
                    {unidad?.abreviatura ?? unidad?.nombre ?? ''}
                  </div>
                </div>

                <div className="min-w-0 pt-1 text-[13px]">
                  <div className="truncate">{mayorista || <span className="text-texto-suave">—</span>}</div>
                  <div className="text-[11px] text-texto-suave">
                    {f.moneda}
                    {f.moneda !== 'MXN' && f.tipo_cambio && ` · T.C. ${f.tipo_cambio}`}
                    {f.vigencia && ` · al ${fechaCorta.format(new Date(f.vigencia))}`}
                  </div>
                </div>

                <div className="flex flex-col items-end pt-1 text-[13px] tabular">
                  {f.costo_unitario && !errores.costo_unitario ? (
                    <span>
                      {f.moneda !== 'MXN' && (
                        <span className="text-[11px] text-texto-suave">{f.moneda} </span>
                      )}
                      {formatearMXN(aEscalado(f.costo_unitario.replaceAll(',', ''), ESCALA_DINERO))}
                    </span>
                  ) : (
                    <span className="rounded-pill bg-aviso-suave px-2 py-px text-[11px] font-semibold text-aviso">
                      {errores.costo_unitario ? 'Costo no válido' : 'Sin costo'}
                    </span>
                  )}
                  {f.costo_anterior && (
                    <PrecioAnterior anterior={f.costo_anterior} actual={f.costo_unitario} />
                  )}
                </div>

                <div className="pt-1 text-right text-[13px] font-semibold tabular">
                  {costo ? formatearMXN(costo.costoTotal) : <span className="text-texto-suave">—</span>}
                </div>

                <div className="flex justify-end gap-0.5 opacity-50 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => onAbrir(f.clave)}
                    aria-label={`${soloLectura ? 'Ver' : 'Editar'} la partida ${i + 1}`}
                    title={soloLectura ? 'Ver' : 'Editar'}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie hover:text-texto"
                  >
                    <Icon name={soloLectura ? 'ojo' : 'herramienta'} size={15} />
                  </button>
                  {!soloLectura && (
                    <button
                      type="button"
                      onClick={() => onCambiar(filas.filter((_, j) => j !== i))}
                      aria-label={`Quitar la partida ${i + 1}`}
                      title="Quitar"
                      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie hover:text-peligro"
                    >
                      <Icon name="cerrar" size={15} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
