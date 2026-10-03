/** Definición de los catálogos editables: misma configuración para la pantalla y para la validación del servidor. */

export type TipoCampo = 'texto' | 'entero' | 'si_no' | 'lista_enteros';

export interface CampoCatalogo {
  id: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  ancho?: string;
  ayuda?: string;
}

export interface DefinicionCatalogo {
  tabla: 'estados_oportunidad' | 'mayoristas' | 'marcas' | 'unidades' | 'monedas' | 'esquemas_adquisicion';
  titulo: string;
  descripcion: string;
  /** Cómo se genera la clave de un registro nuevo. */
  clave: { campo: string; tipo: 'uuid' | 'slug' | 'codigo' };
  campoActivo: 'activo' | 'activa';
  orden: string;
  campos: CampoCatalogo[];
}

export const CATALOGOS: DefinicionCatalogo[] = [
  {
    tabla: 'estados_oportunidad',
    titulo: 'Estados de oportunidad',
    descripcion: 'Columnas del tablero. Los estados finales (Ganada, Perdida…) se agrupan como «cerradas».',
    clave: { campo: 'id', tipo: 'slug' },
    campoActivo: 'activo',
    orden: 'orden',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { id: 'orden', etiqueta: 'Orden', tipo: 'entero', requerido: true, ancho: 'w-20' },
      { id: 'final', etiqueta: 'Final', tipo: 'si_no', ayuda: 'Cierra la oportunidad' },
    ],
  },
  {
    tabla: 'mayoristas',
    titulo: 'Mayoristas',
    descripcion: 'Proveedores a quienes se compra (CVA, Ingram Micro, CT Internacional…).',
    clave: { campo: 'id', tipo: 'uuid' },
    campoActivo: 'activo',
    orden: 'nombre',
    campos: [{ id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true }],
  },
  {
    tabla: 'marcas',
    titulo: 'Marcas',
    descripcion: 'Fabricantes de los productos cotizados.',
    clave: { campo: 'id', tipo: 'uuid' },
    campoActivo: 'activa',
    orden: 'nombre',
    campos: [{ id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true }],
  },
  {
    tabla: 'unidades',
    titulo: 'Unidades de medida',
    descripcion: 'La abreviatura es la que se imprime en el PDF (PIEZA → PZA).',
    clave: { campo: 'id', tipo: 'slug' },
    campoActivo: 'activa',
    orden: 'nombre',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { id: 'abreviatura', etiqueta: 'Abreviatura en PDF', tipo: 'texto', ancho: 'w-32' },
    ],
  },
  {
    tabla: 'monedas',
    titulo: 'Monedas',
    descripcion: 'Monedas de costo de las partidas. Las cotizaciones se presentan en MXN.',
    clave: { campo: 'codigo', tipo: 'codigo' },
    campoActivo: 'activa',
    orden: 'codigo',
    campos: [
      {
        id: 'codigo',
        etiqueta: 'Código ISO',
        tipo: 'texto',
        requerido: true,
        ancho: 'w-24',
        ayuda: '3 letras',
      },
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
    ],
  },
  {
    tabla: 'esquemas_adquisicion',
    titulo: 'Esquemas de adquisición',
    descripcion: 'Adquisición, arrendamientos y crédito, con sus plazos disponibles en meses.',
    clave: { campo: 'id', tipo: 'slug' },
    campoActivo: 'activo',
    orden: 'nombre',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      {
        id: 'plazos_meses',
        etiqueta: 'Plazos (meses)',
        tipo: 'lista_enteros',
        ancho: 'w-40',
        ayuda: 'Ej. 24, 36, 48',
      },
    ],
  },
];

export const catalogoPorTabla = (tabla: string) => CATALOGOS.find((c) => c.tabla === tabla);

/** «En negociación» → «en_negociacion» (clave estable para registros nuevos). */
export const slug = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
