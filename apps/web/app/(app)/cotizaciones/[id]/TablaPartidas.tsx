'use client';

import { aEscalado, ESCALA_DINERO, formatearMXN } from '@celmi/core';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { alClicLibre } from '@/components/tareas/clicLibre';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { mover } from '@/lib/reordenar';
import { ChipPresentacion, PrecioAnterior } from './FormularioPartida';
import { costoDeFila, erroresDeFila, nombreCatalogo, type Catalogos, type FilaEditable } from './modelo';

const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const COLUMNAS = 'grid-cols-[32px_28px_minmax(0,1fr)_96px_180px_150px_130px_96px]';

/**
 * Partidas y costos en un solo paso (decisión 2026-10-05): cada fila resume todo de forma compacta; debajo, sus
 * adicionales; al final, los cargos prorrateados. Clic para abrir en una ventana; reordenar con la manija o ↑ ↓.
 */
export function TablaPartidas({
  filas,
  esAdicional,
  catalogos,
  soloLectura,
  onCambiar,
  onAbrir,
  onAbrirAdicional,
}: {
  filas: FilaEditable[];
  esAdicional: boolean;
  catalogos: Catalogos;
  soloLectura: boolean;
  onCambiar: (filas: FilaEditable[]) => void;
  onAbrir: (clave: string) => void;
  /** Abrir (o crear, con `clave` null) un adicional de la partida `padre`. */
  onAbrirAdicional: (padre: string, clave: string | null) => void;
}) {
  const lineas = filas.filter((f) => f.presentacion !== 'prorrateada');
  const cargos = filas.filter((f) => f.presentacion === 'prorrateada');
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const lista = useRef<HTMLOListElement>(null);
  const enfocar = useRef<string | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    lista.current?.querySelector<HTMLElement>(`[data-manija="${enfocar.current}"]`)?.focus();
    enfocar.current = null;
  }, [filas]);

  const reordenar = (nuevas: FilaEditable[]) => onCambiar([...nuevas, ...cargos]);
  const reemplazar = (clave: string, cambio: (f: FilaEditable) => FilaEditable) =>
    onCambiar(filas.map((f) => (f.clave === clave ? cambio(f) : f)));
  const quitar = (clave: string) =>
    // Al quitar una partida también deja de recibir cargos prorrateados.
    onCambiar(
      filas
        .filter((f) => f.clave !== clave)
        .map((f) =>
          f.prorratear_entre.includes(clave)
            ? { ...f, prorratear_entre: f.prorratear_entre.filter((c) => c !== clave) }
            : f,
        ),
    );

  const teclas = (i: number, clave: string) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    enfocar.current = clave;
    reordenar(mover(lineas, i, i + (e.key === 'ArrowUp' ? -1 : 1)));
  };

  const numeroDe = (clave: string) => lineas.findIndex((f) => f.clave === clave) + 1;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="min-w-[880px]">
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
          {lineas.map((f, i) => (
            <li
              key={f.clave}
              onDragOver={(e) => {
                if (arrastrando === null || arrastrando === i) return;
                e.preventDefault();
                reordenar(mover(lineas, arrastrando, i));
                setArrastrando(i);
              }}
              className={`border-b border-borde last:border-0 ${arrastrando === i ? 'bg-acento-suave/60' : ''}`}
            >
              <Fila
                f={f}
                catalogos={catalogos}
                onAbrir={() => onAbrir(f.clave)}
                manija={
                  soloLectura ? null : (
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
                  )
                }
                numero={String(i + 1)}
                extra={
                  esAdicional && (
                    <button
                      type="button"
                      disabled={soloLectura}
                      onClick={() => reemplazar(f.clave, (x) => ({ ...x, se_suma: !x.se_suma }))}
                      title="Clic para cambiar si se suma al total de cada propuesta"
                      className={`rounded-pill px-2 py-px font-semibold ${
                        f.se_suma
                          ? 'bg-acento-suave text-acento-texto'
                          : 'border border-dashed border-texto/25'
                      } ${soloLectura ? '' : 'cursor-pointer'}`}
                    >
                      {f.se_suma ? 'Se suma' : 'Opcional'}
                    </button>
                  )
                }
                acciones={
                  <>
                    {!soloLectura && (
                      <Accion etiqueta="Agregar adicional" onClick={() => onAbrirAdicional(f.clave, null)}>
                        <Icon name="mas" size={15} strokeWidth={2.4} />
                      </Accion>
                    )}
                    <Accion etiqueta={soloLectura ? 'Ver' : 'Editar'} onClick={() => onAbrir(f.clave)}>
                      <Icon name={soloLectura ? 'ojo' : 'herramienta'} size={15} />
                    </Accion>
                    {!soloLectura && (
                      <Accion etiqueta="Quitar" peligro onClick={() => quitar(f.clave)}>
                        <Icon name="cerrar" size={15} />
                      </Accion>
                    )}
                  </>
                }
              />
              {f.componentes.map((c) => (
                <Fila
                  key={c.clave}
                  f={c}
                  catalogos={catalogos}
                  adicional
                  onAbrir={() => onAbrirAdicional(f.clave, c.clave)}
                  numero=""
                  extra={<ChipPresentacion presentacion={c.presentacion} />}
                  acciones={
                    <>
                      <Accion
                        etiqueta={soloLectura ? 'Ver' : 'Editar'}
                        onClick={() => onAbrirAdicional(f.clave, c.clave)}
                      >
                        <Icon name={soloLectura ? 'ojo' : 'herramienta'} size={15} />
                      </Accion>
                      {!soloLectura && (
                        <Accion
                          etiqueta="Quitar adicional"
                          peligro
                          onClick={() =>
                            reemplazar(f.clave, (x) => ({
                              ...x,
                              componentes: x.componentes.filter((y) => y.clave !== c.clave),
                            }))
                          }
                        >
                          <Icon name="cerrar" size={15} />
                        </Accion>
                      )}
                    </>
                  }
                />
              ))}
            </li>
          ))}
        </ol>

        {cargos.length > 0 && (
          <section
            aria-label="Cargos prorrateados"
            className="mt-2 border-t-2 border-dashed border-borde pt-1"
          >
            <h3 className="flex items-center gap-2 px-1 pt-2 pb-1 text-xs font-bold text-texto-suave">
              <Icon name="columnas" size={14} />
              Cargos prorrateados · se reparten entre partidas al autorizar (no son línea para el cliente)
            </h3>
            <ul>
              {cargos.map((c) => (
                <li key={c.clave} className="border-b border-borde last:border-0">
                  <Fila
                    f={c}
                    catalogos={catalogos}
                    onAbrir={() => onAbrir(c.clave)}
                    numero=""
                    extra={
                      c.prorratear_entre.length ? (
                        <span className="font-semibold text-acento-texto">
                          Se reparte entre{' '}
                          {c.prorratear_entre.length === lineas.length
                            ? 'todas las partidas'
                            : `las partidas ${c.prorratear_entre
                                .map(numeroDe)
                                .filter((n) => n > 0)
                                .sort((a, b) => a - b)
                                .join(', ')}`}
                        </span>
                      ) : (
                        <span className="font-semibold text-peligro">
                          Elige entre qué partidas se reparte
                        </span>
                      )
                    }
                    acciones={
                      <>
                        <Accion etiqueta={soloLectura ? 'Ver' : 'Editar'} onClick={() => onAbrir(c.clave)}>
                          <Icon name={soloLectura ? 'ojo' : 'herramienta'} size={15} />
                        </Accion>
                        {!soloLectura && (
                          <Accion etiqueta="Quitar cargo" peligro onClick={() => quitar(c.clave)}>
                            <Icon name="cerrar" size={15} />
                          </Accion>
                        )}
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** Una fila compacta: partida, adicional (sangrado) o cargo. */
function Fila({
  f,
  catalogos,
  adicional,
  numero,
  manija,
  extra,
  acciones,
  onAbrir,
}: {
  f: FilaEditable;
  catalogos: Catalogos;
  adicional?: boolean;
  numero: string;
  manija?: ReactNode;
  extra?: ReactNode;
  acciones: ReactNode;
  onAbrir: () => void;
}) {
  const costo = costoDeFila(f);
  const errores = erroresDeFila(f);
  const unidad = catalogos.unidades.find((u) => u.id === f.unidad_id);
  const marca = nombreCatalogo(catalogos.marcas, f.marca_id);
  const mayorista = nombreCatalogo(catalogos.mayoristas, f.mayorista_id);
  return (
    <div
      onClick={alClicLibre(onAbrir)}
      className={`group grid ${COLUMNAS} cursor-pointer items-start gap-x-3 px-1 transition-colors hover:bg-superficie-2/70 ${
        adicional ? 'py-2' : 'py-3'
      }`}
    >
      <span className="pt-0.5">{manija}</span>
      <span className="pt-1.5 text-xs font-semibold text-texto-suave tabular">{numero}</span>

      <div className={`min-w-0 pt-1 ${adicional ? 'border-l-2 border-acento/30 pl-3' : ''}`}>
        <DescripcionCompacta f={f} adicional={adicional} />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-texto-suave">
          {f.sku && <span className="font-mono">{f.sku}</span>}
          {marca && <span className="font-semibold">{marca}</span>}
          {f.entrega && (
            <span className="inline-flex items-center gap-1">
              <Icon name="reloj" size={11} />
              {f.entrega}
            </span>
          )}
          {extra}
          {Object.keys(errores).some((k) => k !== 'prorratear_entre') && (
            <span className="font-semibold text-peligro">Revisar datos</span>
          )}
        </div>
      </div>

      <div className="pt-1 text-right">
        <span className={`text-[13px] font-semibold tabular ${errores.cantidad ? 'text-peligro' : ''}`}>
          {f.cantidad || '?'}
        </span>
        <div className="text-[11px] text-texto-suave">{unidad?.abreviatura ?? unidad?.nombre ?? ''}</div>
      </div>

      <div className="min-w-0 pt-1 text-[13px]">
        <div className="truncate">{mayorista || <span className="text-texto-suave">—</span>}</div>
        <div className="text-[11px] text-texto-suave">
          {f.moneda}
          {` · T.C. ${f.moneda === 'MXN' ? '1' : f.tipo_cambio || '?'}`}
          {f.vigencia && ` · al ${fechaCorta.format(new Date(f.vigencia))}`}
        </div>
      </div>

      <div className="flex flex-col items-end pt-1 text-[13px] tabular">
        {f.costo_unitario && !errores.costo_unitario ? (
          <span>
            {f.moneda !== 'MXN' && <span className="text-[11px] text-texto-suave">{f.moneda} </span>}
            {formatearMXN(aEscalado(f.costo_unitario.replaceAll(',', ''), ESCALA_DINERO))}
          </span>
        ) : (
          <span className="rounded-pill bg-aviso-suave px-2 py-px text-[11px] font-semibold text-aviso">
            {errores.costo_unitario ? 'Costo no válido' : 'Sin costo'}
          </span>
        )}
        {f.costo_anterior && <PrecioAnterior anterior={f.costo_anterior} actual={f.costo_unitario} />}
      </div>

      <div className="pt-1 text-right text-[13px] font-semibold tabular">
        {costo ? formatearMXN(costo.costoTotal) : <span className="text-texto-suave">—</span>}
      </div>

      <div className="flex justify-end gap-0.5 opacity-50 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {acciones}
      </div>
    </div>
  );
}

/**
 * Descripción recortada a dos líneas; si no cabe, aparece «Ver más» para expandirla ahí mismo (decisión 2026-10-05).
 */
function DescripcionCompacta({ f, adicional }: { f: FilaEditable; adicional?: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const [desborda, setDesborda] = useState(false);
  const [expandida, setExpandida] = useState(false);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    // ResizeObserver avisa al observar y cada vez que cambia el ancho de la columna.
    const ro = new ResizeObserver(() => setDesborda(el.scrollHeight > el.clientHeight + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.descripcion, f.descripcion_contenido, expandida]);

  return (
    <div>
      <div
        ref={caja}
        className={`text-[13px] leading-snug [&_.texto-enriquecido]:text-[13px] [&_.texto-enriquecido]:leading-snug ${
          expandida ? '' : 'line-clamp-2'
        } ${adicional ? 'text-texto-suave' : ''}`}
      >
        {f.descripcion_contenido != null ? (
          <TextoEnriquecido contenido={f.descripcion_contenido} respaldo={f.descripcion} />
        ) : (
          f.descripcion || <span className="text-peligro">Sin descripción</span>
        )}
      </div>
      {(desborda || expandida) && (
        <button
          type="button"
          onClick={() => setExpandida((x) => !x)}
          aria-expanded={expandida}
          className="mt-0.5 inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-acento-texto hover:underline"
        >
          <Icon name="derecha" size={11} className={expandida ? '-rotate-90' : 'rotate-90'} />
          {expandida ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

function Accion({
  etiqueta,
  peligro,
  onClick,
  children,
}: {
  etiqueta: string;
  peligro?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie ${
        peligro ? 'hover:text-peligro' : 'hover:text-texto'
      }`}
    >
      {children}
    </button>
  );
}
