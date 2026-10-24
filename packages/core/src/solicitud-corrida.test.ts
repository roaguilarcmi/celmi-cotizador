import { describe, expect, it } from 'vitest';
import {
  lineasSolicitud,
  nombreArchivoSolicitud,
  sugerirCategoria,
  textoCorreoSolicitud,
  textoPlazos,
  type PartidaSolicitud,
  type PropuestaSolicitud,
} from './solicitud-corrida';

const pa = (o: Partial<PartidaSolicitud> & { id: string }): PartidaSolicitud => ({
  padreId: null,
  presentacion: 'linea',
  cantidad: 1,
  precioUnitario: 0n,
  costoUnitario: 0n,
  seSuma: false,
  prorratearEntre: [],
  ...o,
});

// Laptop (A) con SSD incluido (B), envío prorrateado (C) y mochila visible (D); adicionales: mouse que se suma (E)
// y otro que no (F).
const PROPUESTAS: PropuestaSolicitud[] = [
  {
    id: 'p1',
    esAdicional: false,
    partidas: [
      pa({ id: 'A', cantidad: 10, costoUnitario: 10000n, precioUnitario: 13000n }),
      pa({
        id: 'B',
        padreId: 'A',
        presentacion: 'incluida',
        cantidad: 10,
        costoUnitario: 2000n,
        precioUnitario: 3000n,
      }),
      pa({
        id: 'C',
        presentacion: 'prorrateada',
        costoUnitario: 5000n,
        precioUnitario: 6000n,
        prorratearEntre: ['A'],
      }),
      pa({ id: 'D', padreId: 'A', cantidad: 2, costoUnitario: 300n, precioUnitario: 450n }),
    ],
  },
  {
    id: 'adic',
    esAdicional: true,
    partidas: [
      pa({ id: 'E', seSuma: true, costoUnitario: 1000n, precioUnitario: 1500n }),
      pa({ id: 'F', costoUnitario: 900n, precioUnitario: 1200n }),
    ],
  },
];

describe('líneas de la solicitud de corrida', () => {
  it('como las ve el cliente: incluidos y cargos dentro (costo del cargo repartido igual que su precio)', () => {
    const s = lineasSolicitud(PROPUESTAS, 'p1', 'cliente');
    expect(s.lineas.map((l) => [l.partidaId, l.cantidad, l.costoUnitario, l.precioUnitario])).toEqual([
      ['A', 10, 12500n, 16600n], // (100 + 20) + 50/10 de costo; (130 + 30) + 60/10 de precio
      ['D', 2, 300n, 450n],
      ['E', 1, 1000n, 1500n], // adicional que se suma
    ]);
    expect(s.totales.subtotal).toBe(166000n + 900n + 1500n);
    expect(s.costo).toBe(125000n + 600n + 1000n);
    expect(s.diferencia).toBe(0n);
  });

  it('desglosada: cada partida, adicional y cargo en su línea', () => {
    const s = lineasSolicitud(PROPUESTAS, 'p1', 'desglosada');
    expect(s.lineas.map((l) => l.partidaId)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(s.totales.subtotal).toBe(130000n + 30000n + 6000n + 900n + 1500n);
    expect(s.diferencia).toBe(0n);
  });

  it('sólo sobre propuestas principales', () => {
    expect(() => lineasSolicitud(PROPUESTAS, 'adic', 'cliente')).toThrow(/principal/);
  });
});

describe('categorías sugeridas', () => {
  it('por la descripción', () => {
    expect(sugerirCategoria('Laptop ASUS ExpertBook PM3406CKA 14"')).toBe('Laptop');
    expect(sugerirCategoria('Computadora portátil Asus')).toBe('Laptop');
    expect(sugerirCategoria('Monitor ASUS 27" VA27EHF')).toBe('Monitor');
    expect(sugerirCategoria('Ampliación de cobertura para NX ExpertBook a 3 años')).toBe('Garantía');
    expect(sugerirCategoria('Servicio de instalación y configuración')).toBe('Servicio');
    expect(sugerirCategoria('Microsoft 365 Business Standard, licencia anual')).toBe('Licencia');
    expect(sugerirCategoria('Artículo sin pistas')).toBeNull();
  });
});

describe('textos', () => {
  it('plazos', () => {
    expect(textoPlazos([48, 36])).toBe('36 y 48 meses');
    expect(textoPlazos([24, 36, 60])).toBe('24, 36 y 60 meses');
  });

  it('nombre del archivo de CT con su regla: FORMATO CORRIDA FINANCIERA - EMPRESA - ESQUEMA - FECHA', () => {
    const fecha = new Date('2026-10-23T18:00:00Z');
    expect(
      nombreArchivoSolicitud('ct', { empresa: 'Lyon Digital S.A. de C.V.', esquemas: ['vjm', 'fpo'], fecha }),
    ).toBe('FORMATO CORRIDA FINANCIERA - LYON DIGITAL S.A. DE C.V. - VJM Y FPO - 23-10-2026.xlsx');
    expect(
      nombreArchivoSolicitud('ingram', {
        empresa: 'A/B: "C"',
        esquemas: ['credito'],
        fecha,
        propuesta: 'Propuesta 2',
      }),
    ).toBe('MIX DE EQUIPO ARRENDAMIENTO - A B C - CREDITO SIMPLE - 23-10-2026 (PROPUESTA 2).xlsx');
  });

  it('correo con saltos de línea y viñetas', () => {
    const { asunto, cuerpo } = textoCorreoSolicitud({
      empresa: 'LYON DIGITAL',
      credito: false,
      plazos: [36, 48],
      esquemas: ['vjm', 'fpo'],
      propuestas: [{ nombre: 'Propuesta 1', subtotal: 30737900n }],
      ejecutivo: {
        nombre: 'Jorge Hernández',
        puesto: 'Ejecutivo de cuenta',
        correo: 'j@celmi.com.mx',
        telefono: '771 123 4567',
      },
    });
    expect(asunto).toBe('Solicitud de corrida de arrendamiento · LYON DIGITAL · 36 y 48 meses');
    expect(cuerpo).toContain('\n• Plazos: 36 y 48 meses\n');
    expect(cuerpo).toContain('• Valor de los equipos: $307,379.00 + IVA');
    expect(cuerpo).toContain('• Opción de compra o valor residual');
    expect(
      cuerpo.endsWith('Jorge Hernández\nEjecutivo de cuenta · CELMI Solutions\n771 123 4567\nj@celmi.com.mx'),
    ).toBe(true);
  });
});
