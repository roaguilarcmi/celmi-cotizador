import { describe, expect, it } from 'vitest';
import {
  accesosDesdeRedNueva,
  agruparAuditoria,
  cambiosDeFilas,
  conMiles,
  diferenciaPalabras,
  dispositivoDeAgente,
  fechaHoraAuditoria,
  ipParcial,
  rachasFallidas,
  textoDeContenido,
  valorAuditoria,
  type Acceso,
  type FilaAuditoria,
} from './auditoria';

let n = 0;
const fila = (o: Partial<FilaAuditoria>): FilaAuditoria => ({
  id: ++n,
  en: '2026-10-13T19:42:08.000Z',
  usuarioId: 'u-ab',
  usuario: 'Alejandro Bonilla',
  tabla: 'revisiones',
  registroId: 'r1',
  accion: 'UPDATE',
  antes: null,
  despues: null,
  revisionId: 'r1',
  revisionNumero: 1,
  cotizacionId: 'c1',
  folio: 'CELMISOLUTIONS-2026001271',
  oportunidadId: 'o1',
  oportunidad: 'Laptops',
  clienteId: 'cl1',
  cliente: 'LYON DIGITAL',
  etiqueta: null,
  sensible: false,
  ...o,
});

describe('narración de la auditoría', () => {
  it('autorizar: una acción con sus cambios (estado, T.C., utilidad y precio por partida)', () => {
    const [a, ...resto] = agruparAuditoria([
      fila({
        antes: { estado: 'pendiente_autorizacion', vigencia_hasta: null },
        despues: { estado: 'autorizada', vigencia_hasta: '2026-10-20T22:30:00Z' },
      }),
      fila({
        tabla: 'revision_tipos_cambio',
        accion: 'INSERT',
        despues: { moneda: 'USD', tipo_cambio: '18.62150' },
      }),
      fila({
        tabla: 'partida_utilidad',
        accion: 'UPDATE',
        etiqueta: 'Partida 1 · PM3406CKA',
        antes: { utilidad_pct: '12.0000' },
        despues: { utilidad_pct: '14.5000' },
      }),
      fila({
        tabla: 'partida_precios',
        accion: 'INSERT',
        etiqueta: 'Partida 1 · PM3406CKA',
        despues: { precio_unitario: '29908.91' },
      }),
    ]);
    expect(resto).toHaveLength(0);
    expect(a).toMatchObject({
      usuario: 'Alejandro Bonilla',
      tipo: 'autorizacion',
      tono: 'exito',
      verbo: 'autorizó la',
      objeto: 'Rev A',
      contexto: 'CELMISOLUTIONS-2026001271 · LYON DIGITAL',
    });
    expect(a!.cambios).toEqual([
      {
        entidad: '',
        campo: 'Estado',
        tipo: 'modificado',
        antes: 'Pendiente de autorización',
        despues: 'Autorizada',
        largo: false,
      },
      {
        entidad: '',
        campo: 'Vigencia',
        tipo: 'modificado',
        antes: null,
        despues: '20 oct 2026, 16:30 h',
        largo: false,
      },
      {
        entidad: 'T.C. USD',
        campo: 'Tipo de cambio',
        tipo: 'agregado',
        antes: null,
        despues: '18.6215',
        largo: false,
      },
      {
        entidad: 'Partida 1 · PM3406CKA',
        campo: 'Utilidad',
        tipo: 'modificado',
        antes: '12 %',
        despues: '14.5 %',
        largo: false,
      },
      {
        entidad: 'Partida 1 · PM3406CKA',
        campo: 'Precio unitario',
        tipo: 'agregado',
        antes: null,
        despues: '$29,908.91',
        largo: false,
      },
    ]);
  });

  it('separa acciones por hora y usuario; sin usuario es «Sistema»', () => {
    const acciones = agruparAuditoria([
      fila({ en: '2026-10-13T19:00:00Z' }),
      fila({ en: '2026-10-13T18:00:00Z', usuarioId: null, usuario: null }),
    ]);
    expect(acciones.map((x) => x.usuario)).toEqual(['Alejandro Bonilla', 'Sistema']);
  });

  it('partidas: cuenta altas, cambios y bajas; la versión original se nombra así', () => {
    const [a] = agruparAuditoria([
      fila({
        tabla: 'partidas',
        accion: 'INSERT',
        revisionNumero: 0,
        despues: { orden: 3, sku: 'VA27', descripcion: 'Monitor 27"\nGarantía' },
      }),
      fila({
        tabla: 'partidas',
        accion: 'UPDATE',
        registroId: 'p2',
        revisionNumero: 0,
        antes: { orden: 2, sku: 'X', cantidad: 2 },
        despues: { orden: 2, sku: 'X', cantidad: 3 },
      }),
      fila({
        tabla: 'partida_costos',
        accion: 'UPDATE',
        registroId: 'p2',
        revisionNumero: 0,
        etiqueta: 'Partida 2 · X',
        antes: { costo_unitario: '100.00' },
        despues: { costo_unitario: '95.5' },
      }),
    ]);
    expect(a!.verbo).toBe('agregó 1 partida y modificó 1 partida de la');
    expect(a!.objeto).toBe('versión original');
    expect(a!.cambios).toContainEqual({
      entidad: 'Partida 3 · VA27',
      campo: 'Se agregó',
      tipo: 'agregado',
      antes: null,
      despues: 'Monitor 27"',
      largo: true,
    });
    expect(a!.cambios).toContainEqual({
      entidad: 'Partida 2 · X',
      campo: 'Cantidad',
      tipo: 'modificado',
      antes: '2',
      despues: '3',
      largo: false,
    });
    expect(a!.cambios).toContainEqual({
      entidad: 'Partida 2 · X',
      campo: 'Costo unitario',
      tipo: 'modificado',
      antes: '$100.00',
      despues: '$95.50',
      largo: false,
    });
  });

  it('emisión, cancelación y solicitud de cancelación', () => {
    const emitir = agruparAuditoria([
      fila({
        antes: { estado: 'autorizada' },
        despues: { estado: 'emitida', folio: 'CELMISOLUTIONS-2026001271' },
      }),
    ])[0]!;
    expect([emitir.verbo, emitir.objeto, emitir.tipo]).toEqual([
      'emitió la cotización',
      'CELMISOLUTIONS-2026001271',
      'emision',
    ]);
    const cancelar = agruparAuditoria([
      fila({
        sensible: true,
        antes: { estado: 'emitida', cancelada_en: null },
        despues: { estado: 'emitida', cancelada_en: '2026-10-13', folio: 'F1' },
      }),
    ])[0]!;
    expect([cancelar.verbo, cancelar.objeto, cancelar.sensible]).toEqual(['canceló el folio', 'F1', true]);
    const pedir = agruparAuditoria([
      fila({
        tabla: 'solicitudes_cancelacion',
        accion: 'INSERT',
        sensible: true,
        despues: { motivo: 'El cliente desistió' },
      }),
    ])[0]!;
    expect(pedir.verbo).toBe('solicitó cancelar el folio');
    expect(pedir.contexto).toContain('«El cliente desistió»');
  });

  it('rol de un usuario: nombres en lugar de identificadores', () => {
    const [a] = agruparAuditoria(
      [
        fila({
          tabla: 'perfiles',
          cotizacionId: null,
          oportunidadId: null,
          folio: null,
          cliente: null,
          sensible: true,
          antes: { nombre: 'Mariana Cruz', rol_id: 'ejecutivo' },
          despues: { nombre: 'Mariana Cruz', rol_id: 'cotizador' },
        }),
      ],
      { roles: { ejecutivo: 'Ejecutivo', cotizador: 'Cotizador/Operador' } },
    );
    expect(a).toMatchObject({
      verbo: 'cambió el rol de',
      objeto: 'Mariana Cruz',
      contexto: 'Ejecutivo → Cotizador/Operador',
      sensible: true,
    });
  });

  it('nueva Rev con motivo y razón', () => {
    const [a] = agruparAuditoria([
      fila({ accion: 'INSERT', despues: { numero: 2, motivo: 'mejora_precio', razon: 'CVA bajó el costo' } }),
    ]);
    expect(a).toMatchObject({ verbo: 'creó la', objeto: 'Rev B' });
    expect(a!.contexto).toBe(
      'CELMISOLUTIONS-2026001271 · LYON DIGITAL · Mejora de precio · «CVA bajó el costo»',
    );
  });

  it('no muestra campos internos (ids, fechas de sistema)', () => {
    expect(
      cambiosDeFilas([
        fila({
          antes: { id: 'x', autorizada_en: null, numero: 1 },
          despues: { id: 'x', autorizada_en: '2026-10-13', numero: 1 },
        }),
      ]),
    ).toEqual([]);
  });
});

describe('formato de valores', () => {
  it('dinero, porcentaje, fechas, sí/no, enums y texto con formato', () => {
    expect(conMiles('1234567.5')).toBe('1,234,567.50');
    expect(conMiles('-12.345')).toBe('-12.345');
    expect(valorAuditoria('precio_unitario', '29908.91')).toBe('$29,908.91');
    expect(valorAuditoria('anticipo_pct', '50.0000')).toBe('50 %');
    expect(valorAuditoria('vigencia', '2026-10-20')).toBe('20 oct 2026');
    expect(valorAuditoria('se_suma', true)).toBe('Sí');
    expect(valorAuditoria('visibilidad', 'interna')).toBe('Rev interna');
    expect(valorAuditoria('ejecutivo_id', 'u1', { perfiles: { u1: 'Jorge' } })).toBe('Jorge');
    expect(
      textoDeContenido({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hola' },
              { type: 'text', text: ' mundo' },
            ],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'Dos' }] },
        ],
      }),
    ).toBe('Hola mundo\nDos');
    expect(fechaHoraAuditoria('2026-10-13T19:42:08Z')).toBe('13 oct 2026, 13:42 h');
  });

  it('diferencia palabra por palabra (separa en espacios, no en letras)', () => {
    const d = diferenciaPalabras(
      'Monitor de 27 pulgadas VA27EHE',
      'Monitor de 27 pulgadas VA27EHF con garantía',
    );
    expect(d.antes).toEqual([
      { texto: 'Monitor de 27 pulgadas ', tipo: 'igual' },
      { texto: 'VA27EHE', tipo: 'quitado' },
    ]);
    expect(d.despues.filter((x) => x.tipo === 'agregado').map((x) => x.texto.trim())).toEqual([
      'VA27EHF con garantía',
    ]);
  });
});

describe('accesos', () => {
  const acc = (o: Partial<Acceso>): Acceso => ({
    id: ++n,
    en: '2026-10-13T15:00:00Z',
    usuarioId: 'u1',
    correo: 'jorge@celmi.com.mx',
    evento: 'inicio',
    ip: '189.203.10.20',
    agente: null,
    ...o,
  });

  it('IP parcial y dispositivo', () => {
    expect(ipParcial('189.203.10.20')).toBe('189.203.xx.xx');
    expect(ipParcial(null)).toBe('—');
    expect(
      dispositivoDeAgente(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0',
      ),
    ).toBe('Edge · Windows');
    expect(
      dispositivoDeAgente(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
      ),
    ).toBe('Safari · iPhone');
  });

  it('red nueva: un inicio desde una red que la cuenta no usó en 30 días', () => {
    const a = acc({ en: '2026-10-01T10:00:00Z' });
    const b = acc({ en: '2026-10-05T10:00:00Z' });
    const c = acc({ en: '2026-10-06T10:00:00Z', ip: '187.190.1.1' });
    expect([...accesosDesdeRedNueva([c, a, b])]).toEqual([c.id]);
  });

  it('rachas de intentos fallidos (3 o más en 15 minutos)', () => {
    const r = rachasFallidas([
      acc({ evento: 'fallido', correo: 'x@y.com', en: '2026-10-13T15:10:00Z' }),
      acc({ evento: 'fallido', correo: 'X@y.com', en: '2026-10-13T15:12:00Z' }),
      acc({ evento: 'fallido', correo: 'x@y.com', en: '2026-10-13T15:14:00Z' }),
      acc({ evento: 'fallido', correo: 'x@y.com', en: '2026-10-13T18:00:00Z' }),
    ]);
    expect(r).toEqual([
      {
        correo: 'x@y.com',
        intentos: 3,
        desde: '2026-10-13T15:10:00Z',
        hasta: '2026-10-13T15:14:00Z',
        red: '189.203',
      },
    ]);
  });
});

describe('detalles de narración', () => {
  it('un dato repetido (folio en revisión y cotización) aparece una vez; reordenar no es «editar»', () => {
    const [emitir] = agruparAuditoria([
      fila({ antes: { estado: 'autorizada', folio: null }, despues: { estado: 'emitida', folio: 'F1' } }),
      fila({ tabla: 'cotizaciones', antes: { folio: null }, despues: { folio: 'F1' } }),
    ]);
    expect(emitir!.cambios.filter((c) => c.campo === 'Folio')).toHaveLength(1);
    const [orden] = agruparAuditoria([
      fila({
        tabla: 'condiciones_comerciales',
        cotizacionId: null,
        antes: { nombre: 'Zona', orden: 1 },
        despues: { nombre: 'Zona', orden: 2 },
      }),
    ]);
    expect(orden!.verbo).toBe('reordenó la condición');
  });
});

describe('solicitud de corrida en la auditoría', () => {
  it('se narra con su formato y plazos', () => {
    const [a] = agruparAuditoria([
      fila({ tabla: 'solicitudes_corrida', accion: 'INSERT', despues: { formato: 'ct', plazos: [36, 48] } }),
    ]);
    expect(a).toMatchObject({ verbo: 'generó la solicitud de corrida de la', objeto: 'Rev A' });
    expect(a!.contexto).toBe('CELMISOLUTIONS-2026001271 · LYON DIGITAL · Formato de CT · 36, 48 meses');
  });
});
