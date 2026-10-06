import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas } from './base.ts';

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

/** Cotización con la revisión original autorizada y financiamiento capturado (superusuario, flujo real). */
async function autorizadaConFinanciamiento() {
  const op = await crearOportunidad(db, 'jorge');
  await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
    op.revision,
  ]);
  await db.query(`insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48)`, [
    op.partida,
  ]);
  await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [op.revision]);
  await db.query(
    `insert into public.propuesta_financiamientos (propuesta_id, esquema_id, plazo_meses, mensualidad)
     values ($1, 'arrendamiento_fpo', 36, 1234.56)`,
    [op.propuesta],
  );
  return op;
}

/** Crea la Rev nueva fuera de `como` (para que persista) y devuelve su id. */
async function nuevaRev(cotizacion: string, motivo: 'solicitud_cliente' | 'mejora_precio') {
  const [r] = await filas<{ id: string }>(db, `select public.crear_revision($1, $2) as id`, [
    cotizacion,
    motivo,
  ]);
  return r!.id;
}

describe('revisiones (0021)', () => {
  it('la Rev nueva recuerda de qué propuesta y partida viene', async () => {
    const op = await autorizadaConFinanciamiento();
    const rev = await nuevaRev(op.cotizacion, 'mejora_precio');
    const [pa] = await filas<{
      partida_origen_id: string;
      propuesta_origen_id: string;
      costo_anterior: string;
    }>(
      db,
      `select pa.partida_origen_id, pr.propuesta_origen_id, c.costo_anterior::text
       from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
       join public.partida_costos c on c.partida_id = pa.id where pr.revision_id = $1`,
      [rev],
    );
    expect(pa).toMatchObject({ partida_origen_id: op.partida, propuesta_origen_id: op.propuesta });
    expect(Number(pa!.costo_anterior)).toBe(14533.46);
  });

  it('el origen no se puede cambiar', async () => {
    const op = await autorizadaConFinanciamiento();
    const rev = await nuevaRev(op.cotizacion, 'solicitud_cliente');
    await expect(
      como(db, 'jorge', () =>
        db.query(
          `update public.partidas set partida_origen_id = null
           where propuesta_id in (select id from public.propuestas where revision_id = $1)`,
          [rev],
        ),
      ),
    ).rejects.toThrow(/origen/);
  });

  it('al autorizar la Rev nueva se copia el financiamiento de la anterior', async () => {
    const op = await autorizadaConFinanciamiento();
    const rev = await nuevaRev(op.cotizacion, 'solicitud_cliente');
    const [pa] = await filas<{ id: string }>(
      db,
      `select pa.id from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
       where pr.revision_id = $1`,
      [rev],
    );
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [rev]);
    await db.query(`insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48)`, [
      pa!.id,
    ]);
    const sinCopia = await filas(
      db,
      `select 1 from public.propuesta_financiamientos f join public.propuestas p on p.id = f.propuesta_id
       where p.revision_id = $1`,
      [rev],
    );
    expect(sinCopia).toHaveLength(0);
    await como(db, 'alejandro', () =>
      db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [rev]).then(async () => {
        const f = await filas<{ plazo_meses: number; mensualidad: string }>(
          db,
          `select f.plazo_meses, f.mensualidad::text from public.propuesta_financiamientos f
           join public.propuestas p on p.id = f.propuesta_id where p.revision_id = $1`,
          [rev],
        );
        expect(f).toEqual([{ plazo_meses: 36, mensualidad: '1234.56' }]);
      }),
    );
  });

  it('una Rev que nunca se autorizó se puede descartar; la original y las autorizadas, no', async () => {
    const op = await autorizadaConFinanciamiento();
    // La original (autorizada) no se descarta.
    await como(db, 'jorge', async () => {
      const r = await db.query('delete from public.revisiones where id = $1', [op.revision]);
      expect(r.affectedRows).toBe(0);
    });
    const rev = await nuevaRev(op.cotizacion, 'solicitud_cliente');
    // Otro ejecutivo no puede.
    await como(db, 'fabiola', async () => {
      const r = await db.query('delete from public.revisiones where id = $1', [rev]);
      expect(r.affectedRows).toBe(0);
    });
    await como(db, 'jorge', async () => {
      const r = await db.query('delete from public.revisiones where id = $1', [rev]);
      expect(r.affectedRows).toBe(1);
      const quedan = await filas(db, 'select 1 from public.revisiones where cotizacion_id = $1', [
        op.cotizacion,
      ]);
      expect(quedan).toHaveLength(1);
    });
  });

  it('una Rev autorizada ya no se descarta', async () => {
    const op = await autorizadaConFinanciamiento();
    const rev = await nuevaRev(op.cotizacion, 'solicitud_cliente');
    const [pa] = await filas<{ id: string }>(
      db,
      `select pa.id from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
       where pr.revision_id = $1`,
      [rev],
    );
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [rev]);
    await db.query(`insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48)`, [
      pa!.id,
    ]);
    await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [rev]);
    await como(db, 'jorge', async () => {
      const r = await db.query('delete from public.revisiones where id = $1', [rev]);
      expect(r.affectedRows).toBe(0);
    });
  });
});
