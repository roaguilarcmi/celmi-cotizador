import { EnConstruccion } from '@/components/EnConstruccion';
import { Tarjeta } from '@/components/ui';
import { listarCotizaciones } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';
import { ListaCotizaciones } from './ListaCotizaciones';

export const metadata = { title: 'Cotizaciones' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="cotizaciones" />;
  const cotizaciones = await listarCotizaciones();
  return (
    <div className="animar-entrada mx-auto max-w-[1100px]">
      <header className="mb-5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Cotizaciones</h1>
        <p className="mt-1.5 text-sm text-texto-suave">
          Las de tus oportunidades. Una cotización nueva se crea desde la ficha de la oportunidad.
        </p>
      </header>
      <Tarjeta className="px-5 py-2">
        <ListaCotizaciones
          cotizaciones={cotizaciones}
          mostrarOportunidad
          vacio="Aún no hay cotizaciones. Crea la primera desde una oportunidad con «Nueva cotización»."
        />
      </Tarjeta>
    </div>
  );
}
