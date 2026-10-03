import { formatearMXN } from '@celmi/core';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Avatar, Boton, Pill, Tarjeta, Tecla, Titulo2, type Tono } from '@/components/ui';
import { FOLIO_EPOXEMEX, montoReferencia, UTILIDAD_EPOXEMEX } from '@/lib/epoxemex';
import { obtenerSesion } from '@/lib/sesion';

const KPIS: { etiqueta: string; valor: string; detalle: string; tono?: Tono; marca?: string }[] = [
  { etiqueta: 'Monto cotizado · septiembre', valor: '$1,284,600', detalle: 'MXN · 14 cotizaciones emitidas' },
  { etiqueta: 'En negociación', valor: '$486,300', detalle: '4 oportunidades abiertas' },
  {
    etiqueta: 'Pendientes de autorización',
    valor: '2',
    detalle: 'La más antigua: hace 3 h',
    tono: 'aviso',
    marca: 'Revisar',
  },
  {
    etiqueta: 'Por vencer · 7 días',
    valor: '3',
    detalle: '$214,900 en juego',
    tono: 'peligro',
    marca: 'Urgente',
  },
];

const ETAPAS = [
  { nombre: 'Nueva', n: 4, color: '#CFE0FC' },
  { nombre: 'En preparación', n: 7, color: '#9CC0F8' },
  { nombre: 'Pend. autorización', n: 3, color: '#5A97F2' },
  { nombre: 'Autorizada', n: 5, color: '#0064EC' },
  { nombre: 'Enviada', n: 9, color: '#3B3580' },
  { nombre: 'En negociación', n: 6, color: '#29235C' },
];

const POR_VENCER: { folio: string; cliente: string; monto: string; cuando: string; tono: Tono }[] = [
  {
    folio: 'CELMISOLUTIONS-2026001248',
    cliente: 'Universidad Valle Norte',
    monto: '$145,000',
    cuando: 'Mañana',
    tono: 'peligro',
  },
  {
    folio: 'CELMISOLUTIONS-2026001252 Rev A',
    cliente: 'Grupo Industrial del Bajío',
    monto: '$218,400',
    cuando: '5 días',
    tono: 'aviso',
  },
  {
    folio: 'CELMISOLUTIONS-2026001249',
    cliente: 'Farmacéutica Monterrey',
    monto: '$31,248',
    cuando: '6 días',
    tono: 'aviso',
  },
];

const ACTIVIDAD = [
  {
    ini: 'AB',
    color: '#7C3AED',
    quien: 'Alejandro Bonilla',
    que: 'autorizó CELMISOLUTIONS-2026001250',
    cuando: 'hace 25 min',
  },
  {
    ini: 'JS',
    color: '#0E7490',
    quien: 'Jhovanny Sánchez',
    que: 'importó 32 partidas desde Excel',
    cuando: 'hace 1 h',
  },
  {
    ini: 'FR',
    color: '#BE185D',
    quien: 'Fabiola Reyes',
    que: 'creó la oportunidad Constructora Pacífico — Fase 2',
    cuando: 'hace 3 h',
  },
  {
    ini: 'JL',
    color: '#B45309',
    quien: 'Jorge Salguero',
    que: 'solicitó modificación en CELMISOLUTIONS-2026001246',
    cuando: 'ayer',
  },
];

// El saludo muestra la fecha del día: se genera en cada visita.

function fechaHoy() {
  const s = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mexico_City',
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function saludo() {
  const hora = Number(
    new Intl.DateTimeFormat('es-MX', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Mexico_City',
    }).format(new Date()),
  );
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export async function DashboardMuestra() {
  const sesion = await obtenerSesion();
  const nombre = sesion.nombre.split(/\s+/)[0] ?? '';
  const totalEpoxemex = montoReferencia(UTILIDAD_EPOXEMEX);
  const recientes: {
    folio: string;
    rev?: string;
    cliente: string;
    proyecto: string;
    esquema: string;
    monto: string;
    estado: [Tono, string];
    vence: string;
    href?: string;
  }[] = [
    {
      folio: FOLIO_EPOXEMEX,
      cliente: 'EPOXEMEX',
      proyecto: 'Laptops Dell · 6 propuestas + 1 adicional',
      esquema: 'Adquisición',
      monto: `desde ${formatearMXN(totalEpoxemex)}`,
      estado: ['peligro', 'Vencida'],
      vence: '30 sep',
      href: '/autorizaciones/epoxemex',
    },
    {
      folio: 'CELMISOLUTIONS-2026001252',
      rev: 'Rev A',
      cliente: 'Grupo Industrial del Bajío',
      proyecto: 'Renovación de equipos de cómputo',
      esquema: 'Arrendamiento VJM 36 m',
      monto: '$218,400.00',
      estado: ['info', 'En negociación'],
      vence: '07 oct',
    },
    {
      folio: 'CELMISOLUTIONS-2026001250',
      cliente: 'Hospital San Ángel',
      proyecto: 'Infraestructura de red',
      esquema: 'Adquisición',
      monto: '$84,950.00',
      estado: ['exito', 'Autorizada'],
      vence: '—',
    },
    {
      folio: 'CELMISOLUTIONS-2026001248',
      cliente: 'Universidad Valle Norte',
      proyecto: 'Laboratorio de cómputo',
      esquema: 'Full Payout 48 m',
      monto: '$145,000.00',
      estado: ['neutro', 'Enviada'],
      vence: '03 oct',
    },
  ];
  const totalEtapas = ETAPAS.reduce((s, e) => s + e.n, 0);

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-72 flex-1">
          <div className="flex flex-wrap items-center gap-2.5 text-sm font-medium text-texto-suave">
            {fechaHoy()}{' '}
            <Pill tono="neutro" punto={false}>
              Datos de muestra
            </Pill>
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
            {saludo()}, {nombre}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex min-h-11 w-75 max-w-full items-center gap-2.5 rounded-md border border-borde bg-superficie px-3 text-texto-suave">
            <Icon name="buscar" />
            <span className="sr-only">Buscar</span>
            <input
              type="search"
              placeholder="Buscar cliente, folio, SKU…"
              className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-suave"
            />
            <Tecla>Ctrl K</Tecla>
          </label>
          <Boton variante="primario" icono="mas">
            Nueva oportunidad
          </Boton>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-4">
        {KPIS.map((k) => (
          <Tarjeta key={k.etiqueta} className="relative min-w-55 flex-1 p-5">
            {k.tono && (
              <span
                aria-hidden="true"
                className={`absolute top-5 bottom-5 left-0 w-[3px] rounded-r ${k.tono === 'aviso' ? 'bg-aviso' : 'bg-peligro'}`}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-texto-suave">{k.etiqueta}</span>
              {k.tono && k.marca && (
                <Pill tono={k.tono} punto={false}>
                  {k.marca}
                </Pill>
              )}
            </div>
            <div
              className={`tabular mt-2.5 text-3xl font-bold tracking-tight ${k.tono === 'aviso' ? 'text-aviso' : k.tono === 'peligro' ? 'text-peligro' : ''}`}
            >
              {k.valor}
            </div>
            <div className="mt-1.5 text-[13px] text-texto-suave">{k.detalle}</div>
          </Tarjeta>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <Tarjeta className="p-5.5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <Titulo2>Embudo de oportunidades</Titulo2>
              <span className="text-[13px] text-texto-suave">{totalEtapas} activas</span>
            </div>
            <div
              role="img"
              aria-label="Distribución de oportunidades por estado"
              className="flex h-3.5 gap-[3px]"
            >
              {ETAPAS.map((e, i) => (
                <span
                  key={e.nombre}
                  className={`${i === 0 ? 'rounded-l-pill' : ''} ${i === ETAPAS.length - 1 ? 'rounded-r-pill' : ''} rounded-[3px]`}
                  style={{ flex: `${e.n} 1 0`, background: e.color }}
                />
              ))}
            </div>
            <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
              {ETAPAS.map((e) => (
                <span key={e.nombre} className="inline-flex items-center gap-2 text-[13px] text-texto-suave">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-[3px]"
                    style={{ background: e.color }}
                  />
                  {e.nombre} <strong className="tabular text-texto">{e.n}</strong>
                </span>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4.5 pb-3">
              <Titulo2>Cotizaciones recientes</Titulo2>
              <Link href="/cotizaciones" className="text-sm font-semibold text-acento-texto hover:underline">
                Ver todas
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-borde text-left text-xs font-semibold text-texto-suave">
                    {['Folio', 'Cliente / proyecto', 'Esquema', 'Monto con IVA', 'Estado', 'Vence'].map(
                      (h) => (
                        <th
                          key={h}
                          scope="col"
                          className={`px-4 py-2.5 whitespace-nowrap ${h.startsWith('Monto') ? 'text-right' : ''}`}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((r) => (
                    <tr
                      key={r.folio}
                      className="border-b border-borde transition-[background-color] last:border-0 hover:bg-superficie-2"
                    >
                      <td className="px-4 py-3.5 font-semibold whitespace-nowrap">
                        {r.href ? (
                          <Link href={r.href} className="hover:text-acento-texto hover:underline">
                            {r.folio}
                          </Link>
                        ) : (
                          r.folio
                        )}
                        {r.rev && (
                          <span className="ml-1.5 text-xs font-semibold text-acento-texto">{r.rev}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold">{r.cliente}</div>
                        <div className="text-[13px] text-texto-suave">{r.proyecto}</div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-texto-suave">{r.esquema}</td>
                      <td className="tabular px-4 py-3.5 text-right font-semibold whitespace-nowrap">
                        {r.monto}
                      </td>
                      <td className="px-4 py-3.5">
                        <Pill tono={r.estado[0]}>{r.estado[1]}</Pill>
                      </td>
                      <td
                        className={`px-4 py-3.5 whitespace-nowrap ${r.estado[0] === 'peligro' ? 'font-semibold text-peligro' : 'text-texto-suave'}`}
                      >
                        {r.vence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-borde px-5 py-3 text-xs text-texto-suave">
              Con varias propuestas se muestra la de menor monto. EPOXEMEX se calcula en vivo con el motor de
              precios; el adicional (SSD) aún no cuenta mientras se confirma la regla.
            </p>
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Tarjeta className="p-5">
            <div className="mb-1.5 flex items-center gap-2.5">
              <span className="text-peligro">
                <Icon name="reloj" />
              </span>
              <Titulo2>Por vencer</Titulo2>
            </div>
            {POR_VENCER.map((d, i) => (
              <div
                key={d.folio}
                className={`flex items-center gap-3 py-3 ${i ? 'border-t border-borde' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{d.cliente}</div>
                  <div className="truncate text-xs text-texto-suave">
                    {d.folio} · {d.monto}
                  </div>
                </div>
                <Pill tono={d.tono} punto={false}>
                  {d.cuando}
                </Pill>
              </div>
            ))}
          </Tarjeta>
          <Tarjeta className="p-5">
            <div className="mb-2">
              <Titulo2>Actividad del equipo</Titulo2>
            </div>
            {ACTIVIDAD.map((a) => (
              <div key={a.que} className="flex gap-3 py-2.5">
                <Avatar iniciales={a.ini} color={a.color} tamano={30} />
                <div className="min-w-0 text-[13px] leading-snug">
                  <strong>{a.quien}</strong> {a.que}
                  <div className="text-xs text-texto-suave">{a.cuando}</div>
                </div>
              </div>
            ))}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
