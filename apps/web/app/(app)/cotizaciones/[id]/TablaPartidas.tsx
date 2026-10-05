'use client';

import { aEscalado, ESCALA_DINERO, formatearMXN, mejoraDePrecio } from '@celmi/core';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { mover } from '@/lib/reordenar';
import { costoDeFila, erroresDeFila, type Catalogos, type FilaEditable } from './modelo';

export type Vista = 'partidas' | 'costos';

const celda = 'border-b border-borde px-1.5 py-1.5 align-top';
const control =
  'h-9 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-2 text-[13px] text-texto outline-none transition-colors hover:border-borde focus:border-acento focus:bg-superficie focus:ring-2 focus:ring-acento-suave disabled:hover:border-transparent';
const conError = 'border-peligro/60 bg-peligro-suave/40';

/**
 * Tabla de partidas de una propuesta. Dos vistas sobre las mismas filas: «Partidas» (qué se cotiza) y «Costos»
 * (con quién y a qué costo). Se edita en línea; se reordena arrastrando la manija o con ↑ ↓ sobre ella.
 */
export function TablaPartidas({
  filas,
  vista,
  esAdicional,
  catalogos,
  soloLectura,
  onCambiar,
  onFormato,
}: {
  filas: FilaEditable[];
  vista: Vista;
  esAdicional: boolean;
  catalogos: Catalogos;
  soloLectura: boolean;
  onCambiar: (filas: FilaEditable[]) => void;
  onFormato: (clave: string) => void;
}) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const enfocar = useRef<string | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    cuerpo.current?.querySelector<HTMLElement>(`[data-manija="${enfocar.current}"]`)?.focus();
    enfocar.current = null;
  }, [filas]);

  const cambiar = (i: number, cambio: Partial<FilaEditable>) =>
    onCambiar(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const teclas = (i: number, clave: string) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    enfocar.current = clave;
    onCambiar(mover(filas, i, i + (e.key === 'ArrowUp' ? -1 : 1)));
  };

  const encabezados: { texto: string; ancho: string; derecha?: boolean }[] =
    vista === 'partidas'
      ? [
          { texto: 'SKU', ancho: 'w-[140px]' },
          { texto: 'Descripción', ancho: 'min-w-[300px]' },
          { texto: 'Marca', ancho: 'w-[130px]' },
          { texto: 'Entrega', ancho: 'w-[120px]' },
          { texto: 'Unidad', ancho: 'w-[110px]' },
          { texto: 'Cant.', ancho: 'w-[76px]', derecha: true },
          ...(esAdicional ? [{ texto: 'Se suma', ancho: 'w-[84px]' }] : []),
        ]
      : [
          { texto: 'Partida', ancho: 'min-w-[220px]' },
          { texto: 'Mayorista', ancho: 'w-[150px]' },
          { texto: 'Moneda', ancho: 'w-[86px]' },
          { texto: 'Costo unitario', ancho: 'w-[130px]', derecha: true },
          { texto: 'T.C.', ancho: 'w-[100px]', derecha: true },
          { texto: 'Costo total MXN', ancho: 'w-[140px]', derecha: true },
          { texto: 'Vigencia', ancho: 'w-[140px]' },
        ];

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr className="text-left text-xs text-texto-suave">
            <th scope="col" className="w-8 border-b border-borde" aria-label="Orden" />
            <th scope="col" className="w-9 border-b border-borde px-1.5 py-2 font-semibold">
              #
            </th>
            {encabezados.map((h) => (
              <th
                key={h.texto}
                scope="col"
                className={`${h.ancho} border-b border-borde px-3 py-2 font-semibold whitespace-nowrap ${h.derecha ? 'text-right' : ''}`}
              >
                {h.texto}
              </th>
            ))}
            <th scope="col" className="w-[76px] border-b border-borde" aria-label="Acciones" />
          </tr>
        </thead>
        <tbody ref={cuerpo}>
          {filas.map((f, i) => {
            const errores = erroresDeFila(f);
            const costo = vista === 'costos' ? costoDeFila(f) : null;
            return (
              <tr
                key={f.clave}
                onDragOver={(e) => {
                  if (arrastrando === null || arrastrando === i) return;
                  e.preventDefault();
                  onCambiar(mover(filas, arrastrando, i));
                  setArrastrando(i);
                }}
                className={`group ${arrastrando === i ? 'bg-acento-suave/50' : 'hover:bg-superficie-2/60'}`}
              >
                <td className={`${celda} text-center`}>
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
                      className="inline-flex size-8 cursor-grab items-center justify-center rounded-sm text-texto-suave opacity-40 group-hover:opacity-100 hover:bg-superficie-2 focus-visible:opacity-100 active:cursor-grabbing"
                    >
                      <Icon name="arrastrar" size={16} strokeWidth={4} />
                    </button>
                  )}
                </td>
                <td className={`${celda} px-2 pt-3.5 text-xs font-semibold text-texto-suave tabular`}>
                  {i + 1}
                </td>

                {vista === 'partidas' ? (
                  <>
                    <td className={celda}>
                      <input
                        aria-label={`SKU de la partida ${i + 1}`}
                        value={f.sku}
                        disabled={soloLectura}
                        maxLength={60}
                        onChange={(e) => cambiar(i, { sku: e.target.value })}
                        className={`${control} font-mono text-xs`}
                      />
                    </td>
                    <td className={celda}>
                      <textarea
                        aria-label={`Descripción de la partida ${i + 1}`}
                        value={f.descripcion}
                        disabled={soloLectura}
                        maxLength={2000}
                        rows={1}
                        title={errores.descripcion}
                        onChange={(e) =>
                          cambiar(i, { descripcion: e.target.value, descripcion_contenido: null })
                        }
                        className={`${control} min-h-9 resize-none py-2 leading-snug [field-sizing:content] ${errores.descripcion ? conError : ''}`}
                      />
                      {f.descripcion_contenido != null && (
                        <span className="ml-2 text-[11px] font-semibold text-acento-texto">Con formato</span>
                      )}
                    </td>
                    <td className={celda}>
                      <Selector
                        etiqueta={`Marca de la partida ${i + 1}`}
                        valor={f.marca_id}
                        opciones={catalogos.marcas.map((m) => ({ valor: m.id, texto: m.nombre }))}
                        disabled={soloLectura}
                        onCambiar={(v) => cambiar(i, { marca_id: v })}
                      />
                    </td>
                    <td className={celda}>
                      <input
                        aria-label={`Tiempo de entrega de la partida ${i + 1}`}
                        value={f.entrega}
                        disabled={soloLectura}
                        maxLength={60}
                        placeholder="10 semanas"
                        onChange={(e) => cambiar(i, { entrega: e.target.value })}
                        className={control}
                      />
                    </td>
                    <td className={celda}>
                      <Selector
                        etiqueta={`Unidad de la partida ${i + 1}`}
                        valor={f.unidad_id}
                        opciones={catalogos.unidades.map((u) => ({ valor: u.id, texto: u.nombre }))}
                        disabled={soloLectura}
                        onCambiar={(v) => cambiar(i, { unidad_id: v })}
                      />
                    </td>
                    <td className={celda}>
                      <input
                        aria-label={`Cantidad de la partida ${i + 1}`}
                        inputMode="numeric"
                        value={f.cantidad}
                        disabled={soloLectura}
                        title={errores.cantidad}
                        onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(/[^\d]/g, '') })}
                        className={`${control} text-right tabular ${errores.cantidad ? conError : ''}`}
                      />
                    </td>
                    {esAdicional && (
                      <td className={`${celda} pt-2.5 text-center`}>
                        <input
                          type="checkbox"
                          aria-label={`Sumar la partida ${i + 1} a cada propuesta`}
                          title="Se suma al total de cada propuesta principal"
                          checked={f.se_suma}
                          disabled={soloLectura}
                          onChange={(e) => cambiar(i, { se_suma: e.target.checked })}
                          className="size-4 accent-acento"
                        />
                      </td>
                    )}
                  </>
                ) : (
                  <>
                    <td className={`${celda} px-3 pt-3`}>
                      <div className="line-clamp-2 leading-snug" title={f.descripcion}>
                        {f.descripcion || <span className="text-peligro">Sin descripción</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-texto-suave tabular">
                        {f.cantidad || '?'} × {f.sku || 'sin SKU'}
                      </div>
                    </td>
                    <td className={celda}>
                      <Selector
                        etiqueta={`Mayorista de la partida ${i + 1}`}
                        valor={f.mayorista_id}
                        opciones={catalogos.mayoristas.map((m) => ({ valor: m.id, texto: m.nombre }))}
                        disabled={soloLectura}
                        onCambiar={(v) => cambiar(i, { mayorista_id: v })}
                      />
                    </td>
                    <td className={celda}>
                      <Selector
                        etiqueta={`Moneda de la partida ${i + 1}`}
                        valor={f.moneda}
                        opciones={catalogos.monedas.map((m) => ({ valor: m.codigo, texto: m.codigo }))}
                        disabled={soloLectura}
                        sinVacio
                        onCambiar={(v) =>
                          cambiar(i, {
                            moneda: v ?? 'MXN',
                            tipo_cambio: v === 'MXN' ? '1' : f.tipo_cambio === '1' ? '' : f.tipo_cambio,
                          })
                        }
                      />
                    </td>
                    <td className={celda}>
                      <input
                        aria-label={`Costo unitario de la partida ${i + 1}`}
                        inputMode="decimal"
                        value={f.costo_unitario}
                        disabled={soloLectura}
                        placeholder="0.00"
                        title={errores.costo_unitario}
                        onChange={(e) =>
                          cambiar(i, { costo_unitario: e.target.value.replace(/[^\d.,]/g, '') })
                        }
                        className={`${control} text-right tabular ${errores.costo_unitario ? conError : ''} ${!f.costo_unitario ? 'bg-aviso-suave/50' : ''}`}
                      />
                      {f.costo_anterior && (
                        <PrecioAnterior anterior={f.costo_anterior} actual={f.costo_unitario} />
                      )}
                    </td>
                    <td className={celda}>
                      <input
                        aria-label={`Tipo de cambio de la partida ${i + 1}`}
                        inputMode="decimal"
                        value={f.moneda === 'MXN' ? '1' : f.tipo_cambio}
                        disabled={soloLectura || f.moneda === 'MXN'}
                        placeholder="0.00000"
                        title={
                          errores.tipo_cambio ??
                          (f.moneda === 'MXN' ? 'En pesos el tipo de cambio es 1' : undefined)
                        }
                        onChange={(e) => cambiar(i, { tipo_cambio: e.target.value.replace(/[^\d.]/g, '') })}
                        className={`${control} text-right tabular disabled:text-texto-suave ${errores.tipo_cambio ? conError : ''}`}
                      />
                    </td>
                    <td className={`${celda} px-3 pt-3 text-right font-semibold tabular`}>
                      {costo ? formatearMXN(costo.costoTotal) : <span className="text-texto-suave">—</span>}
                      {costo && f.moneda !== 'MXN' && (
                        <div className="text-[11px] font-normal text-texto-suave">
                          {formatearMXN(costo.costoUnitarioMXN)} c/u
                        </div>
                      )}
                    </td>
                    <td className={celda}>
                      <input
                        type="date"
                        aria-label={`Vigencia del precio de la partida ${i + 1}`}
                        value={f.vigencia}
                        disabled={soloLectura}
                        onChange={(e) => cambiar(i, { vigencia: e.target.value })}
                        className={control}
                      />
                    </td>
                  </>
                )}

                <td className={`${celda} whitespace-nowrap`}>
                  {!soloLectura && (
                    <div className="flex justify-end gap-0.5 opacity-50 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {vista === 'partidas' && (
                        <AccionFila
                          etiqueta={`Dar formato a la descripción de la partida ${i + 1}`}
                          onClick={() => onFormato(f.clave)}
                        >
                          <span className="text-xs font-bold">Aa</span>
                        </AccionFila>
                      )}
                      <AccionFila
                        etiqueta={`Quitar la partida ${i + 1}`}
                        peligro
                        onClick={() => onCambiar(filas.filter((_, j) => j !== i))}
                      >
                        <Icon name="cerrar" size={15} />
                      </AccionFila>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Selector({
  etiqueta,
  valor,
  opciones,
  disabled,
  sinVacio,
  onCambiar,
}: {
  etiqueta: string;
  valor: string | null;
  opciones: { valor: string; texto: string }[];
  disabled: boolean;
  sinVacio?: boolean;
  onCambiar: (v: string | null) => void;
}) {
  return (
    <select
      aria-label={etiqueta}
      value={valor ?? ''}
      disabled={disabled}
      onChange={(e) => onCambiar(e.target.value || null)}
      className={`${control} cursor-pointer pr-1 ${!valor ? 'text-texto-suave' : ''}`}
    >
      {!sinVacio && <option value="">—</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}

function AccionFila({
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
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie-2 ${
        peligro ? 'hover:text-peligro' : 'hover:text-texto'
      }`}
    >
      {children}
    </button>
  );
}

/** «Precio anterior» tachado con el % de mejora (aclaración 2026-10-03). */
function PrecioAnterior({ anterior, actual }: { anterior: string; actual: string }) {
  let porcentaje: string | null = null;
  try {
    if (actual) porcentaje = mejoraDePrecio(anterior, actual.replaceAll(',', '')).porcentaje;
  } catch {
    porcentaje = null;
  }
  return (
    <div className="mt-0.5 flex justify-end gap-1.5 px-2 text-[11px] tabular">
      <span className="text-texto-suave line-through" title="Precio anterior">
        {formatearMXN(aEscalado(anterior, ESCALA_DINERO))}
      </span>
      {porcentaje && Number(porcentaje) > 0 && (
        <span className="font-semibold text-exito">−{porcentaje} %</span>
      )}
    </div>
  );
}
