import { notFound } from 'next/navigation';
import { EnConstruccion } from '@/components/EnConstruccion';
import {
  listarCatalogosCotizacion,
  listarCondicionesCatalogo,
  listarCondicionesDeRevision,
  listarEsquemas,
  listarFinanciamiento,
  listarTiposCambio,
  listarUtilidades,
  obtenerCotizacion,
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
  const [catalogoCondiciones, condiciones, esquemas, financiamiento, utilidades, tiposCambio] =
    await Promise.all([
      listarCondicionesCatalogo(),
      listarCondicionesDeRevision(revision.id),
      listarEsquemas(),
      listarFinanciamiento(revision.propuestas.filter((p) => !p.es_adicional).map((p) => p.id)),
      veUtilidad ? listarUtilidades(revision.propuestas.flatMap((p) => p.partidas.map((pa) => pa.id))) : null,
      veUtilidad ? listarTiposCambio(revision.id) : null,
    ]);

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
      puedeEditar={puedeEditar && sesion.permisos.has('costos.ver')}
      puedeEliminar={
        puedeEditar &&
        !cotizacion.folio &&
        !cotizacion.revisiones.some(
          (r) => r.autorizada_en || r.estado === 'autorizada' || r.estado === 'emitida',
        )
      }
      catalogoCondiciones={catalogoCondiciones}
      condiciones={condiciones}
      esquemasFinanciamiento={esquemas.filter((e) => e.id !== 'adquisicion')}
      financiamiento={financiamiento}
      autorizacion={
        utilidades
          ? {
              utilidades,
              tiposCambio: tiposCambio ?? {},
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
