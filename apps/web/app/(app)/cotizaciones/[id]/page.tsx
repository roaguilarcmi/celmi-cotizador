import { etiquetaRevision } from '@celmi/core';
import { notFound } from 'next/navigation';
import { EnConstruccion } from '@/components/EnConstruccion';
import { decimal } from '@/lib/corrida';
import {
  listarCatalogosCotizacion,
  listarCondicionesCatalogo,
  listarCondicionesDeRevision,
  listarPaquetesCondiciones,
  listarFinancieras,
  listarFinanciamiento,
  listarTiposCambio,
  listarUtilidades,
  obtenerCotizacion,
  obtenerRevision,
} from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { EditorCotizacion, type Paso } from './EditorCotizacion';

export const dynamic = 'force-dynamic';

const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const PASOS: Record<string, Paso> = {
  partidas: 1,
  costos: 1,
  condiciones: 2,
  autorizacion: 3,
  financiamiento: 4,
};
/** Paso inicial según el estado: capturando, esperando autorización o ya autorizada (financiamiento). */
const PASO_POR_ESTADO: Record<string, Paso> = {
  borrador: 1,
  rechazada: 1,
  pendiente_autorizacion: 3,
  autorizada: 4,
  emitida: 4,
};

export default async function PaginaCotizacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="cotizaciones" />;
  const { id } = await params;
  const { paso, rev } = await searchParams;
  if (!esUuid(id)) notFound();

  // RLS: si no puede ver la oportunidad, la base no devuelve la cotización.
  const [datos, catalogos] = await Promise.all([
    obtenerCotizacion(id, rev !== undefined && /^\d+$/.test(rev) ? Number(rev) : undefined),
    listarCatalogosCotizacion(),
  ]);
  if (!datos) notFound();
  const { cotizacion, revision } = datos;
  // La utilidad sólo la ve quien autoriza (RLS también lo exige).
  const veUtilidad = sesion.permisos.has('utilidad.ver') || sesion.permisos.has('utilidad.autorizar');
  const [catalogoCondiciones, condiciones, paquetes, financieras, financiamiento, utilidades, tiposCambio] =
    await Promise.all([
      listarCondicionesCatalogo(),
      listarCondicionesDeRevision(revision.id),
      listarPaquetesCondiciones(),
      listarFinancieras(),
      listarFinanciamiento(revision.propuestas.filter((p) => !p.es_adicional).map((p) => p.id)),
      veUtilidad ? listarUtilidades(revision.propuestas.flatMap((p) => p.partidas.map((pa) => pa.id))) : null,
      veUtilidad ? listarTiposCambio(revision.id) : null,
    ]);

  // Rev anterior (sólo para quien ve la utilidad): su utilidad y su T.C. se precargan como punto de partida, y su
  // utilidad y precio se muestran como referencia en la corrida (decisión 2026-10-06; se vuelve a autorizar).
  const anterior =
    veUtilidad && revision.revision_anterior_id ? await obtenerRevision(revision.revision_anterior_id) : null;
  const [utilidadesAnteriores, tiposCambioAnteriores] = anterior
    ? await Promise.all([
        listarUtilidades(anterior.propuestas.flatMap((p) => p.partidas.map((pa) => pa.id))),
        listarTiposCambio(anterior.id),
      ])
    : [{}, {}];
  const preciosAnteriores = new Map<string, string | undefined>(
    anterior?.propuestas.flatMap((p) =>
      p.partidas.map((pa) => [pa.id, pa.precio ? decimal(pa.precio.precio_unitario, 2) : undefined] as const),
    ) ?? [],
  );
  const referencia = anterior
    ? {
        etiqueta: etiquetaRevision(anterior.numero),
        porPartida: Object.fromEntries(
          revision.propuestas.flatMap((p) =>
            p.partidas.flatMap((pa) =>
              pa.partida_origen_id && preciosAnteriores.has(pa.partida_origen_id)
                ? [
                    [
                      pa.id,
                      {
                        utilidad: utilidadesAnteriores[pa.partida_origen_id],
                        precio: preciosAnteriores.get(pa.partida_origen_id),
                      },
                    ] as const,
                  ]
                : [],
            ),
          ),
        ),
      }
    : null;
  const precargadas: Record<string, string> = {};
  for (const [id, r] of Object.entries(referencia?.porPartida ?? {}))
    if (r.utilidad) precargadas[id] = r.utilidad;

  const esVigente = revision.numero === cotizacion.revisiones[0]?.numero;
  // Edita quien participa en la oportunidad (ejecutivo o colaborador) o quien puede editar todas; la base lo
  // vuelve a exigir al guardar.
  let puedeEditar = sesion.permisos.has('oportunidades.editar_todas');
  if (!puedeEditar && cotizacion.oportunidad) {
    puedeEditar = cotizacion.oportunidad.ejecutivo_id === sesion.usuarioId;
    if (!puedeEditar) {
      const supabase = await clienteServidor();
      const { data } = await supabase
        .from('oportunidad_colaboradores')
        .select('perfil_id')
        .eq('oportunidad_id', cotizacion.oportunidad.id)
        .eq('perfil_id', sesion.usuarioId);
      puedeEditar = Boolean(data?.length);
    }
  }

  return (
    <EditorCotizacion
      cotizacion={cotizacion}
      revision={revision}
      catalogos={catalogos}
      // Una Rev anterior a la vigente es sólo de consulta.
      puedeEditar={puedeEditar && esVigente && sesion.permisos.has('costos.ver')}
      puedeEliminar={
        puedeEditar &&
        !cotizacion.folio &&
        !cotizacion.revisiones.some(
          (r) => r.autorizada_en || r.estado === 'autorizada' || r.estado === 'emitida',
        )
      }
      catalogoCondiciones={catalogoCondiciones}
      condiciones={condiciones}
      paquetes={{
        lista: paquetes,
        usuarioId: sesion.usuarioId,
        esAdmin: sesion.permisos.has('catalogos.administrar'),
      }}
      financieras={financieras}
      financiamiento={financiamiento}
      autorizacion={
        utilidades
          ? {
              utilidades: { ...precargadas, ...utilidades },
              tiposCambio: { ...tiposCambioAnteriores, ...(tiposCambio ?? {}) },
              referencia,
              puedeAutorizar: sesion.permisos.has('utilidad.autorizar'),
            }
          : null
      }
      tipoOportunidad={cotizacion.oportunidad?.tipo ?? 'arrendamiento'}
      pasoInicial={PASOS[paso ?? ''] ?? PASO_POR_ESTADO[revision.estado] ?? 1}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = esUuid(id) ? await obtenerCotizacion(id).catch(() => null) : null;
  return { title: datos?.cotizacion.oportunidad?.nombre ?? 'Cotización' };
}
