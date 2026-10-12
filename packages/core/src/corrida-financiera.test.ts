import { describe, expect, it } from 'vitest';
import { leerCorridaFinanciera } from './corrida-financiera';

// Textos como los entrega pdf.js de las cotizaciones de DLL que compartió Rodrigo (TS667-2526 y TS667-2527, LYON).
const comunes = [
  'Nombre del Cliente',
  'LYON DIGITAL',
  'Teléfono del Cliente',
  ' ',
  'RFC del Cliente',
  'N/A',
  'Email del Cliente',
  'Fecha de cotización',
  '09/10/2026',
];
const equipos = [
  'Datos de la Solicitud',
  'Tipo de Equipo',
  ' ',
  'Modelo del Equipo',
  'Laptops',
  ' ',
  'Computadora portátil Asus ExpertBook modelo PM3406CKA de 14',
  'pulgadas',
  'asus',
  ' ',
  'MXN',
  ' ',
  '$25,507.95',
  ' ',
  '10',
  ' ',
  '$255,079.50',
  'Total',
  ' ',
  '$299,089.10',
  'Lista de Equipos',
  'Monto',
  ' ',
  'IVA',
  ' ',
  'Total',
  'Gastos Administrativos',
  ' ',
  '$5,500.00',
  ' ',
  '$880.00',
  ' ',
  '$6,380.00',
  'Seguro Equipo',
  ' ',
  '$221.92',
  ' ',
  '$35.51',
  ' ',
  '$257.43',
  'Total',
  ' ',
  '$6,637.43',
  'Desglose de gastos iniciales (MXN)',
];
const consideraciones = [
  'Consideraciones de esta cotización',
  'Vigencia de la propuesta 15 días a partir de la fecha indicada arriba.',
  'Esta propuesta no obliga a De Lage Landen México a participar en la transacción aquí descrita.',
];

const PURO = [
  'Cotización #TS667-2526',
  ...comunes,
  'Fecha Inicio Financiamiento',
  '09/10/2026',
  'Fecha Primer Pago',
  '08/11/2026',
  'Valor Total de Equipo(s)',
  '$299,089.10 MXN',
  'Monto a Financiar',
  '$299,089.10 MXN',
  'Frecuencia de Pago',
  'Pagos mensuales',
  'Plan de Financiamiento',
  'Arrendamiento Puro',
  ...equipos,
  'Plazo',
  ' ',
  'Factor',
  ' ',
  'Renta',
  ' ',
  'Seguro',
  '36 meses',
  ' ',
  '0.0327492',
  ' ',
  '$9,794.93',
  ' ',
  '$221.92',
  'Renta Total',
  ' ',
  '$10,016.85 + IVA',
  'Desglose de pagos mensuales (MXN)',
  '* El seguro de vida queda exento de IVA',
  ...consideraciones,
];

const FINANCIERO = [
  'Cotización #TS667-2527',
  ...comunes,
  'Valor Total de Equipo(s)',
  '$299,089.10 MXN',
  'Monto a Financiar',
  '$299,089.10 MXN',
  'Plan de Financiamiento',
  'Arrendamiento Financiero',
  'Frecuencia de Pago',
  'Pagos mensuales',
  'Plazo(Meses)',
  '36 Meses',
  'Tasa de Interés',
  '16.370000%',
  'Opción de Compra (1.00%)',
  '$2,990.89 MXN + IVA',
  ...equipos,
  'Plazo',
  ' ',
  'Pago',
  ' ',
  'Seguro',
  '36 meses',
  ' ',
  '$10,569.80',
  ' ',
  '$221.92',
  'Pago Total',
  ' ',
  '$10,791.72',
  'Desglose de pagos mensuales (MXN)',
  '#',
  ' ',
  'Capital',
  '1',
  ' ',
  '$6,489.73',
  ...consideraciones,
];

describe('leerCorridaFinanciera · DLL', () => {
  it('arrendamiento puro (VJM) con factor y renta', () => {
    expect(leerCorridaFinanciera(PURO)).toEqual({
      financiera: 'dll',
      nombreFinanciera: 'De Lage Landen',
      folio: 'TS667-2526',
      fechaEmision: '2026-10-09',
      diasVigencia: 15,
      tipo: 'vjm',
      plazoMeses: 36,
      frecuencia: 'mensual',
      valorEquipos: '299089.10',
      gastosAdministrativos: '5500.00',
      seguroEquipo: '221.92',
      pago: '9794.93',
      seguro: '221.92',
      factor: '0.0327492',
      tasa: null,
      opcionCompraPct: null,
      opcionCompraMonto: null,
      faltantes: [],
    });
  });

  it('arrendamiento financiero (FPO) con tasa y opción de compra', () => {
    const r = leerCorridaFinanciera(FINANCIERO);
    expect(r).toMatchObject({
      folio: 'TS667-2527',
      tipo: 'fpo',
      plazoMeses: 36,
      pago: '10569.80',
      seguro: '221.92',
      factor: null,
      tasa: '16.37',
      opcionCompraPct: '1',
      opcionCompraMonto: '2990.89',
      gastosAdministrativos: '5500.00',
      seguroEquipo: '221.92',
      faltantes: [],
    });
  });

  it('no reconoce otros formatos', () => {
    expect(leerCorridaFinanciera(['Cotización #123', 'Otra financiera', 'Renta 10,000'])).toBeNull();
    expect(leerCorridaFinanciera([])).toBeNull();
  });

  it('avisa lo que no encontró', () => {
    const sinSeguro = PURO.filter((x) => x !== 'Seguro Equipo');
    expect(leerCorridaFinanciera(sinSeguro)?.faltantes).toEqual(['seguro de equipo']);
  });
});
