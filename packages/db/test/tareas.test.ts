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
    `insert into public.tareas (oportunidad_id, responsable_id, titulo, vence_en) values ($1, $2, 'Enviar propuesta', $3)`,
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

  it('no se borran', async () => {
    await expect(como(db, 'jorge', () => db.query('delete from public.tareas'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('varios avisos por tarea (decisión 2026-10-05)', () => {
  const avisos = () =>
    filas<{ minutos_antes: number; aviso_en: Date }>(
      db,
      'select minutos_antes, aviso_en from public.tarea_avisos where tarea_id = $1 order by minutos_antes',
      [tareaDeJorge],
    );

  it('la hora de cada aviso la calcula la base a partir del vencimiento', async () => {
    await como(db, 'jorge', async () => {
      // Aunque se intente mandar otra hora, la base la recalcula.
      await db.query(
        `insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en) values ($1, 15, '2000-01-01'), ($1, 1440, '2000-01-01')`,
        [tareaDeJorge],
      );
      const [t] = await filas<{ vence_en: Date }>(db, 'select vence_en from public.tareas where id = $1', [
        tareaDeJorge,
      ]);
      const a = await avisos();
      expect(a.map((x) => x.minutos_antes)).toEqual([15, 1440]);
      expect(t!.vence_en.getTime() - a[0]!.aviso_en.getTime()).toBe(15 * 60_000);
      expect(t!.vence_en.getTime() - a[1]!.aviso_en.getTime()).toBe(1440 * 60_000);
    });
  });

  it('al reprogramar la tarea, los avisos se mueven con ella', async () => {
    await db.query(
      `insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en) values ($1, 60, now())`,
      [tareaDeJorge],
    );
    await como(db, 'jorge', async () => {
      await db.query(`update public.tareas set vence_en = vence_en + interval '2 days' where id = $1`, [
        tareaDeJorge,
      ]);
      const [t] = await filas<{ vence_en: Date }>(db, 'select vence_en from public.tareas where id = $1', [
        tareaDeJorge,
      ]);
      const [a] = await avisos();
      expect(t!.vence_en.getTime() - a!.aviso_en.getTime()).toBe(60 * 60_000);
    });
  });

  it('nadie más ve ni agrega avisos a tareas ajenas', async () => {
    await como(db, 'fabiola', async () =>
      expect(await filas(db, 'select id from public.tarea_avisos')).toHaveLength(0),
    );
    await expect(
      como(db, 'fabiola', () =>
        db.query(
          `insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en) values ($1, 5, now())`,
          [tareaDeJorge],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('no se admiten anticipaciones negativas ni repetidas', async () => {
    await expect(
      como(db, 'jorge', () =>
        db.query(
          `insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en) values ($1, -5, now())`,
          [tareaDeJorge],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
