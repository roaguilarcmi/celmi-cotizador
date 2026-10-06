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
      await db.query('select public.autorizar_revision($1, $2, $3)', [
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
