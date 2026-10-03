import { Encabezado } from '@/components/formulario';
import { rutaSegura } from '@/lib/sesion';
import { Verificar } from './Verificar';

export const metadata = { title: 'Verificación en dos pasos' };

export default async function PaginaVerificar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { siguiente } = await searchParams;
  return (
    <>
      <Encabezado titulo="Verificación en dos pasos">
        Abre tu app autenticadora y escribe el código de 6 dígitos de <strong>Cotizador CELMI</strong>.
      </Encabezado>
      <Verificar siguiente={rutaSegura(siguiente)} />
    </>
  );
}
