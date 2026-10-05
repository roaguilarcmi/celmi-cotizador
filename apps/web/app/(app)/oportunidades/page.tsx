import { EnConstruccion } from '@/components/EnConstruccion';
import { listarEstados, listarOportunidades } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';
import { Tablero } from './Tablero';

export const metadata = { title: 'Oportunidades' };

export default async function Oportunidades() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="oportunidades" />;
  const [oportunidades, estados] = await Promise.all([listarOportunidades(), listarEstados()]);
  return (
    <Tablero
      oportunidades={oportunidades}
      estados={estados}
      usuarioId={sesion.usuarioId}
      verTodas={sesion.permisos.has('oportunidades.ver_todas')}
      editarTodas={sesion.permisos.has('oportunidades.editar_todas')}
      puedeCrear={sesion.permisos.has('oportunidades.crear')}
    />
  );
}
