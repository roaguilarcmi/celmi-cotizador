/**
 * Caso real: cotización CELMISOLUTIONS-2026001253 (EPOXEMEX, laptops Dell, 28 sep 2026).
 * Costos tomados de la corrida "FORMATO CORRIDA COTIZACIÓN EPOXEMEX LAPTOPS.xlsx" y montos esperados
 * tomados del PDF enviado al cliente. Sirve como prueba de regresión del motor de cálculo.
 */
export interface PartidaFixture {
  sku: string;
  descripcion: string;
  mayorista: string;
  costoUnitario: string;
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

export const PROPUESTAS_EPOXEMEX: PropuestaFixture[] = [
  {
    nombre: 'Propuesta 1',
    tipo: 'Cómputo',
    modalidad: 'Adquisición',
    partidas: [
      {
        sku: '2GHTM',
        descripcion: 'Laptop Dell Pro 14 Essential de 14 pulgadas color plata',
        mayorista: 'Ingram Micro',
        costoUnitario: '14533.46',
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
        mayorista: 'Ingram Micro',
        costoUnitario: '23145.54',
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
        descripcion: 'Laptop Dell Pro 14 de 14 pulgadas color negro, SSD 1 TB',
        mayorista: 'Ingram Micro',
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
        mayorista: 'CT Internacional',
        costoUnitario: '16224.21',
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
        mayorista: 'CVA',
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
        descripcion: 'Laptop Dell Pro 16 de 16 pulgadas color negro, Core Ultra 7',
        mayorista: 'Ingram Micro',
        costoUnitario: '23975.56',
        cantidad: 2,
      },
    ],
    // El PDF original decía por error "SESENTA Y TRES MIL PESOS CIENTO TREINTA Y DOS PESOS"; aquí va la forma correcta.
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
        descripcion: 'Unidad de estado sólido Kingston NV3 de 1 TB, M.2 2230',
        mayorista: 'Amazon',
        costoUnitario: '4376.02',
        cantidad: 2,
      },
      {
        sku: 'N/A',
        descripcion: 'Servicio de instalación y clonación de unidad',
        mayorista: 'Centro de servicio',
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
