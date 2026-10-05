import { describe, expect, it } from 'vitest';
import { cifrarRespaldo, descifrarRespaldo, nombreDeRespaldo, type Respaldo } from './respaldo.ts';

const muestra: Respaldo = {
  version: 1,
  creado_en: '2026-10-05T20:30:00.000Z',
  migracion: '0013_etapas_personalizadas_y_orden.sql',
  tablas: { 'public.clientes': [{ id: '1', razon_social: 'EPOXEMEX', rfc: 'EPO123' }], 'public.tareas': [] },
};
const clave = 'una clave larga y secreta';

describe('respaldos cifrados', () => {
  it('lo que se cifra se recupera igual', () => {
    expect(descifrarRespaldo(cifrarRespaldo(muestra, clave), clave)).toEqual(muestra);
  });

  it('el archivo no deja ver los datos', () => {
    expect(cifrarRespaldo(muestra, clave).toString('latin1')).not.toContain('EPOXEMEX');
  });

  it('una clave equivocada o un archivo alterado se rechazan', () => {
    const archivo = cifrarRespaldo(muestra, clave);
    expect(() => descifrarRespaldo(archivo, 'otra clave larga y secreta')).toThrow(/no coincide/);
    const alterado = Buffer.from(archivo);
    alterado[alterado.length - 1]! ^= 1;
    expect(() => descifrarRespaldo(alterado, clave)).toThrow(/dañado/);
  });

  it('exige una clave de al menos 16 caracteres', () => {
    expect(() => cifrarRespaldo(muestra, 'corta')).toThrow(/16/);
  });

  it('nombra los archivos por fecha para ordenarlos', () => {
    expect(nombreDeRespaldo(new Date(2026, 9, 5, 14, 30))).toBe('celmi-2026-10-05-1430.respaldo');
  });
});
