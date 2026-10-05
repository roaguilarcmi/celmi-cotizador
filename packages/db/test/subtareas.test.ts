import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS } from './base.ts';

let db: PGlite;
let deJorge: Awaited<ReturnType<typeof crearOportunidad>>;
let principal: string;

const mañana = () => new Date(Date.now() + 86_400_000).toISOString();

beforeAll(async () => {
  db = await crearBase();
  deJorge = await crearOportunidad(db, 'jorge');
  const [t] = await filas<{ id: string }>(
    db,
    `insert into public.tareas (oportunidad_id, responsable_id, titulo, vence_en) values ($1, $2, 'Preparar propuesta', $3) returning id`,
    [deJorge.oportunidad, USUARIOS.jorge.id, mañana()],
  );
  principal = t!.id;
}, 60_000);

/** Inserta una subtarea sin indicar oportunidad: la hereda de la principal. */
const subtarea = (padre: string, titulo = 'Pedir precio a CVA', vence: string | null = null) =>
  filas<{ id: string; oportunidad_id: string }>(
    db,
    `insert into public.tareas (tarea_padre_id, titulo, vence_en) values ($1, $2, $3) returning id, oportunidad_id`,
    [padre, titulo, vence],
  );

describe('subtareas (decisión 2026-10-05)', () => {
  it('se crean sin fecha y heredan la oportunidad de la principal', async () => {
    await como(db, 'jorge', async () => {
      const [s] = await subtarea(principal);
      expect(s!.oportunidad_id).toBe(deJorge.oportunidad);
    });
  });

  it('una tarea puede no tener fecha ni oportunidad (0012), y sus subtareas tampoco', async () => {
    await como(db, 'jorge', async () => {
      const [libre] = await filas<{ id: string }>(
        db,
        `insert into public.tareas (titulo) values ('Revisar correo de mayoristas') returning id`,
      );
      const [s] = await subtarea(libre!.id);
      expect(s!.oportunidad_id).toBeNull();
    });
  });

  it('las etapas de trabajo se recorren y sólo «completada» marca la fecha de completado', async () => {
    await como(db, 'jorge', async () => {
      for (const estado of ['en_curso', 'en_espera', 'completada', 'pendiente']) {
        await db.query('update public.tareas set estado = $1 where id = $2', [estado, principal]);
        const [t] = await filas<{ completada: boolean }>(
          db,
          'select completada_en is not null as completada from public.tareas where id = $1',
          [principal],
        );
        expect(t!.completada).toBe(estado === 'completada');
      }
    });
  });

  it('sin hora: sólo avisos con días de anticipación', async () => {
    const conAviso = (minutos: number) =>
      como(db, 'jorge', async () => {
        const [t] = await filas<{ id: string }>(
          db,
          `insert into public.tareas (titulo, vence_en, sin_hora) values ('Entregar propuesta', $1, true) returning id`,
          [mañana()],
        );
        await db.query(
          'insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en) values ($1, $2, now())',
          [t!.id, minutos],
        );
      });
    await expect(conAviso(15)).rejects.toThrow(/días de anticipación/);
    await expect(conAviso(1440)).resolves.toBeUndefined();
  });

  it('nadie liga su tarea a una oportunidad que no ve', async () => {
    const deFabiola = await crearOportunidad(db, 'fabiola');
    await expect(
      como(db, 'jorge', () =>
        db.query(`insert into public.tareas (oportunidad_id, titulo) values ($1, 'Espiar')`, [
          deFabiola.oportunidad,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('un solo nivel: una subtarea no tiene subtareas', async () => {
    await expect(
      como(db, 'jorge', async () => {
        const [s] = await subtarea(principal);
        await subtarea(s!.id);
      }),
    ).rejects.toThrow(/no puede tener subtareas/);
  });

  it('nadie agrega subtareas a tareas ajenas', async () => {
    await expect(como(db, 'fabiola', () => subtarea(principal))).rejects.toThrow(/no existe/);
  });

  it('una subtarea no se mueve a otra tarea principal', async () => {
    await expect(
      como(db, 'jorge', async () => {
        const [otra] = await filas<{ id: string }>(
          db,
          `insert into public.tareas (oportunidad_id, titulo, vence_en) values ($1, 'Otra', $2) returning id`,
          [deJorge.oportunidad, mañana()],
        );
        const [s] = await subtarea(principal);
        await db.query('update public.tareas set tarea_padre_id = $1 where id = $2', [otra!.id, s!.id]);
      }),
    ).rejects.toThrow(/no cambia de tarea principal/);
  });

  it('sin fecha no hay avisos; al quitar la fecha se quitan los avisos', async () => {
    await expect(
      como(db, 'jorge', async () => {
        const [s] = await subtarea(principal);
        await db.query(
          'insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en) values ($1, 15, now())',
          [s!.id],
        );
      }),
    ).rejects.toThrow(/necesita fecha/);

    await como(db, 'jorge', async () => {
      const [s] = await subtarea(principal, 'Con fecha', mañana());
      await db.query(
        'insert into public.tarea_avisos (tarea_id, minutos_antes, aviso_en) values ($1, 15, now())',
        [s!.id],
      );
      await db.query('update public.tareas set vence_en = null where id = $1', [s!.id]);
      const avisos = await filas(db, 'select * from public.tarea_avisos where tarea_id = $1', [s!.id]);
      expect(avisos).toHaveLength(0);
    });
  });
});
