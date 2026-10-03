import { EnConstruccion } from '@/components/EnConstruccion';
import { listarClientes, listarEsquemas } from '@/lib/datos';
import { exigirPermiso } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PasoCliente } from './PasoCliente';

export const metadata = { title: 'Nueva oportunidad' };

export default async function NuevaOportunidad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await exigirPermiso('oportunidades.crear');
  if (sesion.demo) return <EnConstruccion slug="oportunidades" />;
  const { cliente } = await searchParams;
  const esAdmin = sesion.permisos.has('oportunidades.editar_todas');

  const [clientes, esquemas, ejecutivos] = await Promise.all([
    listarClientes(),
    listarEsquemas(),
    esAdmin
      ? clienteServidor().then(async (s) => {
          const { data } = await s
            .from('perfiles')
            .select('id, nombre')
            .eq('activo', true)
            .in('rol_id', ['administrador', 'ejecutivo'])
            .order('nombre');
          return (data ?? []) as { id: string; nombre: string }[];
        })
      : Promise.resolve(null),
  ]);

  return (
    <PasoCliente
      clientes={clientes}
      esquemas={esquemas}
      clienteInicial={clientes.some((c) => c.id === cliente) ? (cliente ?? null) : null}
      ejecutivos={ejecutivos}
      usuarioId={sesion.usuarioId}
      puedeCrearCliente={sesion.permisos.has('clientes.crear')}
    />
  );
}
