import { exigirPermiso } from '@/lib/sesion';
import { clienteAdmin } from '@/lib/supabase/admin';
import { clienteServidor } from '@/lib/supabase/servidor';
import { UsuariosAdmin, type FilaUsuario, type OpcionRol } from './UsuariosAdmin';

export const metadata = { title: 'Usuarios' };

/** Usuarios del RFP §4, para ver el diseño en modo demostración (sin Supabase). */
const DEMO: FilaUsuario[] = [
  {
    id: '1',
    nombre: 'Alejandro Bonilla Becerril',
    correo: 'alejandro.bonilla@celmi.com.mx',
    puesto: 'Gerente General',
    rolId: 'administrador',
    activo: true,
    con2fa: true,
    ultimoAcceso: 'hace 2 h',
  },
  {
    id: 'demo',
    nombre: 'Rodrigo Rivera Aguilar',
    correo: 'rodrigo.aguilar@celmi.com.mx',
    puesto: 'Preventa',
    rolId: 'administrador',
    activo: true,
    con2fa: true,
    ultimoAcceso: 'ahora',
  },
  {
    id: '3',
    nombre: 'Jorge Luis Salguero Ramírez',
    correo: 'jorge.salguero@celmi.com.mx',
    puesto: 'Preventa',
    rolId: 'ejecutivo',
    activo: true,
    con2fa: true,
    ultimoAcceso: 'ayer',
  },
  {
    id: '4',
    nombre: 'Fabiola Reyes Hernández',
    correo: 'fabiola.reyes@celmi.com.mx',
    puesto: 'Desarrollo de negocios',
    rolId: 'ejecutivo',
    activo: true,
    con2fa: false,
    ultimoAcceso: null,
  },
  {
    id: '5',
    nombre: 'Jhovanny Sánchez Nicolás',
    correo: 'jhovanny.sanchez@celmi.com.mx',
    puesto: 'Desarrollo de negocios',
    rolId: 'cotizador',
    activo: true,
    con2fa: true,
    ultimoAcceso: 'hace 3 días',
  },
  {
    id: '6',
    nombre: 'César Mendoza Ramos',
    correo: 'cesar.mendoza@celmi.com.mx',
    puesto: 'Desarrollo de negocios',
    rolId: 'ejecutivo',
    activo: false,
    con2fa: false,
    ultimoAcceso: null,
  },
];

const ROLES_DEMO: OpcionRol[] = [
  { id: 'administrador', nombre: 'Administrador / Autorizador' },
  { id: 'ejecutivo', nombre: 'Ejecutivo' },
  { id: 'cotizador', nombre: 'Cotizador / Operador' },
];

function haceCuanto(fecha: string): string {
  const minutos = Math.round((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (minutos < 2) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

export default async function Usuarios() {
  const sesion = await exigirPermiso('usuarios.administrar');
  if (sesion.demo) return <UsuariosAdmin usuarios={DEMO} roles={ROLES_DEMO} yo="demo" demo />;

  const supabase = await clienteServidor();
  const [perfiles, roles, accesos] = await Promise.all([
    supabase.from('perfiles').select('id, nombre, correo, puesto, rol_id, activo').order('nombre'),
    supabase.from('roles').select('id, nombre').order('nombre'),
    supabase
      .from('accesos')
      .select('usuario_id, en')
      .eq('evento', 'inicio')
      .order('en', { ascending: false })
      .limit(500),
  ]);

  const ultimo = new Map<string, string>();
  for (const a of (accesos.data ?? []) as { usuario_id: string | null; en: string }[]) {
    if (a.usuario_id && !ultimo.has(a.usuario_id)) ultimo.set(a.usuario_id, a.en);
  }

  const admin = clienteAdmin();
  const filas = (perfiles.data ?? []) as {
    id: string;
    nombre: string;
    correo: string;
    puesto: string;
    rol_id: string;
    activo: boolean;
  }[];
  const usuarios: FilaUsuario[] = await Promise.all(
    filas.map(async (p) => {
      const { data } = await admin.auth.admin.mfa.listFactors({ userId: p.id });
      const fecha = ultimo.get(p.id);
      return {
        id: p.id,
        nombre: p.nombre,
        correo: p.correo,
        puesto: p.puesto,
        rolId: p.rol_id,
        activo: p.activo,
        con2fa: (data?.factors ?? []).some((f) => f.status === 'verified'),
        ultimoAcceso: fecha ? haceCuanto(fecha) : null,
      };
    }),
  );

  return (
    <UsuariosAdmin
      usuarios={usuarios}
      roles={(roles.data ?? []) as OpcionRol[]}
      yo={sesion.usuarioId}
      demo={false}
    />
  );
}
