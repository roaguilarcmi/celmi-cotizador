import { notFound } from 'next/navigation';
import {
  listarEsquemas,
  listarEstados,
  listarSeguimiento,
  obtenerCliente,
  obtenerOportunidad,
} from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';
import { FichaOportunidad } from './FichaOportunidad';

const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export default async function PaginaOportunidad({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerSesion();
  const { id } = await params;
  if (sesion.demo || !esUuid(id)) notFound();
  // RLS: si la oportunidad no es suya (ni colabora, ni es admin), la base no la devuelve.
  const o = await obtenerOportunidad(id);
  if (!o) notFound();
  const [estados, esquemas, seguimiento, cliente] = await Promise.all([
    listarEstados(false),
    listarEsquemas(false),
    listarSeguimiento(id),
    o.cliente ? obtenerCliente(o.cliente.id) : Promise.resolve(null),
  ]);
  const editarTodas = sesion.permisos.has('oportunidades.editar_todas');
  return (
    <FichaOportunidad
      o={o}
      estados={estados.filter((e) => e.activo || e.id === o.estado_id)}
      esquemas={esquemas}
      contactos={cliente?.contactos ?? []}
      seguimiento={seguimiento}
      puedeCambiarEstado={editarTodas || o.ejecutivo_id === sesion.usuarioId}
      // Colaboradores también editan datos y registran seguimiento (la base lo permite a participantes).
      puedeEditar
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = esUuid(id) ? await obtenerOportunidad(id).catch(() => null) : null;
  return { title: o?.nombre ?? 'Oportunidad' };
}
