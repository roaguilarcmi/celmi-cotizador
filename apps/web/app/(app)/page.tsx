import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Avatar, Pill, Tarjeta, Titulo2, type Tono } from '@/components/ui';
import { ListaTareas } from '@/components/tareas/ListaTareas';
import { listarEstados, listarMisTareas, listarOportunidades, listarSeguimiento } from '@/lib/datos';
import { colorAvatar, haceCuanto, iniciales, tonoEstado } from '@/lib/presentacion';
import { obtenerSesion } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { DashboardMuestra } from './DashboardMuestra';

// El saludo y los conteos se generan en cada visita.
export const dynamic = 'force-dynamic';

const zona = 'America/Mexico_City';

function saludo() {
  const hora = Number(
    new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hourCycle: 'h23', timeZone: zona }).format(
      new Date(),
    ),
  );
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function fechaHoy() {
  const s = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zona,
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Rampa índigo-azul del sistema de diseño para el embudo (una por estado abierto, en orden). */
const RAMPA = ['#CFE0FC', '#9CC0F8', '#5A97F2', '#0064EC', '#3B3580', '#29235C', '#1E1A47'];

export default async function Inicio() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <DashboardMuestra />;

  const supabase = await clienteServidor();
  const [oportunidades, estados, actividad, clientes, misTareas] = await Promise.all([
    listarOportunidades(),
    listarEstados(false),
    listarSeguimiento(undefined, 8),
    supabase.from('clientes').select('id', { count: 'exact', head: true }),
    listarMisTareas({ soloPendientes: true }),
  ]);

  const nombre = sesion.nombre.split(/\s+/)[0] ?? '';
  const verTodas = sesion.permisos.has('oportunidades.ver_todas');
  const nombreEstado = new Map(estados.map((e) => [e.id, e.nombre]));
  const finales = new Set(estados.filter((e) => e.final).map((e) => e.id));
  const abiertas = oportunidades.filter((o) => !finales.has(o.estado_id));
  const contar = (id: string) => oportunidades.filter((o) => o.estado_id === id).length;
  const ganadas = contar('ganada');
  const perdidas = contar('perdida');
  const tasa = ganadas + perdidas ? Math.round((ganadas / (ganadas + perdidas)) * 100) : null;
  const etapas = estados.filter((e) => !e.final && e.activo);
  const nombreOportunidad = new Map(oportunidades.map((o) => [o.id, o.nombre]));

  const kpis: { etiqueta: string; valor: number; detalle: string; tono?: Tono; href: string }[] = [
    {
      etiqueta: 'Oportunidades abiertas',
      valor: abiertas.length,
      detalle: verTodas ? 'De todo el equipo' : 'Tuyas y donde colaboras',
      href: '/oportunidades',
    },
    {
      etiqueta: 'En negociación',
      valor: contar('en_negociacion'),
      detalle: 'Esperando decisión del cliente',
      href: '/oportunidades',
    },
    {
      etiqueta: 'Pendientes de autorización',
      valor: contar('pendiente_autorizacion'),
      detalle: 'Requieren revisión de precios',
      tono: contar('pendiente_autorizacion') ? 'aviso' : undefined,
      href: '/oportunidades',
    },
    {
      etiqueta: 'Ganadas',
      valor: ganadas,
      detalle: tasa === null ? 'Sin cierres todavía' : `Tasa de cierre ${tasa} %`,
      tono: ganadas ? 'exito' : undefined,
      href: '/oportunidades',
    },
  ];

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-72 flex-1">
          <div className="text-sm font-medium text-texto-suave">{fechaHoy()}</div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
            {saludo()}, {nombre}
          </h1>
        </div>
        {sesion.permisos.has('oportunidades.crear') && (
          <Link
            href="/oportunidades/nueva"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110"
          >
            <Icon name="mas" strokeWidth={2.2} /> Nueva oportunidad
          </Link>
        )}
      </header>

      <div className="mb-4 flex flex-wrap gap-4">
        {kpis.map((k) => (
          <Link
            key={k.etiqueta}
            href={k.href}
            className="relative min-w-55 flex-1 rounded-lg border border-borde bg-superficie p-5 sombra transition-[border-color] hover:border-acento/50"
          >
            {k.tono && (
              <span
                aria-hidden="true"
                className={`absolute top-5 bottom-5 left-0 w-[3px] rounded-r ${k.tono === 'aviso' ? 'bg-aviso' : 'bg-exito'}`}
              />
            )}
            <span className="text-[13px] font-semibold text-texto-suave">{k.etiqueta}</span>
            <div
              className={`tabular mt-2.5 text-3xl font-bold tracking-tight ${k.tono === 'aviso' ? 'text-aviso' : k.tono === 'exito' ? 'text-exito' : ''}`}
            >
              {k.valor}
            </div>
            <div className="mt-1.5 text-[13px] text-texto-suave">{k.detalle}</div>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <Tarjeta className="p-5.5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <Titulo2>Embudo de oportunidades</Titulo2>
              <span className="text-[13px] text-texto-suave">
                {abiertas.length} abiertas · {clientes.count ?? 0} clientes
              </span>
            </div>
            {abiertas.length === 0 ? (
              <p className="text-[13px] text-texto-suave">Sin oportunidades abiertas.</p>
            ) : (
              <div
                role="img"
                aria-label="Distribución de oportunidades abiertas por estado"
                className="flex h-3.5 gap-[3px]"
              >
                {etapas.map((e, i) => {
                  const n = contar(e.id);
                  return n ? (
                    <span
                      key={e.id}
                      className="rounded-[3px] first:rounded-l-pill last:rounded-r-pill"
                      style={{ flex: `${n} 1 0`, background: RAMPA[i % RAMPA.length] }}
                    />
                  ) : null;
                })}
              </div>
            )}
            <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
              {etapas.map((e, i) => (
                <span key={e.id} className="inline-flex items-center gap-2 text-[13px] text-texto-suave">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-[3px]"
                    style={{ background: RAMPA[i % RAMPA.length] }}
                  />
                  {e.nombre} <strong className="tabular text-texto">{contar(e.id)}</strong>
                </span>
              ))}
            </div>
            <p className="mt-4 border-t border-borde pt-3 text-xs text-texto-suave">
              Los montos cotizados se sumarán aquí cuando existan cotizaciones (Fase 3).
            </p>
          </Tarjeta>

          <Tarjeta className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4.5 pb-3">
              <Titulo2>Movidas recientemente</Titulo2>
              <Link href="/oportunidades" className="text-sm font-semibold text-acento-texto hover:underline">
                Ver todas
              </Link>
            </div>
            {oportunidades.length === 0 ? (
              <p className="px-5 pb-6 text-[13px] text-texto-suave">
                Aún no hay oportunidades.{' '}
                <Link href="/oportunidades/nueva" className="font-semibold text-acento-texto hover:underline">
                  Crea la primera
                </Link>
                .
              </p>
            ) : (
              <ul>
                {oportunidades.slice(0, 6).map((o) => (
                  <li key={o.id} className="border-t border-borde">
                    <Link
                      href={`/oportunidades/${o.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-superficie-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{o.nombre}</div>
                        <div className="truncate text-[13px] text-texto-suave">
                          {o.cliente?.razon_social}
                          {verTodas && o.ejecutivo && ` · ${o.ejecutivo.nombre}`}
                        </div>
                      </div>
                      <Pill tono={tonoEstado(o.estado_id)}>
                        {nombreEstado.get(o.estado_id) ?? o.estado_id}
                      </Pill>
                      <span className="w-24 text-right text-xs text-texto-suave">
                        {haceCuanto(o.actualizado_en)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Tarjeta className="px-5 pt-5 pb-2">
            <div className="flex items-baseline justify-between">
              <Titulo2>Mis tareas</Titulo2>
              <Link href="/tareas" className="text-sm font-semibold text-acento-texto hover:underline">
                Ver todas
              </Link>
            </div>
            <ListaTareas
              tareas={misTareas.slice(0, 5)}
              mostrarOportunidad
              vacio="Sin tareas pendientes. Prográmalas desde cada oportunidad."
            />
          </Tarjeta>
          <Tarjeta className="p-5">
            <div className="mb-2">
              <Titulo2>Actividad</Titulo2>
            </div>
            {actividad.length === 0 ? (
              <p className="py-4 text-[13px] text-texto-suave">
                Las notas, llamadas, visitas y cambios de estado aparecerán aquí.
              </p>
            ) : (
              actividad.map((a) => (
                <Link
                  key={a.id}
                  href={`/oportunidades/${a.oportunidad_id}`}
                  className="-mx-2 flex gap-3 rounded-md px-2 py-2.5 hover:bg-superficie-2"
                >
                  <Avatar
                    iniciales={iniciales(a.autor?.nombre ?? '?')}
                    color={colorAvatar(a.autor?.nombre ?? '?')}
                    tamano={30}
                  />
                  <div className="min-w-0 text-[13px] leading-snug">
                    <strong>{a.autor?.nombre.split(' ')[0] ?? 'Sistema'}</strong>{' '}
                    {a.tipo === 'cambio_estado'
                      ? `movió a «${nombreEstado.get(a.estado_nuevo ?? '') ?? a.estado_nuevo}»`
                      : `registró ${a.tipo === 'nota' ? 'una nota' : a.tipo === 'llamada' ? 'una llamada' : a.tipo === 'visita' ? 'una visita' : 'un correo'}`}{' '}
                    en{' '}
                    <span className="font-semibold">
                      {nombreOportunidad.get(a.oportunidad_id) ?? 'una oportunidad'}
                    </span>
                    <div className="text-xs text-texto-suave">{haceCuanto(a.en)}</div>
                  </div>
                </Link>
              ))
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
