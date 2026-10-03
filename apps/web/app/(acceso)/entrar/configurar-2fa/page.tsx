import { Encabezado } from '@/components/formulario';
import { rutaSegura } from '@/lib/sesion';
import { Configurar2fa } from './Configurar2fa';

export const metadata = { title: 'Configura tu verificación en dos pasos' };

export default async function PaginaConfigurar2fa({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { siguiente } = await searchParams;
  return (
    <>
      <Encabezado titulo="Protege tu cuenta">
        La verificación en dos pasos es obligatoria: además de tu contraseña, pediremos un código de tu
        celular. Sólo se configura una vez.
      </Encabezado>
      <Configurar2fa siguiente={rutaSegura(siguiente)} />
    </>
  );
}
