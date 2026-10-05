import { notFound } from 'next/navigation';
import { EnConstruccion } from '@/components/EnConstruccion';
import { listarCatalogosCotizacion, obtenerCotizacion } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { EditorCotizacion, type Paso } from './EditorCotizacion';

export const dynamic = 'force-dynamic';

const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const PASOS: Record<string, Paso> = { partidas: 2, costos: 3, condiciones: 4, autorizacion: 5 };

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
      pasoInicial={PASOS[paso ?? ''] ?? (revision.estado === 'borrador' ? 2 : 5)}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = esUuid(id) ? await obtenerCotizacion(id).catch(() => null) : null;
  return { title: datos?.cotizacion.oportunidad?.nombre ?? 'Cotización' };
}
