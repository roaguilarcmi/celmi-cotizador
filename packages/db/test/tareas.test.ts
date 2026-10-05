import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS } from './base.ts';

let db: PGlite;
let deJorge: Awaited<ReturnType<typeof crearOportunidad>>;
let deFabiola: Awaited<ReturnType<typeof crearOportunidad>>;
let tareaDeJorge: string;

const mañana = () => new Date(Date.now() + 86_400_000).toISOString();

beforeAll(async () => {
  db = await crearBase();
  deJorge = await crearOportunidad(db, 'jorge');
  deFabiola = await crearOportunidad(db, 'fabiola');
  const [t] = await filas<{ id: string }>(
    db,
    `insert into public.tareas (oportunidad_id, responsable_id, titulo, vence_en) values ($1, $2, 'Llamar a Héctor', $3) returning id`,
    [deJorge.oportunidad, USUARIOS.jorge.id, mañana()],
  );
  tareaDeJorge = t!.id;
}, 60_000);

const crear = (oportunidad: string, responsable: string) =>
  db.query(
    `insert into public.tareas (oportunidad_id, responsable_id, titulo, vence_en, aviso_en) values ($1, $2, 'Enviar propuesta', $3, $3)`,
    [oportunidad, responsable, mañana()],
  );

describe('tareas personales (decisión 2026-10-05)', () => {
  it('cada quien crea tareas para sí mismo en oportunidades que ve', async () => {
    await como(db, 'jorge', async () =>
      expect((await crear(deJorge.oportunidad, USUARIOS.jorge.id)).affectedRows).toBe(1),
    );
  });

  it('nadie asigna tareas a otra persona', async () => {
    await expect(como(db, 'jorge', () => crear(deJorge.oportunidad, USUARIOS.fabiola.id))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('no se crean tareas en oportunidades que no se ven', async () => {
    await expect(como(db, 'jorge', () => crear(deFabiola.oportunidad, USUARIOS.jorge.id))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('son privadas: ni otro ejecutivo ni un administrador las ven', async () => {
    await como(db, 'jorge', async () => {
      const r = await filas(db, 'select id from public.tareas where id = $1', [tareaDeJorge]);
      expect(r).toHaveLength(1);
    });
    for (const u of ['fabiola', 'alejandro'] as const) {
      await como(db, u, async () => expect(await filas(db, 'select id from public.tareas')).toHaveLength(0));
    }
  });

  it('al completarla, la base registra la fecha; no cambia de responsable', async () => {
    await como(db, 'jorge', async () => {
      await db.query(`update public.tareas set estado = 'completada' where id = $1`, [tareaDeJorge]);
      const [t] = await filas<{ completada_en: Date | null }>(
        db,
        'select completada_en from public.tareas where id = $1',
        [tareaDeJorge],
      );
      expect(t!.completada_en).not.toBeNull();
    });
    await expect(
      como(db, 'jorge', () =>
        db.query('update public.tareas set responsable_id = $1 where id = $2', [
          USUARIOS.fabiola.id,
          tareaDeJorge,
        ]),
      ),
    ).rejects.toThrow(/row-level security|no cambia de responsable/);
  });

  it('no se borran, y el aviso no puede quedar después del vencimiento', async () => {
    await expect(como(db, 'jorge', () => db.query('delete from public.tareas'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      como(db, 'jorge', () =>
        db.query(
          `insert into public.tareas (oportunidad_id, responsable_id, titulo, vence_en, aviso_en) values ($1, $2, 'X tarea', now(), now() + interval '1 hour')`,
          [deJorge.oportunidad, USUARIOS.jorge.id],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
