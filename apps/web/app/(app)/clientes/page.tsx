import { listarClientes } from '@/lib/datos';
import { exigirPermiso } from '@/lib/sesion';
import { ClientesLista } from './ClientesLista';

export const metadata = { title: 'Clientes' };

export default async function Clientes() {
  const sesion = await exigirPermiso('clientes.ver');
  const clientes = sesion.demo ? [] : await listarClientes();
  return (
    <ClientesLista clientes={clientes} puedeCrear={sesion.permisos.has('clientes.crear') && !sesion.demo} />
  );
}
