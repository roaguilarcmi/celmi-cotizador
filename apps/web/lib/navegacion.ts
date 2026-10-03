import type { IconName } from '@/components/Icon';

export interface Seccion {
  slug: string;
  titulo: string;
  icono: IconName;
  /** Fase del RFP en la que se construye. */
  fase: number;
  descripcion: string;
}

export const SECCIONES: Seccion[] = [
  { slug: '', titulo: 'Inicio', icono: 'inicio', fase: 2, descripcion: 'Dashboard personalizado.' },
  {
    slug: 'oportunidades',
    titulo: 'Oportunidades',
    icono: 'oportunidades',
    fase: 2,
    descripcion: 'Proyectos comerciales de cada cliente, con sus estados y seguimiento.',
  },
  {
    slug: 'cotizaciones',
    titulo: 'Cotizaciones',
    icono: 'cotizaciones',
    fase: 3,
    descripcion: 'Wizard de cotización: propuestas, partidas, Excel, editor enriquecido y reordenamiento.',
  },
  {
    slug: 'autorizaciones',
    titulo: 'Autorizaciones',
    icono: 'autorizaciones',
    fase: 4,
    descripcion: 'Bandeja del autorizador: utilidad, precios y bloqueo de partidas.',
  },
  {
    slug: 'clientes',
    titulo: 'Clientes',
    icono: 'clientes',
    fase: 2,
    descripcion: 'Catálogo centralizado de clientes, con búsqueda por empresa, contacto, correo y teléfono.',
  },
  {
    slug: 'catalogos',
    titulo: 'Catálogos',
    icono: 'catalogos',
    fase: 2,
    descripcion: 'Mayoristas, marcas, monedas, unidades y condiciones comerciales.',
  },
  {
    slug: 'auditoria',
    titulo: 'Auditoría',
    icono: 'auditoria',
    fase: 7,
    descripcion: 'Registro inalterable de quién hizo qué, cuándo y con qué valores.',
  },
];

/** El paso actual muestra el nombre completo; los demás, el corto (el completo queda en el título). */
export const PASOS_WIZARD = [
  { corto: 'Cliente', largo: 'Cliente y oportunidad' },
  { corto: 'Esquema', largo: 'Esquema de adquisición' },
  { corto: 'Partidas', largo: 'Partidas' },
  { corto: 'Costos', largo: 'Costos y proveedores' },
  { corto: 'Margen', largo: 'Margen y autorización' },
  { corto: 'Condiciones', largo: 'Condiciones comerciales' },
  { corto: 'Vista previa', largo: 'Vista previa' },
  { corto: 'Emisión', largo: 'Emisión' },
] as const;
