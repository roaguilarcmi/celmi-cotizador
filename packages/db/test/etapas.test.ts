import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, filas, USUARIOS } from './base.ts';

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

type Etapa = { id: string; nombre: string; es_final: boolean };
const misEtapas = () => filas<Etapa>(db, 'select id, nombre, es_final from public.mis_etapas_tarea()');
const nuevaTarea = async (titulo = 'Llamar a Héctor') =>
  (
    await filas<{ id: string; etapa_id: string }>(
      db,
      `insert into public.tareas (titulo) values ($1) returning id, etapa_id`,
      [titulo],
    )
  )[0]!;
const tarea = (id: string) =>
  filas<{ etapa_id: string; estado: string; completada: boolean }>(
    db,
    'select etapa_id, estado::text, completada_en is not null as completada from public.tareas where id = $1',
    [id],
  ).then((r) => r[0]!);

describe('etapas personalizables (decisión 2026-10-05)', () => {
  it('cada quien recibe sus etapas por omisión; una sola final', async () => {
    await como(db, 'jorge', async () => {
      const etapas = await misEtapas();
      expect(etapas.map((e) => e.nombre)).toEqual(['Por hacer', 'En curso', 'En espera', 'Completada']);
      expect(etapas.filter((e) => e.es_final)).toHaveLength(1);
    });
  });

  it('una tarea nueva entra en la primera etapa; moverla a la final la completa y regresarla la reabre', async () => {
    await como(db, 'jorge', async () => {
      const [porHacer, enCurso, , completada] = await misEtapas();
      const t = await nuevaTarea();
      expect(t.etapa_id).toBe(porHacer!.id);

      await db.query('update public.tareas set etapa_id = $1 where id = $2', [enCurso!.id, t.id]);
      expect(await tarea(t.id)).toMatchObject({ estado: 'pendiente', completada: false });

      await db.query('update public.tareas set etapa_id = $1 where id = $2', [completada!.id, t.id]);
      expect(await tarea(t.id)).toMatchObject({ estado: 'completada', completada: true });

      await db.query(`update public.tareas set estado = 'pendiente' where id = $1`, [t.id]);
      expect(await tarea(t.id)).toMatchObject({
        etapa_id: porHacer!.id,
        estado: 'pendiente',
        completada: false,
      });

      await db.query(`update public.tareas set estado = 'completada' where id = $1`, [t.id]);
      expect((await tarea(t.id)).etapa_id).toBe(completada!.id);
    });
  });

  it('las etapas son personales: nadie usa ni ve las de otro', async () => {
    const etapaDeJorge = await como(db, 'jorge', async () => (await misEtapas())[1]!.id);
    await como(db, 'fabiola', async () => {
      expect(await filas(db, 'select * from public.etapas_tarea where id = $1', [etapaDeJorge])).toHaveLength(
        0,
      );
    });
    await expect(
      como(db, 'fabiola', async () => {
        const t = await nuevaTarea();
        await db.query('update public.tareas set etapa_id = $1 where id = $2', [etapaDeJorge, t.id]);
      }),
    ).rejects.toThrow(/no es tuya/);
    // Nadie crea etapas a nombre de otra persona: la función no hace nada.
    await como(db, 'fabiola', async () => {
      await db.query('select app.crear_etapas_por_omision($1)', [USUARIOS.jorge.id]);
      await db.exec('reset role');
      const r = await filas(db, 'select 1 from public.etapas_tarea where usuario_id = $1', [
        USUARIOS.jorge.id,
      ]);
      expect(r).toHaveLength(0);
    });
  });

  it('se renombran y reordenan; la final no se quita ni cambia; queda al menos una abierta', async () => {
    await como(db, 'jorge', async () => {
      const etapas = await misEtapas();
      await db.query(`update public.etapas_tarea set nombre = 'Listo', color = 'info' where id = $1`, [
        etapas[3]!.id,
      ]);
      expect((await misEtapas())[3]!.nombre).toBe('Listo');
    });
    await expect(
      como(
        db,
        'jorge',
        async () => (await misEtapas(), db.query('delete from public.etapas_tarea where es_final')),
      ),
    ).rejects.toThrow(/final no se puede quitar/);
    await expect(
      como(
        db,
        'jorge',
        async () => (
          await misEtapas(),
          db.query('update public.etapas_tarea set es_final = true where not es_final')
        ),
      ),
    ).rejects.toThrow();
    await expect(
      como(
        db,
        'jorge',
        async () => (await misEtapas(), db.query('delete from public.etapas_tarea where not es_final')),
      ),
    ).rejects.toThrow(/al menos una etapa abierta/);
  });

  it('al quitar una etapa, sus tareas pasan a la primera abierta', async () => {
    await como(db, 'jorge', async () => {
      const [porHacer, enCurso] = await misEtapas();
      const t = await nuevaTarea('Revisar contrato');
      await db.query('update public.tareas set etapa_id = $1 where id = $2', [enCurso!.id, t.id]);
      await db.query('delete from public.etapas_tarea where id = $1', [enCurso!.id]);
      expect((await tarea(t.id)).etapa_id).toBe(porHacer!.id);
    });
  });
});

describe('subtareas ordenables', () => {
  it('se agregan al final y se reordenan', async () => {
    await como(db, 'jorge', async () => {
      const padre = await nuevaTarea('Preparar propuesta');
      for (const t of ['A', 'B', 'C'])
        await db.query('insert into public.tareas (tarea_padre_id, titulo) values ($1, $2)', [
          padre.id,
          `Sub ${t}`,
        ]);
      const orden = () =>
        filas<{ titulo: string }>(
          db,
          'select titulo from public.tareas where tarea_padre_id = $1 order by orden',
          [padre.id],
        ).then((r) => r.map((x) => x.titulo));
      expect(await orden()).toEqual(['Sub A', 'Sub B', 'Sub C']);
      await db.query(
        `update public.tareas set orden = case titulo when 'Sub C' then 0 when 'Sub A' then 1 else 2 end
                      where tarea_padre_id = $1`,
        [padre.id],
      );
      expect(await orden()).toEqual(['Sub C', 'Sub A', 'Sub B']);
    });
  });
});
