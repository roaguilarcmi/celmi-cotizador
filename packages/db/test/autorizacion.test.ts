import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas } from './base.ts';

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

/** Revisión enviada a autorización (como superusuario, igual que el camino real). */
async function pendiente() {
  const op = await crearOportunidad(db, 'jorge');
  await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
    op.revision,
  ]);
  return op;
}

const lista = (partida: string, utilidad = '13.5', precio = '16495.48') =>
  JSON.stringify([{ partida_id: partida, utilidad_pct: utilidad, precio_unitario: precio }]);

describe('autorización de precios (0019)', () => {
  it('quien autoriza registra utilidad y precio y autoriza en un solo paso', async () => {
    const op = await pendiente();
    await como(db, 'alejandro', async () => {
      await db.query('select public.autorizar_revision($1, $2, comentario => $3)', [
        op.revision,
        lista(op.partida),
        'Listo',
      ]);
      const [r] = await filas<{ estado: string; autorizada_por: string; comentario_autorizacion: string }>(
        db,
        'select estado, autorizada_por, comentario_autorizacion from public.revisiones where id = $1',
        [op.revision],
      );
      expect(r).toMatchObject({ estado: 'autorizada', comentario_autorizacion: 'Listo' });
      expect(r!.autorizada_por).toBe('00000000-0000-4000-8000-000000000001');
      const [p] = await filas<{ precio_unitario: string; utilidad_pct: string }>(
        db,
        `select p.precio_unitario, u.utilidad_pct from public.partida_precios p
         join public.partida_utilidad u using (partida_id) where partida_id = $1`,
        [op.partida],
      );
      expect(Number(p!.precio_unitario)).toBe(16495.48);
      expect(Number(p!.utilidad_pct)).toBe(13.5);
    });
  });

  it('el ejecutivo no puede autorizar ni definir utilidad', async () => {
    const op = await pendiente();
    await expect(
      como(db, 'jorge', () =>
        db.query('select public.autorizar_revision($1, $2)', [op.revision, lista(op.partida)]),
      ),
    ).rejects.toThrow(/permiso/);
    await expect(
      como(db, 'jorge', () =>
        db.query('select public.guardar_utilidades($1, $2)', [op.revision, lista(op.partida)]),
      ),
    ).rejects.toThrow(/permiso/);
  });

  it('rechaza precios que no corresponden a la utilidad', async () => {
    const op = await pendiente();
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2)', [
          op.revision,
          lista(op.partida, '13.5', '16495.47'),
        ]),
      ),
    ).rejects.toThrow(/no coinciden/);
  });

  it('exige todas las partidas, sólo las de la revisión y sin repetir', async () => {
    const op = await pendiente();
    const otra = await pendiente();
    await expect(
      como(db, 'alejandro', () => db.query('select public.autorizar_revision($1, $2)', [op.revision, '[]'])),
    ).rejects.toThrow(/Falta la utilidad/);
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2)', [op.revision, lista(otra.partida)]),
      ),
    ).rejects.toThrow(/no son de esta revisión/);
    const doble = JSON.stringify([
      { partida_id: op.partida, utilidad_pct: '13.5', precio_unitario: '16495.48' },
      { partida_id: op.partida, utilidad_pct: '13.5', precio_unitario: '16495.48' },
    ]);
    await expect(
      como(db, 'alejandro', () => db.query('select public.autorizar_revision($1, $2)', [op.revision, doble])),
    ).rejects.toThrow(/no son de esta revisión/);
  });

  it('no admite utilidad negativa', async () => {
    const op = await pendiente();
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.guardar_utilidades($1, $2)', [op.revision, lista(op.partida, '-1')]),
      ),
    ).rejects.toThrow(/porcentaje/);
  });

  it('sólo autoriza una revisión pendiente; la utilidad se guarda sólo mientras espera', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2)', [op.revision, lista(op.partida)]),
      ),
    ).rejects.toThrow(/espera autorización/);
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.guardar_utilidades($1, $2)', [op.revision, lista(op.partida, '20')]),
      ),
    ).rejects.toThrow(/espera autorización/);
  });

  it('guardar el avance conserva la utilidad sin autorizar', async () => {
    const op = await pendiente();
    await como(db, 'alejandro', async () => {
      await db.query('select public.guardar_utilidades($1, $2)', [op.revision, lista(op.partida, '20')]);
      const [u] = await filas<{ utilidad_pct: string }>(
        db,
        'select utilidad_pct from public.partida_utilidad where partida_id = $1',
        [op.partida],
      );
      expect(Number(u!.utilidad_pct)).toBe(20);
      const [r] = await filas<{ estado: string }>(db, 'select estado from public.revisiones where id = $1', [
        op.revision,
      ]);
      expect(r!.estado).toBe('pendiente_autorizacion');
    });
  });

  it('rechazar exige el motivo', async () => {
    const op = await pendiente();
    await expect(
      como(db, 'alejandro', () =>
        db.query(`update public.revisiones set estado = 'rechazada' where id = $1`, [op.revision]),
      ),
    ).rejects.toThrow(/motivo/);
    await como(db, 'alejandro', async () => {
      const r = await db.query(
        `update public.revisiones set estado = 'rechazada', comentario_autorizacion = 'Revisa el SSD' where id = $1`,
        [op.revision],
      );
      expect(r.affectedRows).toBe(1);
    });
  });
});

describe('tipo de cambio en la autorización (0020)', () => {
  /** Revisión pendiente con una partida en dólares (costo 100.00 USD, T.C. capturado 17.5). */
  async function enDolares() {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(
      `update public.partida_costos set moneda = 'USD', costo_unitario = 100, tipo_cambio = 17.5 where partida_id = $1`,
      [op.partida],
    );
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    return op;
  }

  it('exige el T.C. de cada moneda extranjera y calcula con el autorizado', async () => {
    const op = await enDolares();
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2)', [
          op.revision,
          lista(op.partida, '10', '1925.00'),
        ]),
      ),
    ).rejects.toThrow(/tipo de cambio de USD/);
    // 100 × 18.12345 × 1.10 = 1993.5795 → 1993.58 (con el T.C. capturado sería 1925.00 y no coincide).
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2, $3)', [
          op.revision,
          lista(op.partida, '10', '1925.00'),
          '{"USD": "18.12345"}',
        ]),
      ),
    ).rejects.toThrow(/no coinciden/);
    await como(db, 'alejandro', async () => {
      await db.query('select public.autorizar_revision($1, $2, $3)', [
        op.revision,
        lista(op.partida, '10', '1993.58'),
        '{"USD": "18.12345"}',
      ]);
      const [t] = await filas<{ tipo_cambio: string }>(
        db,
        'select tipo_cambio from public.revision_tipos_cambio where revision_id = $1',
        [op.revision],
      );
      expect(Number(t!.tipo_cambio)).toBe(18.12345);
    });
  });

  it('rechaza T.C. no válidos y el ejecutivo no puede fijarlo', async () => {
    const op = await enDolares();
    for (const tc of ['{"USD": "0"}', '{"USD": "18.123456"}', '{"MXN": "1"}', '{"USD": "abc"}']) {
      await expect(
        como(db, 'alejandro', () =>
          db.query('select public.guardar_utilidades($1, $2, $3)', [op.revision, '[]', tc]),
        ),
      ).rejects.toThrow();
    }
    await expect(
      como(db, 'jorge', () =>
        db.query(
          `insert into public.revision_tipos_cambio (revision_id, moneda, tipo_cambio) values ($1, 'USD', 18)`,
          [op.revision],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('el T.C. sólo se fija mientras espera autorización', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.guardar_utilidades($1, $2, $3)', [op.revision, '[]', '{"USD": "18"}']),
      ),
    ).rejects.toThrow(/espera autorización/);
  });
});

describe('esquema por cotización, anticipo y transaccionalidad (0024)', () => {
  const tipoDe = async (revision: string) =>
    (
      await filas<{ esquema: string }>(db, 'select esquema from public.revisiones where id = $1', [revision])
    )[0]?.esquema;

  it('la revisión toma el esquema de la oportunidad y se cambia sólo en borrador', async () => {
    const op = await crearOportunidad(db, 'jorge');
    expect(await tipoDe(op.revision)).toBe('arrendamiento');
    await db.query(`update public.revisiones set esquema = 'adquisicion' where id = $1`, [op.revision]);
    expect(await tipoDe(op.revision)).toBe('adquisicion');
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    await expect(
      db.query(`update public.revisiones set esquema = 'credito_simple' where id = $1`, [op.revision]),
    ).rejects.toThrow(/sólo en borrador/);
  });

  it('un arrendamiento no se envía sin mayorista de arrendamiento', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query('update public.revisiones set mayorista_arrendamiento_id = null where id = $1', [
      op.revision,
    ]);
    await expect(
      como(db, 'jorge', () =>
        db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
          op.revision,
        ]),
      ),
    ).rejects.toThrow(/mayorista/);
  });

  it('adquisición exige anticipo al autorizar', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.revisiones set esquema = 'adquisicion' where id = $1`, [op.revision]);
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2)', [op.revision, lista(op.partida)]),
      ),
    ).rejects.toThrow(/anticipo/);
    await como(db, 'alejandro', async () => {
      await db.query('select public.autorizar_revision($1, $2, datos => $3)', [
        op.revision,
        lista(op.partida),
        '{"anticipo_pct": "50"}',
      ]);
      const [r] = await filas<{ anticipo_pct: string }>(
        db,
        'select anticipo_pct::text from public.revisiones where id = $1',
        [op.revision],
      );
      expect(Number(r!.anticipo_pct)).toBe(50);
    });
  });

  it('la transaccionalidad se suma a la utilidad y sólo aplica en arrendamiento', async () => {
    const op = await crearOportunidad(db, 'jorge');
    const [m] = await filas<{ id: string }>(
      db,
      `insert into public.mayoristas (nombre) values ('Arrendamayorista') returning id`,
    );
    await db.query(`update public.revisiones set mayorista_arrendamiento_id = $2 where id = $1`, [
      op.revision,
      m!.id,
    ]);
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    // 14533.46 × (1 + (13.5 + 3) %) = 16931.4809 → 16931.48
    const conTransaccion = JSON.stringify([
      { partida_id: op.partida, utilidad_pct: '13.5', transaccion_pct: '3', precio_unitario: '16931.48' },
    ]);
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2, datos => $3)', [
          op.revision,
          conTransaccion,
          '{"transaccion_pct": "3"}',
        ]),
      ),
    ).rejects.toThrow(/todas las partidas/);
    await como(db, 'alejandro', async () => {
      await db.query('select public.autorizar_revision($1, $2, datos => $3)', [
        op.revision,
        conTransaccion,
        '{"transaccion_pct": "3", "transaccion_alcance": "diferentes"}',
      ]);
      const [u] = await filas<{ transaccion_pct: string }>(
        db,
        'select transaccion_pct::text from public.partida_utilidad where partida_id = $1',
        [op.partida],
      );
      expect(Number(u!.transaccion_pct)).toBe(3);
    });
  });

  it('el estado del cliente y el de entrega son de la lista de la República', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.oportunidades set estado_entrega = 'Hidalgo' where id = $1`, [
      op.oportunidad,
    ]);
    await expect(
      db.query(`update public.oportunidades set estado_entrega = 'Pachuca' where id = $1`, [op.oportunidad]),
    ).rejects.toThrow();
  });
});
