'use client';

import { aEscalado, ESCALA_DINERO, formatearMXN } from '@celmi/core';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { alClicLibre } from '@/components/tareas/clicLibre';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Boton } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import { mover } from '@/lib/reordenar';
import { ChipPresentacion, PrecioAnterior } from './FormularioPartida';
import {
  costoDeFila,
  erroresDeFila,
  formatearCosto,
  nombreCatalogo,
  type Catalogos,
  type FilaEditable,
} from './modelo';

const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const COLUMNAS = 'grid-cols-[32px_28px_minmax(0,1fr)_96px_180px_150px_130px_128px]';

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
  onConvertida,
}: {
  filas: FilaEditable[];
  esAdicional: boolean;
  catalogos: Catalogos;
  soloLectura: boolean;
  onCambiar: (filas: FilaEditable[]) => void;
  onAbrir: (clave: string) => void;
  /** Abrir (o crear, con `clave` null) un adicional de la partida `padre`. */
  onAbrirAdicional: (padre: string, clave: string | null) => void;
  /** Tras convertir una partida en adicional: se abre la partida destino para ajustar su descripción. */
  onConvertida?: (destino: string) => void;
}) {
  /** Partida que se va a convertir en adicional de otra (2026-10-10). */
  const [convertir, setConvertir] = useState<string | null>(null);
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

  /**
   * Convierte una partida en adicional de otra (2026-10-10). Sus propios adicionales pasan también a la partida
   * destino (sólo hay un nivel); un incluido toma la cantidad de su partida; deja de recibir cargos prorrateados.
   */
  const convertirEnAdicional = (origen: string, destino: string, presentacion: 'incluida' | 'linea') => {
    const o = lineas.find((x) => x.clave === origen);
    const d = lineas.find((x) => x.clave === destino);
    if (!o || !d) return;
    const comoAdicional = (x: FilaEditable, p: FilaEditable['presentacion']): FilaEditable => ({
      ...x,
      presentacion: p,
      cantidad: p === 'incluida' ? d.cantidad : x.cantidad,
      se_suma: false,
      componentes: [],
      prorratear_entre: [],
    });
    const nuevos = [
      comoAdicional(o, presentacion),
      ...o.componentes.map((c) => comoAdicional(c, c.presentacion === 'linea' ? 'linea' : 'incluida')),
    ];
    onCambiar(
      filas
        .filter((x) => x.clave !== origen)
        .map((x) => (x.clave === destino ? { ...x, componentes: [...x.componentes, ...nuevos] } : x))
        .map((x) =>
          x.prorratear_entre.includes(origen)
            ? { ...x, prorratear_entre: x.prorratear_entre.filter((c) => c !== origen) }
            : x,
        ),
    );
    setConvertir(null);
    onConvertida?.(destino);
  };
  const aConvertir = lineas.find((x) => x.clave === convertir);

  const teclas = (i: number, clave: string) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    enfocar.current = clave;
    reordenar(mover(lineas, i, i + (e.key === 'ArrowUp' ? -1 : 1)));
  };

  const numeroDe = (clave: string) => lineas.findIndex((f) => f.clave === clave) + 1;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="min-w-[912px]">
        <div
          className={`grid ${COLUMNAS} gap-x-3 border-b border-borde px-1 py-2 text-xs font-semibold text-texto-suave`}
        >
          <span />
          <span>#</span>
          <span>Partida</span>
          <span className="text-right">Cantidad</span>
          <span>Proveedor</span>
          <span className="text-right">Costo unitario</span>
          <span className="text-right">Costo total</span>
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
                    {!soloLectura && lineas.length > 1 && (
                      <Accion
                        etiqueta="Convertir en adicional de otra partida"
                        onClick={() => setConvertir(f.clave)}
                      >
                        <Icon name="enlace" size={15} />
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

      {aConvertir && (
        <VentanaFlotante
          titulo={`Convertir la partida ${numeroDe(aConvertir.clave)} en adicional`}
          detalle="Pasa a ser adicional de la partida que elijas, con su propio costo y utilidad."
          onCerrar={() => setConvertir(null)}
        >
          <Convertir
            origen={aConvertir}
            destinos={lineas
              .filter((x) => x.clave !== aConvertir.clave)
              .map((x) => ({ fila: x, numero: numeroDe(x.clave) }))}
            onConvertir={(destino, presentacion) =>
              convertirEnAdicional(aConvertir.clave, destino, presentacion)
            }
          />
        </VentanaFlotante>
      )}
    </div>
  );
}

/** Elegir la partida destino y cómo se presenta el adicional (incluido en su precio o línea visible). */
function Convertir({
  origen,
  destinos,
  onConvertir,
}: {
  origen: FilaEditable;
  destinos: { fila: FilaEditable; numero: number }[];
  onConvertir: (destino: string, presentacion: 'incluida' | 'linea') => void;
}) {
  const ventana = useVentana();
  const [destino, setDestino] = useState<string | null>(null);
  const [presentacion, setPresentacion] = useState<'incluida' | 'linea'>('incluida');
  const elegido = destinos.find((x) => x.fila.clave === destino)?.fila;
  const cambiaCantidad = presentacion === 'incluida' && elegido && elegido.cantidad !== origen.cantidad;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (destino) onConvertir(destino, presentacion);
      }}
      className="flex flex-col gap-5"
    >
      <p className="rounded-md bg-superficie-2 px-3 py-2 text-[13px]">
        <span className="font-semibold">{origen.descripcion || 'Sin descripción'}</span>
        <span className="text-texto-suave"> · {origen.cantidad} pzas.</span>
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-bold">¿De qué partida será adicional?</legend>
        <ul className="flex max-h-60 flex-col overflow-y-auto rounded-md border border-borde">
          {destinos.map(({ fila, numero }) => (
            <li key={fila.clave} className="border-b border-borde last:border-0">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-superficie-2 has-[:checked]:bg-acento-suave">
                <input
                  type="radio"
                  name="destino"
                  value={fila.clave}
                  checked={destino === fila.clave}
                  onChange={() => setDestino(fila.clave)}
                  className="size-4 shrink-0 accent-[var(--c-acento)]"
                />
                <span className="w-6 shrink-0 text-xs font-semibold text-texto-suave tabular">{numero}</span>
                <span className="line-clamp-1 flex-1">{fila.descripcion || 'Sin descripción'}</span>
                <span className="text-xs text-texto-suave tabular">{fila.cantidad} pzas.</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-bold">¿Cómo se presenta al cliente?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                valor: 'incluida',
                nombre: 'Incluido en el precio',
                ayuda: 'El cliente ve una sola línea; lleva la misma cantidad que su partida.',
              },
              {
                valor: 'linea',
                nombre: 'Línea visible',
                ayuda: 'Aparece como línea propia en la cotización.',
              },
            ] as const
          ).map((o) => (
            <label
              key={o.valor}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border border-borde px-3 py-2.5 hover:bg-superficie-2 has-[:checked]:border-acento has-[:checked]:bg-acento-suave"
            >
              <input
                type="radio"
                name="presentacion"
                value={o.valor}
                checked={presentacion === o.valor}
                onChange={() => setPresentacion(o.valor)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--c-acento)]"
              />
              <span>
                <span className="block text-[13px] font-semibold">{o.nombre}</span>
                <span className="block text-xs text-texto-suave">{o.ayuda}</span>
              </span>
            </label>
          ))}
        </div>
        {cambiaCantidad && (
          <p className="text-xs font-semibold text-aviso">
            La cantidad cambiará de {origen.cantidad} a {elegido.cantidad} para igualar a su partida.
          </p>
        )}
        {origen.componentes.length > 0 && (
          <p className="text-xs text-texto-suave">
            Sus {origen.componentes.length} adicionales también pasarán a la partida elegida.
          </p>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton type="submit" variante="primario" icono="enlace" disabled={!destino}>
          Convertir en adicional
        </Boton>
        {ventana && (
          <Boton variante="fantasma" onClick={ventana.intentarCerrar}>
            Cancelar
          </Boton>
        )}
        <span className="text-xs text-texto-suave">
          Después se abre la partida para ajustar su descripción.
        </span>
      </div>
    </form>
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
          {f.marca && <span className="font-semibold">{f.marca}</span>}
          {f.entrega && (
            <span className="inline-flex items-center gap-1">
              <Icon name="reloj" size={11} />
              {f.entrega}
            </span>
          )}
          {extra}
          {errores.vigencia && (
            <span className="rounded-sm bg-peligro px-1.5 font-bold text-white">Precio vencido</span>
          )}
          {Object.keys(errores).some((k) => k !== 'prorratear_entre' && k !== 'vigencia') && (
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
        {costo ? formatearCosto(costo.total, costo.moneda) : <span className="text-texto-suave">—</span>}
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
