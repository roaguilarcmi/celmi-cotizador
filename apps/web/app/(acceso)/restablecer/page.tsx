import { Encabezado } from '@/components/formulario';
import { NuevaContrasena } from './NuevaContrasena';

export const metadata = { title: 'Crea tu contraseña' };

export default async function Restablecer({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { tipo } = await searchParams;
  return (
    <>
      <Encabezado titulo={tipo === 'invite' ? 'Crea tu contraseña' : 'Crea una contraseña nueva'}>
        Es personal: no la compartas ni la uses en otros sitios.
      </Encabezado>
      <NuevaContrasena />
    </>
  );
}
