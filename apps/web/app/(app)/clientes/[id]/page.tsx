import { notFound } from 'next/navigation';
import { listarEstados, listarOportunidades, obtenerCliente } from '@/lib/datos';
import { exigirPermiso } from '@/lib/sesion';
import { FichaCliente } from './FichaCliente';

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso('clientes.ver');
  const { id } = await params;
  if (sesion.demo || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [cliente, oportunidades, estados] = await Promise.all([
    obtenerCliente(id),
    listarOportunidades({ clienteId: id }),
    listarEstados(false),
  ]);
  if (!cliente) notFound();
  return (
    <FichaCliente
      cliente={cliente}
      oportunidades={oportunidades}
      estados={estados}
      puedeEditar={sesion.permisos.has('clientes.editar')}
      puedeCrearOportunidad={sesion.permisos.has('oportunidades.crear')}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = /^[0-9a-f-]{36}$/i.test(id) ? await obtenerCliente(id).catch(() => null) : null;
  return { title: cliente?.razon_social ?? 'Cliente' };
}
