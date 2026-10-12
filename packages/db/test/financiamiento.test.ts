import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas } from './base.ts';

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

const doc = (texto: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }] });

/** Revisión autorizada por el camino real (superusuario). */
async function autorizada(ejecutivo: 'jorge' | 'fabiola' = 'jorge') {
  const op = await crearOportunidad(db, ejecutivo);
  await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
    op.revision,
  ]);
  await db.query(`insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48)`, [
    op.partida,
  ]);
  await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [op.revision]);
  return op;
}

describe('oportunidad: tipo general (0017)', () => {
  it('por omisión es arrendamiento y sólo admite adquisición o arrendamiento', async () => {
    const op = await crearOportunidad(db, 'jorge');
    const [o] = await filas<{ tipo: string }>(db, 'select tipo from public.oportunidades where id = $1', [
      op.oportunidad,
    ]);
    expect(o!.tipo).toBe('arrendamiento');
    await expect(
      db.query(`update public.oportunidades set tipo = 'otro' where id = $1`, [op.oportunidad]),
    ).rejects.toThrow();
  });
});

describe('condiciones comerciales (0017)', () => {
  it('el catálogo lo administra quien tiene el permiso; todos lo leen', async () => {
    await como(db, 'alejandro', async () => {
      const r = await db.query(
        `insert into public.condiciones_comerciales (nombre, contenido) values ('Vigencia', $1)`,
        [doc('Vigencia hasta {vigencia}')],
      );
      expect(r.affectedRows).toBe(1);
    });
    await expect(
      como(db, 'jorge', () =>
        db.query(`insert into public.condiciones_comerciales (nombre, contenido) values ('X', $1)`, [
          doc('x'),
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('se eligen y ajustan por revisión; una Rev nueva las hereda; bloqueadas al autorizar', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await como(db, 'jorge', async () => {
      await db.query('select public.guardar_condiciones($1, $2)', [
        op.revision,
        JSON.stringify([
          { contenido: JSON.parse(doc('Precios en MXN más IVA')) },
          { contenido: JSON.parse(doc('Entrega 10 semanas')) },
        ]),
      ]);
    });
    // Guardado fuera de como() para que persista.
    await db.query('select public.guardar_condiciones($1, $2)', [
      op.revision,
      JSON.stringify([{ contenido: JSON.parse(doc('Precios en MXN más IVA')) }]),
    ]);
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    await expect(
      como(db, 'jorge', () => db.query('select public.guardar_condiciones($1, $2)', [op.revision, '[]'])),
    ).rejects.toThrow(/ya no se puede modificar/);
    await db.query(`insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48)`, [
      op.partida,
    ]);
    await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [op.revision]);
    await como(db, 'jorge', async () => {
      const [{ id }] = (await filas<{ id: string }>(
        db,
        `select public.crear_revision($1, 'solicitud_cliente', 'Razón de prueba') as id`,
        [op.cotizacion],
      )) as [{ id: string }];
      const heredadas = await filas(db, 'select 1 from public.revision_condiciones where revision_id = $1', [
        id,
      ]);
      expect(heredadas).toHaveLength(1);
    });
  });
});

describe('opciones de financiamiento (0017, 0023)', () => {
  const fila = (propuesta: string, extra: Record<string, unknown> = {}) => ({
    propuesta_id: propuesta,
    folio_financiera: 'COT-123',
    tipo_arrendamiento: 'vjm',
    plazo_meses: 36,
    frecuencia: 'mensual',
    valor_equipos: '32990.96',
    gastos_iniciales: '1500',
    pago: '1234.56',
    pago_seguro: '120.50',
    factor: '0.034567',
    tasa_interes: '18.5',
    vigencia_financiera: '2026-10-30',
    ...extra,
  });

  it('sólo se captura con los precios autorizados', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await expect(
      como(db, 'jorge', () =>
        db.query('select public.guardar_financiamiento($1, $2)', [
          op.revision,
          JSON.stringify([fila(op.propuesta)]),
        ]),
      ),
    ).rejects.toThrow(/precios ya están autorizados/);
  });

  it('el ejecutivo captura varias opciones por propuesta, con financiera, aseguradora y residual en Full PayOut', async () => {
    const op = await autorizada();
    const [fin] = await filas<{ id: string }>(
      db,
      `insert into public.financieras (nombre, razon_social, aseguradoras)
       values ('Arrendadora X', 'Arrendadora X S.A.', '{Seguros A,Seguros B}') returning id`,
    );
    await como(db, 'jorge', async () => {
      await db.query('select public.guardar_financiamiento($1, $2)', [
        op.revision,
        JSON.stringify([
          fila(op.propuesta, { financiera_id: fin!.id, aseguradora: 'Seguros A' }),
          fila(op.propuesta, {
            tipo_arrendamiento: 'fpo',
            plazo_meses: 48,
            frecuencia: 'trimestral',
            residual_capturado: 'pct',
            residual_pct: '10',
            valor_residual: '3299.10',
          }),
        ]),
      ]);
      const r = await filas<{
        tipo_arrendamiento: string;
        frecuencia: string;
        residual_pct: string | null;
        aseguradora: string;
      }>(
        db,
        'select tipo_arrendamiento, frecuencia, residual_pct::text, aseguradora from public.propuesta_financiamientos order by orden',
      );
      expect(r).toEqual([
        { tipo_arrendamiento: 'vjm', frecuencia: 'mensual', residual_pct: null, aseguradora: 'Seguros A' },
        { tipo_arrendamiento: 'fpo', frecuencia: 'trimestral', residual_pct: '10.0000', aseguradora: '' },
      ]);
    });
  });

  it('desglose de gastos iniciales y tasa de la financiera (0030); se suman en gastos_apertura', async () => {
    const op = await autorizada();
    await como(db, 'jorge', async () => {
      await db.query('select public.guardar_financiamiento($1, $2)', [
        op.revision,
        JSON.stringify([
          fila(op.propuesta, {
            gastos_iniciales: '',
            gastos_administrativos: '5500.00',
            seguro_equipo: '221.92',
            tasa_financiera: '16.37',
          }),
          fila(op.propuesta),
        ]),
      ]);
      const r = await filas<{
        apertura: string;
        adm: string | null;
        seg: string | null;
        tasa: string | null;
      }>(
        db,
        `select gastos_apertura::text as apertura, gastos_administrativos::text as adm, seguro_equipo::text as seg,
                tasa_financiera::text as tasa
         from public.propuesta_financiamientos order by orden`,
      );
      expect(r).toEqual([
        { apertura: '5721.92', adm: '5500.00', seg: '221.92', tasa: '16.370000' },
        // Sin desglose (opciones anteriores) se conserva el total capturado.
        { apertura: '1500.00', adm: null, seg: null, tasa: null },
      ]);
    });
  });

  it('el residual sólo va en Full PayOut y la frecuencia es una de las cinco', async () => {
    const op = await autorizada();
    await expect(
      como(db, 'jorge', () =>
        db.query('select public.guardar_financiamiento($1, $2)', [
          op.revision,
          JSON.stringify([
            fila(op.propuesta, { residual_capturado: 'pct', residual_pct: '5', valor_residual: '100' }),
          ]),
        ]),
      ),
    ).rejects.toThrow(/residual_solo_fpo/);
    await expect(
      como(db, 'jorge', () =>
        db.query('select public.guardar_financiamiento($1, $2)', [
          op.revision,
          JSON.stringify([fila(op.propuesta, { frecuencia: 'quincenal' })]),
        ]),
      ),
    ).rejects.toThrow();
  });

  it('nadie captura en cotizaciones ajenas; las financieras las administra quien administra catálogos', async () => {
    const op = await autorizada();
    await expect(
      como(db, 'fabiola', () =>
        db.query('select public.guardar_financiamiento($1, $2)', [
          op.revision,
          JSON.stringify([fila(op.propuesta)]),
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      como(db, 'jorge', () => db.query(`insert into public.financieras (nombre) values ('Otra')`)),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('fecha de emisión de la financiera (0025)', () => {
  it('se guarda y la vigencia no puede ser anterior', async () => {
    const op = await autorizada();
    const opcion = {
      propuesta_id: op.propuesta,
      plazo_meses: 36,
      frecuencia: 'mensual',
      fecha_emision_financiera: '2026-10-07',
      vigencia_financiera: '2026-10-22',
    };
    await como(db, 'jorge', async () => {
      await db.query('select public.guardar_financiamiento($1, $2)', [op.revision, JSON.stringify([opcion])]);
      const [r] = await filas<{ fecha_emision_financiera: string }>(
        db,
        'select fecha_emision_financiera::text from public.propuesta_financiamientos',
      );
      expect(r!.fecha_emision_financiera).toBe('2026-10-07');
    });
    await expect(
      como(db, 'jorge', () =>
        db.query('select public.guardar_financiamiento($1, $2)', [
          op.revision,
          JSON.stringify([{ ...opcion, vigencia_financiera: '2026-10-01' }]),
        ]),
      ),
    ).rejects.toThrow(/vigencia_despues_de_emision/);
  });
});
