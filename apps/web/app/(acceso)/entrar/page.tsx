import { Encabezado } from '@/components/formulario';
import { Icon } from '@/components/Icon';
import { rutaSegura } from '@/lib/sesion';
import { FormularioEntrar } from './FormularioEntrar';

export const metadata = { title: 'Entrar' };

const AVISOS: Record<string, string> = {
  inactividad: 'Cerramos tu sesión por inactividad. Vuelve a entrar para continuar.',
  'sin-acceso': 'Tu usuario no está habilitado en el Cotizador. Pídele acceso a un administrador.',
  'enlace-vencido': 'El enlace ya se usó o venció. Pide uno nuevo a un administrador.',
  'contrasena-actualizada': 'Tu contraseña se actualizó. Entra con ella.',
};

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const clave = p.motivo ?? p.error;
  return (
    <>
      <Encabezado titulo="Bienvenido">
        Entra con tu correo corporativo. Después te pediremos tu código de verificación.
      </Encabezado>
      <FormularioEntrar siguiente={rutaSegura(p.siguiente)} aviso={clave ? (AVISOS[clave] ?? null) : null} />
      <div className="mt-8 flex gap-3 rounded-lg border border-borde bg-superficie p-4 text-[13px] leading-relaxed text-texto-suave">
        <span className="mt-0.5 text-acento-texto">
          <Icon name="llave" size={18} />
        </span>
        <p>
          <strong className="text-texto">¿Olvidaste tu contraseña o cambiaste de celular?</strong> Pídele a un
          administrador un enlace de recuperación o que restablezca tu verificación en dos pasos.
        </p>
      </div>
    </>
  );
}
