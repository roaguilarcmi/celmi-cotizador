import { EnConstruccion } from '@/components/EnConstruccion';
import { CATALOGOS } from '@/lib/catalogos';
import { listarCondicionesCatalogo } from '@/lib/datos';
import { obtenerSesion } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { EditorCatalogos, type Registro } from './EditorCatalogos';
import { EditorCondiciones } from './EditorCondiciones';

export const metadata = { title: 'Catálogos' };

export default async function Catalogos() {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="catalogos" />;
  const supabase = await clienteServidor();
  const puedeEditar = sesion.permisos.has('catalogos.administrar');
  const condiciones = await listarCondicionesCatalogo(false);
  const resultados = await Promise.all(
    CATALOGOS.map(async (c) => {
      const { data } = await supabase.from(c.tabla).select('*').order(c.orden);
      return [c.tabla, (data ?? []) as Registro[]] as const;
    }),
  );
  return (
    <EditorCatalogos
      catalogos={CATALOGOS}
      datos={Object.fromEntries(resultados)}
      puedeEditar={puedeEditar}
      extra={{
        clave: 'condiciones',
        titulo: 'Condiciones comerciales',
        cuenta: condiciones.length,
        contenido: <EditorCondiciones condiciones={condiciones} puedeEditar={puedeEditar} />,
      }}
    />
  );
}
