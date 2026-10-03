'use client';

import { centavosADecimal, formatearMXN, importeConLetra } from '@celmi/core';
import { porcentaje } from '@celmi/validation';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PasosWizard } from '@/components/PasosWizard';
import { Avatar, Boton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import {
  calcularPropuesta,
  FOLIO_EPOXEMEX,
  OTRAS_COTIZACIONES,
  PROPUESTAS_EPOXEMEX,
  UTILIDAD_EPOXEMEX,
} from '@/lib/epoxemex';

const pesos = (c: bigint) => formatearMXN(c);

export function AutorizacionDemo() {
  const [general, setGeneral] = useState(UTILIDAD_EPOXEMEX);
  const [porPartida, setPorPartida] = useState<Record<string, string>>({});
  const [bloqueado, setBloqueado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const generalValida = porcentaje.safeParse(general).success;
  const utilidadDe = (sku: string) => porPartida[sku] ?? general;

  const calculadas = useMemo(
    () => PROPUESTAS_EPOXEMEX.map((p) => calcularPropuesta(p, (sku) => porPartida[sku] ?? general)),
    [general, porPartida],
  );
  const validas = calculadas.every(Boolean);
  const todas = calculadas.flatMap((c) => c?.partidas ?? []);
  const costo = todas.reduce((s, p) => s + p.costoTotal, 0n);
  const venta = todas.reduce((s, p) => s + p.importe, 0n);

  const aplicarATodas = () => setPorPartida({});

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <nav aria-label="Ruta" className="mb-2.5 flex flex-wrap gap-2 text-[13px] text-texto-suave">
        <Link href="/autorizaciones" className="hover:text-texto">
          Autorizaciones
        </Link>
        <span aria-hidden="true">/</span>
        <span>EPOXEMEX</span>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-texto">{FOLIO_EPOXEMEX}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Autorizar precios</h1>
        {bloqueado ? (
          <Pill tono="exito">Precios autorizados</Pill>
        ) : (
          <Pill tono="aviso">Pendiente de autorización</Pill>
        )}
        <Pill tono="neutro" punto={false}>
          Demostración · no se guarda
        </Pill>
        <div className="ml-auto flex items-center gap-2.5 text-[13px] text-texto-suave">
          <Avatar iniciales="RR" color="#1D5BD8" tamano={28} />
          <span>
            <strong className="text-texto">Rodrigo Rivera</strong> solicitó autorización · 28 sep 2026, 11:02
          </span>
        </div>
      </header>

      <div className="mb-6">
        <PasosWizard actual={4} />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Tarjeta className="min-w-0 flex-[999_1_620px] overflow-hidden">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4 border-b border-borde px-5 py-4.5">
            <div className="mr-auto">
              <Titulo2>Utilidad y precios</Titulo2>
              <p className="mt-1 text-[13px] text-texto-suave">
                Precio = costo × (1 + utilidad) · unitario redondeado a 2 decimales · IVA 16 %
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
              Utilidad general (%)
              <span className="flex gap-2">
                <input
                  value={general}
                  onChange={(e) => setGeneral(e.target.value)}
                  disabled={bloqueado}
                  inputMode="decimal"
                  aria-invalid={!generalValida}
                  className={`tabular h-11 w-28 rounded-md border-2 bg-superficie px-3 text-right text-base font-bold text-texto outline-none disabled:opacity-60 ${
                    generalValida ? 'border-acento' : 'border-peligro'
                  }`}
                />
                <Boton onClick={aplicarATodas} disabled={bloqueado || !generalValida}>
                  Aplicar a todas
                </Boton>
              </span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="bg-superficie-2 text-left text-xs font-semibold text-texto-suave">
                  {['Partida', 'Descripción', 'Mayorista', 'Costo unit.', 'Utilidad', 'Precio sin IVA'].map(
                    (h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={`border-b border-borde px-3 py-2.5 whitespace-nowrap ${i >= 3 ? 'text-right' : ''}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {PROPUESTAS_EPOXEMEX.map((prop, pi) => {
                  const calc = calculadas[pi];
                  return [
                    <tr key={prop.nombre}>
                      <td colSpan={6} className="border-t border-borde px-3 pt-3.5 pb-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="text-sm font-bold">{prop.nombre}</span>
                          <span className="text-[13px] text-texto-suave">
                            {prop.tipo} · {prop.modalidad}
                          </span>
                          {prop.partidas.length > 1 && (
                            <Pill tono="info" punto={false}>
                              Se presenta al cliente en 1 línea
                            </Pill>
                          )}
                          <span className="ml-auto text-[13px] text-texto-suave">
                            Total con IVA{' '}
                            <strong className="tabular text-texto">
                              {calc ? pesos(calc.totales.total) : '—'}
                            </strong>
                          </span>
                        </div>
                      </td>
                    </tr>,
                    ...prop.partidas.map((p, i) => {
                      const r = calc?.partidas[i];
                      const valor = utilidadDe(p.sku);
                      const valida = porcentaje.safeParse(valor).success;
                      return (
                        <tr
                          key={p.sku}
                          className="border-t border-borde transition-[background-color] hover:bg-superficie-2"
                        >
                          <td className="tabular px-3 py-4 align-top font-semibold text-texto-suave">
                            {pi + 1}.{i + 1}
                          </td>
                          <td className="min-w-52 px-3 py-3.5 align-top">
                            <div className="leading-snug font-bold">{p.descripcion}</div>
                            <div className="mt-0.5 text-xs font-semibold text-texto-suave">
                              {p.sku} · {p.cantidad} pzas
                            </div>
                          </td>
                          <td className="px-3 py-3.5 align-top">
                            <div className="font-semibold whitespace-nowrap">{p.mayorista}</div>
                            {OTRAS_COTIZACIONES[p.sku] && (
                              <div className="mt-0.5 text-xs text-texto-suave">
                                También: {OTRAS_COTIZACIONES[p.sku]}
                              </div>
                            )}
                          </td>
                          <td className="tabular px-3 py-4 text-right align-top whitespace-nowrap">
                            {r ? pesos(r.costoUnitarioMXN) : `$${p.costoUnitario}`}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top">
                            <label>
                              <span className="sr-only">
                                Utilidad en porcentaje, partida {pi + 1}.{i + 1}
                              </span>
                              <span className="relative inline-flex items-center">
                                {bloqueado && (
                                  <span className="absolute left-2 text-texto-suave">
                                    <Icon name="candado" size={14} />
                                  </span>
                                )}
                                <input
                                  value={valor}
                                  disabled={bloqueado}
                                  inputMode="decimal"
                                  aria-invalid={!valida}
                                  onChange={(e) => setPorPartida((s) => ({ ...s, [p.sku]: e.target.value }))}
                                  className={`tabular h-10 w-20 rounded-sm border bg-superficie-2 px-2.5 text-right text-sm font-bold text-texto outline-none focus:border-acento disabled:opacity-70 ${
                                    valida ? 'border-borde' : 'border-peligro'
                                  }`}
                                />
                              </span>
                            </label>
                            <div className="tabular mt-1 text-xs font-semibold whitespace-nowrap text-exito">
                              {r ? `+${pesos(r.utilidadUnitaria)} c/u` : '—'}
                            </div>
                          </td>
                          <td className="tabular px-3 py-4 text-right align-top whitespace-nowrap">
                            <div className="font-bold">{r ? pesos(r.precioUnitario) : '—'}</div>
                            <div className="mt-0.5 text-xs font-semibold text-acento-texto">
                              {r ? `Subtotal ${pesos(r.importe)}` : ''}
                            </div>
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:sticky lg:top-6">
          <Tarjeta className="p-5.5">
            <Titulo2>Resumen para el cliente</Titulo2>
            <p className="mt-1 mb-3 text-[13px] text-texto-suave">Total con IVA de cada alternativa</p>
            {calculadas.map((c, i) => (
              <div
                key={PROPUESTAS_EPOXEMEX[i]!.nombre}
                className={`flex justify-between gap-3 py-2.5 text-sm ${i ? 'border-t border-borde' : ''}`}
                title={c ? importeConLetra(c.totales.total) : undefined}
              >
                <span>{PROPUESTAS_EPOXEMEX[i]!.nombre}</span>
                <strong className="tabular">{c ? pesos(c.totales.total) : 'Revisa la utilidad'}</strong>
              </div>
            ))}
            {validas && (
              <div className="mt-3.5 rounded-md bg-exito-suave p-3.5 text-[13px] leading-relaxed text-exito">
                <strong className="text-[15px]">
                  {costo > 0n
                    ? `${(Number(((venta - costo) * 10000n) / costo) / 100).toFixed(1)} % de utilidad`
                    : '—'}
                </strong>{' '}
                sobre el costo si se vendieran todas
                <br />
                {pesos(venta - costo)} sobre {pesos(costo)}
              </div>
            )}
            <div className="mt-4.5 flex flex-col gap-2.5">
              {bloqueado ? (
                <Boton onClick={() => setBloqueado(false)} icono="candado" className="min-h-13 w-full">
                  Desbloquear (sólo demostración)
                </Boton>
              ) : (
                <Boton
                  variante="primario"
                  icono="candado"
                  className="min-h-13 w-full text-[15px]"
                  disabled={!validas}
                  onClick={() => {
                    setBloqueado(true);
                    setAviso(
                      'Precios autorizados y bloqueados. En la Fase 4 esto notificará a Rodrigo y quedará en auditoría.',
                    );
                  }}
                >
                  Autorizar y bloquear precios
                </Boton>
              )}
              <div className="flex gap-2.5">
                <Boton
                  icono="mensaje"
                  className="flex-1"
                  onClick={() => setAviso('Solicitar aclaración llega en la Fase 4.')}
                >
                  Aclaración
                </Boton>
                <Boton
                  variante="peligro"
                  icono="cerrar"
                  className="flex-1"
                  onClick={() => setAviso('Rechazar llega en la Fase 4.')}
                >
                  Rechazar
                </Boton>
              </div>
            </div>
            <p role="status" className="mt-3 flex gap-1.5 text-xs text-texto-suave">
              <Icon name="candado" size={14} />
              {aviso ?? 'Al autorizar, el ejecutivo ya no puede cambiar costos, utilidad ni precios.'}
            </p>
          </Tarjeta>
          <Tarjeta className="p-5">
            <div className="mb-2 text-sm font-semibold">Total con letra · Propuesta 1</div>
            <p className="text-[13px] leading-relaxed text-texto-suave">
              {calculadas[0] ? importeConLetra(calculadas[0].totales.total) : '—'}
            </p>
            <p className="mt-3 text-xs text-texto-suave">
              Subtotal {calculadas[0] ? centavosADecimal(calculadas[0].totales.subtotal) : '—'} · generado por
              el motor de cálculo, sin captura manual.
            </p>
          </Tarjeta>
        </aside>
      </div>
    </div>
  );
}
