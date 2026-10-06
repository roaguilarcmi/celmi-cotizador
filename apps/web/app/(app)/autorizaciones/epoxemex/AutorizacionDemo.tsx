'use client';

import { aEscalado, conIva, formatearMXN, importeConLetra, type ResultadoPartida } from '@celmi/core';
import type { PartidaFixture } from '@celmi/core/fixtures/epoxemex';
import { porcentaje } from '@celmi/validation';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { PasosWizard } from '@/components/PasosWizard';
import { Avatar, Boton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import { calcularPropuesta, FOLIO_EPOXEMEX, PROPUESTAS_EPOXEMEX, UTILIDAD_EPOXEMEX } from '@/lib/epoxemex';
import {
  COLUMNAS,
  GRUPOS,
  Indicador,
  MenuColumnas,
  PrecioAnterior,
  useColumnasOcultas,
  type Columna,
  type Grupo,
} from '@/components/corrida/Corrida';

const pesos = (c: bigint) => formatearMXN(c);
const suma = (xs: bigint[]) => xs.reduce((s, x) => s + x, 0n);

export function AutorizacionDemo() {
  const [general, setGeneral] = useState(UTILIDAD_EPOXEMEX);
  const [porPartida, setPorPartida] = useState<Record<string, string>>({});
  const [ocultas, cambiarOcultas] = useColumnasOcultas();
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
  const costo = suma(todas.map((p) => p.costoTotal));
  const venta = suma(todas.map((p) => p.importe));
  const utilidad = venta - costo;
  // Rango entre alternativas; los adicionales (Accesorio) no son alternativa (regla pendiente, igual que el dashboard).
  const totalesCliente = calculadas
    .filter((c) => c?.propuesta.tipo !== 'Accesorio')
    .map((c) => c?.totales.total)
    .filter((t): t is bigint => t !== undefined);
  const columnas = COLUMNAS.filter((c) => !ocultas.has(c.id));
  const pctUtilidad = costo > 0n ? (Number((utilidad * 10000n) / costo) / 100).toFixed(1) : '0.0';

  /** Valor de cada celda numérica o de texto, en el orden de COLUMNAS. */
  const celda = (
    col: Columna,
    p: PartidaFixture,
    r: ResultadoPartida | undefined,
    ref: string,
  ): ReactNode => {
    const v = (c: bigint | undefined) => (c === undefined ? '—' : pesos(c));
    switch (col.id) {
      case 'marca':
        return p.marca;
      case 'mayorista':
        return p.mayorista;
      case 'modelo':
        return <span className="font-semibold">{p.sku}</span>;
      case 'entrega':
        return p.entrega;
      case 'unidad':
        return p.unidad;
      case 'cantidad':
        return (
          <span className="inline-flex min-w-11 items-center justify-center rounded-md bg-neutro-suave px-2.5 py-1 text-base font-bold text-texto">
            {p.cantidad}
          </span>
        );
      case 'unitario':
        return (
          <>
            {pesos(aEscalado(p.costoUnitario, 2))}
            {p.costoAnterior && <PrecioAnterior anterior={p.costoAnterior} actual={p.costoUnitario} />}
          </>
        );
      case 'moneda':
        return p.moneda;
      case 'tc':
        return '1.00';
      case 'unitarioFinal':
        return v(r?.costoUnitarioMXN);
      case 'compra':
        return <span className="font-semibold">{v(r?.costoTotal)}</span>;
      case 'compraIva':
        return v(r && conIva(r.costoTotal));
      case 'utilidadPct': {
        const valor = utilidadDe(p.sku);
        const valida = porcentaje.safeParse(valor).success;
        return (
          <label className="relative inline-flex items-center">
            <span className="sr-only">Utilidad en porcentaje, partida {ref}</span>
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
              className={`tabular h-10 w-20 rounded-sm border-2 bg-superficie px-2.5 text-right text-sm font-bold text-texto outline-none focus:border-acento disabled:opacity-70 ${
                valida ? 'border-exito/40' : 'border-peligro'
              }`}
            />
          </label>
        );
      }
      case 'utilidadUnit':
        return <span className="text-exito">{v(r?.utilidadUnitaria)}</span>;
      case 'utilidadTotal':
        return <span className="font-semibold text-exito">{v(r?.utilidadTotal)}</span>;
      case 'utilidadTotalIva':
        return <span className="text-exito">{v(r && conIva(r.utilidadTotal))}</span>;
      case 'pvUnit':
        return <span className="text-[15px] font-bold text-acento-texto">{v(r?.precioUnitario)}</span>;
      case 'pvUnitIva':
        return v(r && conIva(r.precioUnitario));
      case 'venta':
        return <span className="font-bold">{v(r?.importe)}</span>;
      case 'ventaIva':
        return v(r && conIva(r.importe));
      default:
        return null;
    }
  };

  const totalPie: Partial<Record<string, bigint>> = {
    compra: costo,
    compraIva: conIva(costo),
    utilidadTotal: utilidad,
    utilidadTotalIva: conIva(utilidad),
    venta,
    ventaIva: conIva(venta),
  };

  const gruposVisibles = (Object.keys(GRUPOS) as Grupo[])
    .map((g) => ({ g, span: columnas.filter((c) => c.grupo === g).length }))
    .filter((x) => x.span > 0);

  // Clases de las dos primeras columnas, fijas al desplazarse a la derecha.
  const fija1 = 'sticky left-0 z-10 w-14 min-w-14';
  const fija2 = 'sticky left-14 z-10 w-72 min-w-72 border-r border-borde';

  return (
    <div className="animar-entrada mx-auto max-w-[1600px]">
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
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Corrida de precios</h1>
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

      <div className="mb-5">
        <PasosWizard actual={3} />
      </div>

      <div className="mb-5 flex flex-wrap gap-4">
        <Indicador
          etiqueta="Costo compra sin IVA"
          valor={pesos(costo)}
          detalle={`Con IVA ${pesos(conIva(costo))}`}
        />
        <Indicador
          etiqueta="Total utilidad sin IVA"
          valor={pesos(utilidad)}
          detalle={`${pctUtilidad} % sobre el costo · con IVA ${pesos(conIva(utilidad))}`}
          tono="text-exito"
        />
        <Indicador
          etiqueta="Total de venta sin IVA"
          valor={pesos(venta)}
          detalle={`Con IVA ${pesos(conIva(venta))}`}
          tono="text-acento-texto"
        />
        <Indicador
          etiqueta="Propuestas para el cliente"
          valor="6 + 1 adicional"
          detalle={
            totalesCliente.length
              ? `De ${pesos(totalesCliente.reduce((a, b) => (b < a ? b : a)))} a ${pesos(totalesCliente.reduce((a, b) => (b > a ? b : a)))} con IVA`
              : '—'
          }
        />
      </div>

      <Tarjeta className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 border-b border-borde px-5 py-4">
          <div className="mr-auto">
            <Titulo2>
              Corrida · {PROPUESTAS_EPOXEMEX.length} propuestas, {todas.length} partidas
            </Titulo2>
            <p className="mt-1 text-[13px] text-texto-suave">
              Mismas columnas que el formato de Excel. Precio = costo × (1 + utilidad), unitario redondeado a
              2 decimales.
            </p>
          </div>
          <MenuColumnas ocultas={ocultas} onCambio={cambiarOcultas} />
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
              <Boton onClick={() => setPorPartida({})} disabled={bloqueado || !generalValida}>
                Aplicar a todas
              </Boton>
            </span>
          </label>
        </div>

        <div className="max-h-[72vh] overflow-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={2}
                  className={`sticky left-0 z-10 border-r border-b border-borde bg-superficie px-3 py-2 text-left text-xs font-bold text-texto-suave`}
                >
                  Partida y descripción
                </th>
                {gruposVisibles.map(({ g, span }) => (
                  <th
                    key={g}
                    scope="colgroup"
                    colSpan={span}
                    className={`border-b border-l-2 border-b-borde border-l-superficie px-3 py-2 text-left text-xs font-bold tracking-wide uppercase ${GRUPOS[g].banda} ${GRUPOS[g].texto}`}
                  >
                    {GRUPOS[g].titulo}
                  </th>
                ))}
              </tr>
              <tr className="text-xs font-semibold text-texto-suave">
                <th
                  scope="col"
                  className={`${fija1} border-b border-borde bg-superficie-2 px-3 py-2.5 text-left`}
                >
                  Partida
                </th>
                <th scope="col" className={`${fija2} border-b bg-superficie-2 px-3 py-2.5 text-left`}>
                  Descripción del equipo
                </th>
                {columnas.map((c, i) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={`max-w-32 border-b border-borde bg-superficie-2 px-3 py-2.5 align-bottom leading-tight ${c.numero ? 'text-right' : 'text-left'} ${
                      i > 0 && columnas[i - 1]?.grupo !== c.grupo ? 'border-l-2 border-l-superficie' : ''
                    }`}
                  >
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>

            {PROPUESTAS_EPOXEMEX.map((prop, pi) => {
              const calc = calculadas[pi];
              // Cada propuesta lleva una barra a la izquierda que alterna azul / violeta, del encabezado a su
              // última partida, y una línea más marcada donde empieza: se distingue sin saturar la tabla.
              const par = pi % 2 === 0;
              const barra = `before:absolute before:top-0 before:-bottom-px before:left-0 before:w-1.5 before:content-[''] ${par ? 'before:bg-acento' : 'before:bg-info'}`;
              const inicio = pi > 0 ? 'border-t-[3px] border-t-texto/25' : '';
              const fondoEncabezado = par ? 'bg-acento-suave/60' : 'bg-info-suave/60';
              return (
                <tbody key={prop.nombre}>
                  <tr>
                    <td
                      colSpan={2 + columnas.length}
                      className={`border-b border-borde p-0 ${fondoEncabezado} ${inicio}`}
                    >
                      <div
                        className={`sticky left-0 z-0 flex w-fit flex-wrap items-center gap-x-3 gap-y-1 py-2 pt-4 pr-3 pl-4 ${barra}`}
                      >
                        <span className={`text-sm font-bold ${par ? 'text-acento-texto' : 'text-info'}`}>
                          {prop.nombre}
                        </span>
                        <span className="text-[13px] text-texto-suave">
                          {prop.tipo} · {prop.modalidad}
                        </span>
                        {prop.partidas.length > 1 && (
                          <Pill tono="info" punto={false}>
                            Se presenta al cliente en 1 línea
                          </Pill>
                        )}
                        <span className="text-[13px] text-texto-suave">
                          · Total para el cliente con IVA{' '}
                          <strong className="tabular text-texto">
                            {calc ? pesos(calc.totales.total) : '—'}
                          </strong>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {prop.partidas.map((p, i) => {
                    const r = calc?.partidas[i];
                    const ref = `${pi + 1}.${i + 1}`;
                    return (
                      <tr key={p.sku} className="group">
                        <td
                          className={`${fija1} ${barra} tabular border-b border-borde bg-superficie py-3.5 pr-3 pl-4 align-top font-semibold text-texto-suave group-hover:bg-superficie-2`}
                        >
                          {ref}
                        </td>
                        <td
                          className={`${fija2} bg-superficie px-3 py-3 align-top group-hover:bg-superficie-2`}
                        >
                          <div className="leading-snug font-bold whitespace-normal">{p.descripcion}</div>
                          {p.especificaciones.length > 0 && (
                            <details className="mt-1 text-xs text-texto-suave">
                              <summary className="cursor-pointer font-semibold text-acento-texto select-none">
                                {p.especificaciones.length} especificaciones
                              </summary>
                              <ul className="mt-1.5 space-y-0.5 whitespace-normal">
                                {p.especificaciones.map((e) => (
                                  <li key={e}>• {e}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        {columnas.map((c, ci) => (
                          <td
                            key={c.id}
                            className={`border-b border-borde px-3 py-3 align-top whitespace-nowrap group-hover:bg-superficie-2 ${
                              c.numero ? 'tabular text-right' : ''
                            } ${c.grupo === 'venta' ? 'bg-acento-suave/35' : ''} ${
                              ci > 0 && columnas[ci - 1]?.grupo !== c.grupo
                                ? 'border-l-2 border-l-superficie'
                                : ''
                            }`}
                          >
                            {celda(c, p, r, ref)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}

            <tfoot className="sticky bottom-0 z-20">
              <tr className="font-bold">
                <td
                  colSpan={2}
                  className="sticky left-0 z-10 border-t-2 border-r border-t-texto/20 border-r-borde bg-superficie-2 px-3 py-3.5 text-sm"
                >
                  Totales de la corrida
                </td>
                {columnas.map((c, ci) => {
                  const t = totalPie[c.id];
                  return (
                    <td
                      key={c.id}
                      className={`tabular border-t-2 border-t-texto/20 bg-superficie-2 px-3 py-3.5 text-right whitespace-nowrap ${
                        c.grupo === 'utilidad' ? 'text-exito' : c.grupo === 'venta' ? 'text-acento-texto' : ''
                      } ${ci > 0 && columnas[ci - 1]?.grupo !== c.grupo ? 'border-l-2 border-l-superficie' : ''}`}
                    >
                      {t !== undefined ? pesos(t) : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </Tarjeta>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Resumen para el cliente" className="min-w-0 flex-[999_1_640px]">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <Titulo2>Resumen para el cliente</Titulo2>
            <span className="text-[13px] text-texto-suave">IVA 16 % sobre el subtotal de cada propuesta</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {calculadas.map((c, i) => {
              const prop = PROPUESTAS_EPOXEMEX[i]!;
              return (
                <Tarjeta key={prop.nombre} className="p-4">
                  <div className="text-xs font-bold tracking-wide text-acento-texto uppercase">
                    {prop.nombre}
                  </div>
                  <div
                    className="mt-0.5 truncate text-[13px] text-texto-suave"
                    title={prop.partidas[0]?.descripcion}
                  >
                    {prop.partidas.map((x) => x.sku).join(' + ')} · {prop.partidas[0]?.cantidad}{' '}
                    {prop.partidas[0]?.unidad === 'PIEZA' ? 'pzas' : 'u.'}
                  </div>
                  {c ? (
                    <>
                      <dl className="tabular mt-3 space-y-1 text-[13px]">
                        <div className="flex justify-between">
                          <dt className="text-texto-suave">Subtotal</dt>
                          <dd>{pesos(c.totales.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-texto-suave">IVA</dt>
                          <dd>{pesos(c.totales.iva)}</dd>
                        </div>
                        <div className="flex justify-between border-t border-borde pt-1.5 text-[15px] font-bold">
                          <dt>Total</dt>
                          <dd>{pesos(c.totales.total)}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-[11px] leading-snug text-texto-suave">
                        {importeConLetra(c.totales.total)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-[13px] font-semibold text-peligro">Revisa la utilidad</p>
                  )}
                </Tarjeta>
              );
            })}
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:sticky lg:top-6">
          <Tarjeta className="p-5">
            <Titulo2>Decisión</Titulo2>
            <div className="mt-4 flex flex-col gap-2.5">
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
            <div className="mb-2 flex items-center gap-2.5">
              <Avatar iniciales="RR" color="#1D5BD8" tamano={28} />
              <div className="text-sm font-semibold">Nota del ejecutivo</div>
            </div>
            <p className="text-[13px] leading-relaxed text-texto-suave">
              El cliente necesita 2 equipos. Van 6 alternativas Dell más el SSD de 1 TB instalado como
              adicional. Vigencia corta: 30 sep, 12:30 h.
            </p>
          </Tarjeta>
        </aside>
      </div>
    </div>
  );
}
