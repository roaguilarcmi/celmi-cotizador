import { BotonEnviar, Encabezado } from '@/components/formulario';
import { confirmarEnlace } from './acciones';

export const metadata = { title: 'Activa tu acceso' };

/**
 * El enlace sólo se canjea al presionar «Continuar»: así las vistas previas automáticas de Teams, WhatsApp o
 * el correo no lo consumen antes que la persona.
 */
export default async function Confirmar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token_hash: tokenHash = '', type: tipo = '' } = await searchParams;
  const esAlta = tipo === 'invite';
  return (
    <>
      <Encabezado titulo={esAlta ? 'Activa tu acceso' : 'Recupera tu acceso'}>
        {esAlta
          ? 'Un administrador te dio de alta en el Cotizador CELMI. Continúa para crear tu contraseña y configurar la verificación en dos pasos.'
          : 'Continúa para crear una contraseña nueva. Después te pediremos tu código de verificación.'}
      </Encabezado>
      <form action={confirmarEnlace}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="tipo" value={tipo} />
        <BotonEnviar>Continuar</BotonEnviar>
      </form>
      <p className="mt-4 text-xs text-texto-suave">
        El enlace es personal, funciona una sola vez y vence pronto.
      </p>
    </>
  );
}
