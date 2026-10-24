import {
  normalizarSku,
  type EsquemaSolicitud,
  type FormatoSolicitud,
  type PresentacionSolicitud,
} from '@celmi/core';
import { CONSULTAS } from './consultas';
import { listarTiposCambio, type RevisionDetalle } from './datos';
import { clienteServidor } from './supabase/servidor';

/** Una solicitud de corrida ya generada (0036). */
export interface SolicitudCorrida {
  id: string;
  propuesta_id: string;
  formato: FormatoSolicitud;
  plazos: number[];
  esquemas: EsquemaSolicitud[];
  presentacion: PresentacionSolicitud;
  generada_en: string;
  autor: { nombre: string } | null;
}

export interface DatosPasoSolicitud {
  tiposCambio: Record<string, string>;
  categorias: Record<string, string>;
  solicitudes: SolicitudCorrida[];
  empresa: string;
  ejecutivo: { nombre: string; puesto: string; correo: string; telefono: string };
}

/** Lo que necesita el paso «Solicitud de corrida» (2026-10-23). */
export async function datosPasoSolicitud(
  cotizacionId: string,
  revision: RevisionDetalle,
): Promise<DatosPasoSolicitud> {
  const supabase = await clienteServidor();
  const skus = [
    ...new Set(
      revision.propuestas.flatMap((p) => p.partidas.map((pa) => normalizarSku(pa.sku))).filter(Boolean),
    ),
  ];
  const [tiposCambio, categorias, solicitudes, cot] = await Promise.all([
    listarTiposCambio(revision.id),
    skus.length
      ? supabase.from('categorias_producto').select(CONSULTAS.categorias).in('sku', skus)
      : { data: [] },
    supabase
      .from('solicitudes_corrida')
      .select(CONSULTAS.solicitudesCorrida)
      .eq('revision_id', revision.id)
      .order('generada_en', { ascending: false })
      .limit(20),
    supabase.from('cotizaciones').select(CONSULTAS.cotizacionSolicitud).eq('id', cotizacionId).maybeSingle(),
  ]);
  const op = (
    cot.data as unknown as {
      oportunidad: {
        cliente: { razon_social: string } | null;
        ejecutivo: { nombre: string; puesto: string; correo: string; telefono: string } | null;
      } | null;
    } | null
  )?.oportunidad;
  return {
    tiposCambio,
    categorias: Object.fromEntries(
      ((categorias.data ?? []) as { sku: string; categoria: string }[]).map((c) => [c.sku, c.categoria]),
    ),
    solicitudes: (solicitudes.data ?? []) as unknown as SolicitudCorrida[],
    empresa: op?.cliente?.razon_social ?? 'Cliente',
    ejecutivo: {
      nombre: op?.ejecutivo?.nombre ?? '',
      puesto: op?.ejecutivo?.puesto ?? '',
      correo: op?.ejecutivo?.correo ?? '',
      telefono: op?.ejecutivo?.telefono ?? '',
    },
  };
}
