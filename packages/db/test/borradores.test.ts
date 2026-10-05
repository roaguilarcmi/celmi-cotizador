import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas } from './base.ts';

let db: PGlite;
let deJorge: Awaited<ReturnType<typeof crearOportunidad>>;
let deFabiola: Awaited<ReturnType<typeof crearOportunidad>>;

beforeAll(async () => {
  db = await crearBase();
  deJorge = await crearOportunidad(db, 'jorge');
  deFabiola = await crearOportunidad(db, 'fabiola');
}, 60_000);

const guardar = (oportunidad: string, titulo = 'Llamar') =>
  db.query(
    `insert into public.borradores (oportunidad_id, tipo, datos) values ($1, 'tarea', $2)
     on conflict (usuario_id, oportunidad_id, tipo) do update set datos = excluded.datos`,
    [oportunidad, JSON.stringify({ titulo })],
  );

describe('borradores (decisión 2026-10-05)', () => {
  it('cada quien guarda y actualiza su borrador; queda a su nombre', async () => {
    await como(db, 'jorge', async () => {
      await guardar(deJorge.oportunidad);
      await guardar(deJorge.oportunidad, 'Llamar a Héctor');
      const r = await filas<{ titulo: string }>(
        db,
        `select datos->>'titulo' as titulo from public.borradores`,
      );
      expect(r).toEqual([{ titulo: 'Llamar a Héctor' }]);
    });
  });

  it('nadie más ve los borradores ajenos, ni un administrador', async () => {
    await como(db, 'jorge', async () => {
      await guardar(deJorge.oportunidad);
      await db.exec(
        `set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2"}'`,
      );
      const r = await filas(db, 'select * from public.borradores');
      expect(r).toHaveLength(0);
    });
  });

  it('no se guardan borradores en oportunidades que no se ven', async () => {
    await expect(como(db, 'jorge', () => guardar(deFabiola.oportunidad))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('sin 2FA no hay borradores', async () => {
    await expect(como(db, 'jorge', () => guardar(deJorge.oportunidad), { aal: 'aal1' })).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe('borradores sin oportunidad (0012)', () => {
  it('desde «Mis tareas» hay un borrador por persona y tipo, aunque no tenga oportunidad', async () => {
    await como(db, 'jorge', async () => {
      const guardarLibre = (titulo: string) =>
        db.query(
          `insert into public.borradores (oportunidad_id, tipo, datos) values (null, 'tarea', $1)
           on conflict (usuario_id, oportunidad_id, tipo) do update set datos = excluded.datos`,
          [JSON.stringify({ titulo })],
        );
      await guardarLibre('Uno');
      await guardarLibre('Dos');
      const r = await filas<{ titulo: string }>(
        db,
        `select datos->>'titulo' as titulo from public.borradores where oportunidad_id is null`,
      );
      expect(r).toEqual([{ titulo: 'Dos' }]);
    });
  });
});
