'use client';

import { aEscalado, calcularTotales, ESCALA_DINERO, formatearMXN } from '@celmi/core';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { Tarjeta, Titulo2 } from '@/components/ui';
import type { Esquema, FinanciamientoFila, RevisionDetalle } from '@/lib/datos';
import { guardarFinanciamiento } from '../acciones';

interface Fila {
  clave: string;
  propuesta_id: string;
  esquema_id: string;
  plazo_meses: string;
  mensualidad: string;
  valor_residual: string;
  factor: string;
  tasa_interes: string;
  gastos_apertura: string;
}

let n = 0;
const clave = () => `fin-${Date.now()}-${++n}`;
const texto = (v: string | null) => (v == null ? '' : String(Number(v)));

const COLUMNAS: { campo: keyof Fila; etiqueta: string; decimales: number; ayuda: string }[] = [
  { campo: 'mensualidad', etiqueta: 'Mensualidad', decimales: 2, ayuda: '$' },
  { campo: 'valor_residual', etiqueta: 'Valor residual', decimales: 2, ayuda: '$' },
  { campo: 'factor', etiqueta: 'Factor', decimales: 6, ayuda: '' },
  { campo: 'tasa_interes', etiqueta: 'Tasa de interés', decimales: 4, ayuda: '%' },
  { campo: 'gastos_apertura', etiqueta: 'Gastos de apertura / ratificación', decimales: 2, ayuda: '$' },
];

/**
 * Propuesta de financiamiento (decisión 2026-10-05): después de la autorización de precios, por cada propuesta se
 * eligen uno o varios esquemas y, por cada esquema y plazo, se capturan los datos de la financiera (no se calculan).
 */
export function PasoFinanciamiento({
  revision,
  cotizacionId,
  puedeEditar,
  esquemas,
  filasIniciales,
  tipoOportunidad,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  puedeEditar: boolean;
  /** Esquemas de financiamiento activos (sin «Adquisición»). */
  esquemas: Esquema[];
  filasIniciales: FinanciamientoFila[];
  tipoOportunidad: 'adquisicion' | 'arrendamiento';
}) {
  const autorizada = revision.estado === 'autorizada';
  const editable = puedeEditar && autorizada;
  const desdeServidor = (): Fila[] =>
    filasIniciales.map((f) => ({
      clave: f.id,
      propuesta_id: f.propuesta_id,
      esquema_id: f.esquema_id,
      plazo_meses: String(f.plazo_meses),
      mensualidad: texto(f.mensualidad),
      valor_residual: texto(f.valor_residual),
      factor: texto(f.factor),
      tasa_interes: texto(f.tasa_interes),
      gastos_apertura: texto(f.gastos_apertura),
    }));
  const [filas, setFilas] = useState<Fila[]>(desdeServidor);
  const [base, setBase] = useState(() => JSON.stringify(desdeServidor()));
  const [previas, setPrevias] = useState(filasIniciales);
  if (filasIniciales !== previas) {
    setPrevias(filasIniciales);
    const nuevas = desdeServidor();
    setFilas(nuevas);
    setBase(JSON.stringify(nuevas));
  }
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const sucio = editable && JSON.stringify(filas) !== base;
  const principales = revision.propuestas.filter((p) => !p.es_adicional);

  const cambiar = (c: string, cambio: Partial<Fila>) =>
    setFilas((xs) => xs.map((f) => (f.clave === c ? { ...f, ...cambio } : f)));

  const alternarEsquema = (propuesta: string, esquema: Esquema) => {
    const tiene = filas.some((f) => f.propuesta_id === propuesta && f.esquema_id === esquema.id);
    if (tiene)
      setFilas((xs) => xs.filter((f) => !(f.propuesta_id === propuesta && f.esquema_id === esquema.id)));
    else {
      // Se proponen los plazos del catálogo del esquema; se pueden quitar o agregar otros.
      const plazos = esquema.plazos_meses.length ? esquema.plazos_meses : [36];
      setFilas((xs) => [
        ...xs,
        ...plazos.map((p) => ({
          clave: clave(),
          propuesta_id: propuesta,
          esquema_id: esquema.id,
          plazo_meses: String(p),
          mensualidad: '',
          valor_residual: '',
          factor: '',
          tasa_interes: '',
          gastos_apertura: '',
        })),
      ]);
    }
  };

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarFinanciamiento(
        revision.id,
        cotizacionId,
        filas.map((f) => ({
          propuesta_id: f.propuesta_id,
          esquema_id: f.esquema_id,
          plazo_meses: Number(f.plazo_meses),
          mensualidad: f.mensualidad.replaceAll(',', ''),
          valor_residual: f.valor_residual.replaceAll(',', ''),
          factor: f.factor,
          tasa_interes: f.tasa_interes,
          gastos_apertura: f.gastos_apertura.replaceAll(',', ''),
        })),
      );
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
      if (!r.error) setBase(JSON.stringify(filas));
    });

  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="px-6 py-4">
        <Titulo2>Propuesta de financiamiento</Titulo2>
        <p className="mt-0.5 text-[13px] text-texto-suave">
          Por cada propuesta elige uno o varios esquemas y captura, por plazo, los datos que da la financiera.
        </p>
        {!autorizada && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-superficie-2 px-4 py-3 text-[13px] text-texto-suave">
            <Icon name="candado" size={16} />
            Se captura cuando los precios estén autorizados (paso «Autorización»).
          </p>
        )}
        {tipoOportunidad === 'adquisicion' && (
          <p className="mt-3 rounded-md bg-info-suave px-4 py-2.5 text-[13px] text-info">
            La oportunidad es de adquisición: el financiamiento es opcional.
          </p>
        )}
      </Tarjeta>

      {principales.map((p) => {
        const lineas = p.partidas
          .filter((pa) => pa.precio)
          .map((pa) => ({
            importe:
              aEscalado(String(pa.precio?.precio_unitario ?? '0'), ESCALA_DINERO) * BigInt(pa.cantidad),
          }));
        const totales = lineas.length === p.partidas.length && lineas.length ? calcularTotales(lineas) : null;
        const elegidos = esquemas.filter((e) =>
          filas.some((f) => f.propuesta_id === p.id && f.esquema_id === e.id),
        );
        return (
          <Tarjeta key={p.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-borde px-6 py-3">
              <h3 className="mr-auto text-[15px] font-bold">{p.nombre}</h3>
              <span className="text-[13px] text-texto-suave">
                Precio con IVA:{' '}
                <strong className="text-texto tabular">
                  {totales ? formatearMXN(totales.total) : 'pendiente de autorizar'}
                </strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-6 pt-4">
              {esquemas.map((e) => {
                const activo = elegidos.includes(e);
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={activo}
                    disabled={!editable}
                    onClick={() => alternarEsquema(p.id, e)}
                    className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill border px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${
                      activo
                        ? 'border-paso bg-paso text-white'
                        : 'border-borde bg-superficie text-texto-suave hover:text-texto'
                    }`}
                  >
                    <Icon name={activo ? 'palomita' : 'mas'} size={14} strokeWidth={2.4} />
                    {e.nombre}
                  </button>
                );
              })}
            </div>

            {elegidos.length === 0 ? (
              <p className="px-6 py-5 text-[13px] text-texto-suave">
                Elige los esquemas que aplican a esta propuesta.
              </p>
            ) : (
              elegidos.map((e) => {
                const propias = filas.filter((f) => f.propuesta_id === p.id && f.esquema_id === e.id);
                return (
                  <section key={e.id} aria-label={e.nombre} className="px-6 pt-4 pb-2">
                    <h4 className="mb-1.5 text-[13px] font-bold">{e.nombre}</h4>
                    <div className="-mx-1 overflow-x-auto px-1">
                      <table className="w-full min-w-[820px] text-[13px]">
                        <thead>
                          <tr className="text-left text-xs text-texto-suave">
                            <th className="w-24 py-1.5 pr-2 font-semibold">Plazo (meses)</th>
                            {COLUMNAS.map((c) => (
                              <th key={c.campo} className="py-1.5 pr-2 text-right font-semibold">
                                {c.etiqueta}
                              </th>
                            ))}
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {propias.map((f) => (
                            <tr key={f.clave} className="border-t border-borde">
                              <td className="py-1.5 pr-2">
                                <Entrada
                                  etiqueta={`Plazo de ${e.nombre}`}
                                  valor={f.plazo_meses}
                                  disabled={!editable}
                                  onCambiar={(v) =>
                                    cambiar(f.clave, { plazo_meses: v.replace(/[^\d]/g, '') })
                                  }
                                />
                              </td>
                              {COLUMNAS.map((c) => (
                                <td key={c.campo} className="py-1.5 pr-2">
                                  <Entrada
                                    etiqueta={`${c.etiqueta} a ${f.plazo_meses} meses`}
                                    valor={f[c.campo]}
                                    prefijo={c.ayuda}
                                    disabled={!editable}
                                    invalido={
                                      Boolean(f[c.campo]) &&
                                      !new RegExp(`^\\d+(\\.\\d{1,${c.decimales}})?$`).test(
                                        f[c.campo].replaceAll(',', ''),
                                      )
                                    }
                                    onCambiar={(v) =>
                                      cambiar(f.clave, { [c.campo]: v.replace(/[^\d.,]/g, '') })
                                    }
                                  />
                                </td>
                              ))}
                              <td className="py-1.5 text-right">
                                {editable && (
                                  <button
                                    type="button"
                                    onClick={() => setFilas((xs) => xs.filter((x) => x.clave !== f.clave))}
                                    aria-label={`Quitar plazo de ${f.plazo_meses} meses`}
                                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie-2 hover:text-peligro"
                                  >
                                    <Icon name="cerrar" size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {editable && (
                      <button
                        type="button"
                        onClick={() =>
                          setFilas((xs) => [
                            ...xs,
                            {
                              clave: clave(),
                              propuesta_id: p.id,
                              esquema_id: e.id,
                              plazo_meses: '',
                              mensualidad: '',
                              valor_residual: '',
                              factor: '',
                              tasa_interes: '',
                              gastos_apertura: '',
                            },
                          ])
                        }
                        className="mt-1 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-acento-texto hover:bg-acento-suave"
                      >
                        <Icon name="mas" size={13} strokeWidth={2.6} />
                        Agregar plazo
                      </button>
                    )}
                  </section>
                );
              })
            )}
            <div className="h-3" />
          </Tarjeta>
        );
      })}

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pendiente || !sucio}
            onClick={guardar}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="guardado" size={16} />
            {pendiente ? 'Guardando…' : 'Guardar financiamiento'}
          </button>
          {sucio && <span className="text-xs font-semibold text-aviso">Cambios sin guardar</span>}
          {mensaje && (
            <span className={`text-xs font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}>
              {mensaje.texto}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Entrada({
  etiqueta,
  valor,
  prefijo,
  disabled,
  invalido,
  onCambiar,
}: {
  etiqueta: string;
  valor: string;
  prefijo?: string;
  disabled: boolean;
  invalido?: boolean;
  onCambiar: (v: string) => void;
}) {
  return (
    <div
      className={`flex h-9 items-center rounded-md border-2 bg-superficie px-2 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento-suave ${
        invalido ? 'border-peligro' : 'border-texto/15'
      } ${disabled ? 'bg-superficie-2' : ''}`}
    >
      {prefijo === '$' && <span className="text-xs text-texto-suave">$</span>}
      <input
        aria-label={etiqueta}
        inputMode="decimal"
        value={valor}
        disabled={disabled}
        onChange={(e) => onCambiar(e.target.value)}
        className="h-full w-full min-w-0 bg-transparent px-1 text-right text-[13px] text-texto tabular outline-none"
      />
      {prefijo === '%' && <span className="text-xs text-texto-suave">%</span>}
    </div>
  );
}
