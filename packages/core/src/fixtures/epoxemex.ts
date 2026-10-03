/**
 * Caso real: cotización CELMISOLUTIONS-2026001253 (EPOXEMEX, laptops Dell, 28 sep 2026).
 * Datos de la corrida «FORMATO CORRIDA COTIZACIÓN EPOXEMEX LAPTOPS.xlsx» (costos, marca, mayorista,
 * entrega, unidad, descripción) y de la solicitud de precios (precio anterior). Los montos esperados
 * son los impresos en el PDF enviado al cliente. Sirve como prueba de regresión del motor de cálculo.
 * Se corrigieron tres erratas del Excel original: «Memoriia», «fator» e «instlación».
 */
export interface PartidaFixture {
  /** Modelo / SKU del fabricante. */
  sku: string;
  /** Primera línea de la descripción (título del equipo). */
  descripcion: string;
  /** Viñetas de la descripción. */
  especificaciones: string[];
  marca: string;
  mayorista: string;
  entrega: string;
  unidad: string;
  moneda: 'MXN' | 'USD';
  costoUnitario: string;
  /** Costo de la solicitud original, antes de la mejora de precio del mayorista. */
  costoAnterior?: string;
  cantidad: number;
}

export interface PropuestaFixture {
  nombre: string;
  tipo: string;
  modalidad: string;
  /** Partidas internas; si hay más de una, se presentan al cliente como una sola línea. */
  partidas: PartidaFixture[];
  /** Montos impresos en el PDF. */
  esperado: { precioUnitario: string; subtotal: string; iva: string; total: string; letra: string };
}

export const UTILIDAD_EPOXEMEX = '13.5';

const GARANTIA = 'Garantía de 1 año directamente con fabricante';
const ULTRA7 = 'Procesador Intel Core Ultra 7 255U (12 núcleos hasta 5.2 GHz + 12 TOPS NPU)';
const CORE7 = 'Procesador Intel Core 7 150U (10 núcleos hasta 5.4 GHz)';

export const PROPUESTAS_EPOXEMEX: PropuestaFixture[] = [
  {
    nombre: 'Propuesta 1',
    tipo: 'Cómputo',
    modalidad: 'Adquisición',
    partidas: [
      {
        sku: '2GHTM',
        descripcion: 'Laptop Dell Pro 14 Essential de 14 pulgadas color plata',
        especificaciones: [
          CORE7,
          'Memoria RAM de 16 GB',
          'Almacenamiento SSD de 512 GB',
          'Sin puerto Ethernet',
          'Windows 11 Pro',
          GARANTIA,
        ],
        marca: 'DELL',
        mayorista: 'Ingram Micro',
        entrega: '2 DÍAS',
        unidad: 'PIEZA',
        moneda: 'MXN',
        costoUnitario: '14533.46',
        costoAnterior: '19306.67',
        cantidad: 2,
      },
    ],
    esperado: {
      precioUnitario: '16495.48',
      subtotal: '32990.96',
      iva: '5278.55',
      total: '38269.51',
      letra: 'TREINTA Y OCHO MIL DOSCIENTOS SESENTA Y NUEVE PESOS 51/100 M.N.',
    },
  },
  {
    nombre: 'Propuesta 2',
    tipo: 'Cómputo',
    modalidad: 'Adquisición',
    partidas: [
      {
        sku: '2HWN3',
        descripcion: 'Laptop Dell Pro 14 de 14 pulgadas color negro',
        especificaciones: [
          ULTRA7,
          'Memoria RAM de 16 GB',
          'Almacenamiento SSD de 512 GB',
          'Windows 11 Pro',
          GARANTIA,
        ],
        marca: 'DELL',
        mayorista: 'Ingram Micro',
        entrega: '2 DÍAS',
        unidad: 'PIEZA',
        moneda: 'MXN',
        costoUnitario: '23145.54',
        costoAnterior: '25920.00',
        cantidad: 2,
      },
    ],
    esperado: {
      precioUnitario: '26270.19',
      subtotal: '52540.38',
      iva: '8406.46',
      total: '60946.84',
      letra: 'SESENTA MIL NOVECIENTOS CUARENTA Y SEIS PESOS 84/100 M.N.',
    },
  },
  {
    nombre: 'Propuesta 3',
    tipo: 'Cómputo',
    modalidad: 'Adquisición',
    partidas: [
      {
        sku: '197435946',
        descripcion: 'Laptop Dell Pro 14 de 14 pulgadas color negro',
        especificaciones: [
          ULTRA7,
          'Memoria RAM de 16 GB',
          'Almacenamiento SSD de 1 TB',
          'Windows 11 Pro',
          GARANTIA,
        ],
        marca: 'DELL',
        mayorista: 'Ingram Micro',
        entrega: '1 DÍA',
        unidad: 'PIEZA',
        moneda: 'MXN',
        costoUnitario: '30169.61',
        cantidad: 2,
      },
    ],
    esperado: {
      precioUnitario: '34242.51',
      subtotal: '68485.02',
      iva: '10957.60',
      total: '79442.62',
      letra: 'SETENTA Y NUEVE MIL CUATROCIENTOS CUARENTA Y DOS PESOS 62/100 M.N.',
    },
  },
  {
    nombre: 'Propuesta 4',
    tipo: 'Cómputo',
    modalidad: 'Adquisición',
    partidas: [
      {
        sku: '9KP97',
        descripcion: 'Laptop Dell Pro 15 Essential de 15.6 pulgadas color plata',
        especificaciones: [
          'Procesador Intel Core i7 1355U (10 núcleos hasta 5.0 GHz)',
          'Memoria RAM de 16 GB',
          'Almacenamiento SSD de 512 GB',
          'Sin puerto Ethernet',
          'Windows 11 Pro',
          GARANTIA,
        ],
        marca: 'DELL',
        mayorista: 'CT Internacional',
        entrega: '2 DÍAS',
        unidad: 'PIEZA',
        moneda: 'MXN',
        costoUnitario: '16224.21',
        costoAnterior: '16426.67',
        cantidad: 2,
      },
    ],
    esperado: {
      precioUnitario: '18414.48',
      subtotal: '36828.96',
      iva: '5892.63',
      total: '42721.59',
      letra: 'CUARENTA Y DOS MIL SETECIENTOS VEINTIÚN PESOS 59/100 M.N.',
    },
  },
  {
    nombre: 'Propuesta 5',
    tipo: 'Cómputo',
    modalidad: 'Adquisición',
    partidas: [
      {
        sku: 'CTV12',
        descripcion: 'Laptop Dell Pro 16 de 16 pulgadas color negro',
        especificaciones: [
          CORE7,
          'Memoria RAM de 16 GB',
          'Almacenamiento SSD de 512 GB',
          'Windows 11 Pro',
          GARANTIA,
        ],
        marca: 'DELL',
        mayorista: 'CVA',
        entrega: '2 DÍAS',
        unidad: 'PIEZA',
        moneda: 'MXN',
        costoUnitario: '24106.67',
        cantidad: 2,
      },
    ],
    esperado: {
      precioUnitario: '27361.07',
      subtotal: '54722.14',
      iva: '8755.54',
      total: '63477.68',
      letra: 'SESENTA Y TRES MIL CUATROCIENTOS SETENTA Y SIETE PESOS 68/100 M.N.',
    },
  },
  {
    nombre: 'Propuesta 6',
    tipo: 'Cómputo',
    modalidad: 'Adquisición',
    partidas: [
      {
        sku: 'XF5PC',
        descripcion: 'Laptop Dell Pro 16 de 16 pulgadas color negro',
        especificaciones: [
          ULTRA7,
          'Memoria RAM de 16 GB',
          'Almacenamiento SSD de 512 GB',
          'Windows 11 Pro',
          GARANTIA,
        ],
        marca: 'DELL',
        mayorista: 'Ingram Micro',
        entrega: '2 DÍAS',
        unidad: 'PIEZA',
        moneda: 'MXN',
        costoUnitario: '23975.56',
        costoAnterior: '26133.33',
        cantidad: 2,
      },
    ],
    // El PDF original decía por error «SESENTA Y TRES MIL PESOS CIENTO TREINTA Y DOS PESOS»; aquí va la forma correcta.
    esperado: {
      precioUnitario: '27212.26',
      subtotal: '54424.52',
      iva: '8707.92',
      total: '63132.44',
      letra: 'SESENTA Y TRES MIL CIENTO TREINTA Y DOS PESOS 44/100 M.N.',
    },
  },
  {
    nombre: 'Adicional',
    tipo: 'Accesorio',
    modalidad: 'Adquisición y servicio',
    partidas: [
      {
        sku: 'SNV3SM3/1T0',
        descripcion: 'Unidad de estado sólido Kingston de 1 TB',
        especificaciones: [
          'Factor de forma M.2 2230, interfaz NVMe PCIe 4.0',
          'Lectura: 6,000 MB/s, Escritura 4,000 MB/s',
        ],
        marca: 'KINGSTON',
        mayorista: 'Amazon',
        entrega: '5 DÍAS',
        unidad: 'PIEZA',
        moneda: 'MXN',
        costoUnitario: '4376.02',
        cantidad: 2,
      },
      {
        sku: 'N/A',
        descripcion: 'Clonación e instalación de unidad de disco duro',
        especificaciones: [],
        marca: 'N/A',
        mayorista: '—',
        entrega: '5 DÍAS',
        unidad: 'SERVICIO',
        moneda: 'MXN',
        costoUnitario: '600',
        cantidad: 2,
      },
    ],
    esperado: {
      precioUnitario: '5647.78',
      subtotal: '11295.56',
      iva: '1807.29',
      total: '13102.85',
      letra: 'TRECE MIL CIENTO DOS PESOS 85/100 M.N.',
    },
  },
];
