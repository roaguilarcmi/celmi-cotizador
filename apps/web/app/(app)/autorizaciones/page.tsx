import { costoPartida, etiquetaRevision } from '@celmi/core';
import Link from 'next/link';
import { EnConstruccion } from '@/components/EnConstruccion';
import { Icon } from '@/components/Icon';
import { clasesBoton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import { decimal } from '@/lib/corrida';
import { textoPorMoneda } from '../cotizaciones/[id]/modelo';
import { listarBandeja, listarSolicitudesCancelacion, type RevisionBandeja } from '@/lib/datos';
import { FOLIO_EPOXEMEX } from '@/lib/epoxemex';
import { haceCuanto } from '@/lib/presentacion';
import { exigirPermiso, obtenerSesion } from '@/lib/sesion';
import { ESTADOS } from '../cotizaciones/estados';
import { SolicitudesCancelacion } from './SolicitudesCancelacion';

export const metadata = { title: 'Autorizaciones' };
export const dynamic = 'force-dynamic';

/**
 * Costo total de compra de la revisión, por moneda (el T.C. de las extranjeras lo fija quien autoriza, 0027):
 * «$10,000.00 + USD 1,200.00».
 */
function costoDe(r: RevisionBandeja): string | null {
  try {
    const totales = new Map<string, bigint>();
    for (const pa of r.propuestas.flatMap((p) => p.partidas)) {
      if (!pa.costo) throw new Error('Sin costo');
      const { costoTotal } = costoPartida({
        costoUnitario: decimal(pa.costo.costo_unitario, 2),
        tipoCambio: '1',
        cantidad: pa.cantidad,
      });
      totales.set(pa.costo.moneda, (totales.get(pa.costo.moneda) ?? 0n) + costoTotal);
    }
    return textoPorMoneda(totales);
  } catch {
    return null;
  }
}

export default async function Page() {
  const sesion = await obtenerSesion();
  if (sesion.demo)
    return (
      <EnConstruccion slug="autorizaciones">
        <Link
          href="/autorizaciones/epoxemex"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110"
        >
          Ver demostración con {FOLIO_EPOXEMEX} <Icon name="derecha" strokeWidth={2.2} />
        </Link>
      </EnConstruccion>
    );
  await exigirPermiso('utilidad.autorizar');
  const [{ pendientes, recientes }, solicitudes] = await Promise.all([
    listarBandeja(),
    listarSolicitudesCancelacion(),
  ]);

  return (
    <div className="animar-entrada mx-auto max-w-[1100px]">
      <header className="mb-6">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Autorizaciones</h1>
        <p className="mt-1.5 text-sm text-texto-suave">
          Define la utilidad de cada partida y autoriza los precios. Lo más antiguo aparece primero.
        </p>
      </header>

      <SolicitudesCancelacion solicitudes={solicitudes} />

      <Tarjeta className="mb-6 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-borde px-5 py-4">
          <Titulo2>Por autorizar</Titulo2>
          <span className="tabular rounded-pill bg-aviso-suave px-2.5 py-0.5 text-xs font-bold text-aviso">
            {pendientes.length}
          </span>
        </div>
        {pendientes.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-3 inline-flex size-12 items-center justify-center rounded-pill bg-exito-suave text-exito">
              <Icon name="palomita" size={22} strokeWidth={2.4} />
            </span>
            <p className="font-bold">Todo al día</p>
            <p className="mt-1 text-[13px] text-texto-suave">
              No hay cotizaciones esperando tu autorización.
            </p>
          </div>
        ) : (
          <ul>
            {pendientes.map((r) => (
              <Fila key={r.id} r={r} pendiente />
            ))}
          </ul>
        )}
      </Tarjeta>

      {recientes.length > 0 && (
        <Tarjeta className="overflow-hidden">
          <div className="border-b border-borde px-5 py-4">
            <Titulo2>Resueltas recientemente</Titulo2>
          </div>
          <ul>
            {recientes.map((r) => (
              <Fila key={r.id} r={r} />
            ))}
          </ul>
        </Tarjeta>
      )}

      <p className="mt-6 text-center text-xs text-texto-suave">
        <Link href="/autorizaciones/epoxemex" className="hover:text-texto hover:underline">
          Ver la demostración con {FOLIO_EPOXEMEX}
        </Link>
      </p>
    </div>
  );
}

function Fila({ r, pendiente }: { r: RevisionBandeja; pendiente?: boolean }) {
  const op = r.cotizacion?.oportunidad;
  const partidas = r.propuestas.reduce((s, p) => s + p.partidas.length, 0);
  const costo = pendiente ? costoDe(r) : null;
  const estado = ESTADOS[r.estado];
  // Cargos prorrateados y adicionales: se avisan desde la bandeja para revisarlos a detalle (2026-10-06).
  const todas = r.propuestas.flatMap((p) => p.partidas);
  const cargos = todas.filter((pa) => pa.presentacion === 'prorrateada').length;
  const adicionales = todas.filter((pa) => pa.partida_padre_id).length;
  return (
    <li className="border-b border-borde last:border-0">
      <Link
        href={`/cotizaciones/${r.cotizacion?.id}?paso=autorizacion&rev=${r.numero}`}
        className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-superficie-2/70"
      >
        <span
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md ${
            pendiente ? 'bg-aviso-suave text-aviso' : 'bg-neutro-suave text-neutro'
          }`}
        >
          <Icon name={pendiente ? 'reloj' : 'autorizaciones'} size={20} />
        </span>
        <span className="min-w-0 flex-[1_1_260px]">
          <span className="block truncate text-[15px] font-bold">
            {op?.cliente?.razon_social ?? 'Cliente'} · {op?.nombre ?? 'Cotización'}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-texto-suave">
            <span className="font-semibold text-texto">{etiquetaRevision(r.numero)}</span>
            <span aria-hidden="true">·</span>
            <span>{op?.ejecutivo?.nombre ?? 'Sin ejecutivo'}</span>
            <span aria-hidden="true">·</span>
            <span>
              {partidas} {partidas === 1 ? 'partida' : 'partidas'} en {r.propuestas.length}{' '}
              {r.propuestas.length === 1 ? 'propuesta' : 'propuestas'}
            </span>
          </span>
          {(cargos > 0 || adicionales > 0) && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {cargos > 0 && (
                <Pill tono="aviso">
                  {cargos} {cargos === 1 ? 'cargo prorrateado' : 'cargos prorrateados'}
                </Pill>
              )}
              {adicionales > 0 && (
                <Pill tono="info">
                  {adicionales} {adicionales === 1 ? 'adicional' : 'adicionales'}
                </Pill>
              )}
            </span>
          )}
          {!pendiente && r.estado === 'rechazada' && r.comentario_autorizacion && (
            <span className="mt-1 block truncate text-[13px] text-peligro">
              «{r.comentario_autorizacion}»
            </span>
          )}
        </span>
        {pendiente ? (
          <span className="text-right">
            <span className="tabular block text-sm font-bold">{costo ?? '—'}</span>
            <span className="text-xs text-texto-suave">costo sin IVA</span>
          </span>
        ) : (
          <Pill tono={estado.tono}>{estado.texto}</Pill>
        )}
        <span className="w-28 text-right text-[13px] text-texto-suave">
          {pendiente
            ? r.enviada_en
              ? `Enviada ${haceCuanto(r.enviada_en)}`
              : ''
            : r.autorizada_en
              ? haceCuanto(r.autorizada_en)
              : r.enviada_en
                ? haceCuanto(r.enviada_en)
                : ''}
        </span>
        {pendiente && (
          <span className={`${clasesBoton('primario', 'chico')} group-hover:brightness-110`}>
            Revisar <Icon name="derecha" size={16} strokeWidth={2.2} />
          </span>
        )}
      </Link>
    </li>
  );
}
