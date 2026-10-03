import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS } from './base.ts';

let db: PGlite;
let op: Awaited<ReturnType<typeof crearOportunidad>>;

beforeAll(async () => {
  db = await crearBase();
  op = await crearOportunidad(db, 'jorge');
  await db.query('insert into public.oportunidad_colaboradores values ($1, $2)', [
    op.oportunidad,
    USUARIOS.jhovanny.id,
  ]);
}, 60_000);

const cambiarEstado = (estado: string) =>
  db.query('update public.oportunidades set estado_id = $1 where id = $2', [estado, op.oportunidad]);

describe('cambio de estado (decisión 2026-10-03)', () => {
  it('el ejecutivo de la oportunidad lo cambia y queda en la bitácora a su nombre', async () => {
    await como(db, 'jorge', async () => {
      await cambiarEstado('en_preparacion');
      const [s] = await filas<{ autor_id: string; estado_anterior: string; estado_nuevo: string }>(
        db,
        `select autor_id, estado_anterior, estado_nuevo from public.seguimiento
         where oportunidad_id = $1 and tipo = 'cambio_estado'`,
        [op.oportunidad],
      );
      expect(s).toEqual({
        autor_id: USUARIOS.jorge.id,
        estado_anterior: 'nueva',
        estado_nuevo: 'en_preparacion',
      });
    });
  });

  it('un administrador también lo cambia', async () => {
    await como(db, 'alejandro', async () => {
      const r = await cambiarEstado('en_negociacion');
      expect(r.affectedRows).toBe(1);
    });
  });

  it('un colaborador (Cotizador) no puede cambiar el estado', async () => {
    await como(db, 'jhovanny', async () => {
      await expect(cambiarEstado('ganada')).rejects.toThrow(/ejecutivo de la oportunidad o un administrador/);
    });
  });

  it('otro ejecutivo ni siquiera ve la oportunidad', async () => {
    await como(db, 'fabiola', async () => {
      const r = await cambiarEstado('perdida');
      expect(r.affectedRows).toBe(0);
    });
  });
});

describe('reasignación', () => {
  it('sólo un administrador reasigna una oportunidad a otro ejecutivo', async () => {
    const reasignar = () =>
      db.query('update public.oportunidades set ejecutivo_id = $1 where id = $2', [
        USUARIOS.fabiola.id,
        op.oportunidad,
      ]);
    await como(db, 'jorge', async () => {
      await expect(reasignar()).rejects.toThrow(/Sólo un administrador reasigna/);
    });
    await como(db, 'rodrigo', async () => expect((await reasignar()).affectedRows).toBe(1));
  });
});

describe('notas de seguimiento', () => {
  it('quien participa agrega notas a su nombre; no puede firmar por otro ni fingir cambios de estado', async () => {
    await como(db, 'jhovanny', async () => {
      const r = await db.query(
        `insert into public.seguimiento (oportunidad_id, autor_id, tipo, texto) values ($1, $2, 'llamada', 'Confirmó 2 equipos')`,
        [op.oportunidad, USUARIOS.jhovanny.id],
      );
      expect(r.affectedRows).toBe(1);
    });
    // Cada intento prohibido en su propia sesión: un rechazo aborta la transacción.
    await expect(
      como(db, 'jhovanny', () =>
        db.query(
          `insert into public.seguimiento (oportunidad_id, autor_id, tipo, texto) values ($1, $2, 'nota', 'x')`,
          [op.oportunidad, USUARIOS.jorge.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      como(db, 'jhovanny', () =>
        db.query(
          `insert into public.seguimiento (oportunidad_id, autor_id, tipo) values ($1, $2, 'cambio_estado')`,
          [op.oportunidad, USUARIOS.jhovanny.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('la bitácora no se edita ni se borra', async () => {
    await expect(
      como(db, 'alejandro', () => db.query(`update public.seguimiento set texto = 'cambiado'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(como(db, 'alejandro', () => db.query('delete from public.seguimiento'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('una nota actualiza la última actividad sin ensuciar la auditoría', async () => {
    const antes = await filas<{ n: number }>(
      db,
      `select count(*)::int as n from public.auditoria where tabla = 'oportunidades' and registro_id = $1`,
      [op.oportunidad],
    );
    await como(db, 'jorge', async () => {
      await db.query(
        `insert into public.seguimiento (oportunidad_id, autor_id, tipo, texto) values ($1, $2, 'nota', 'Pidió descuento')`,
        [op.oportunidad, USUARIOS.jorge.id],
      );
      await db.exec('reset role');
      const despues = await filas<{ n: number }>(
        db,
        `select count(*)::int as n from public.auditoria where tabla = 'oportunidades' and registro_id = $1`,
        [op.oportunidad],
      );
      expect(despues[0]!.n).toBe(antes[0]!.n);
    });
  });
});

describe('clientes', () => {
  it('los ejecutivos ahora pueden editar clientes', async () => {
    await como(db, 'jorge', async () => {
      const r = await db.query(`update public.clientes set ciudad = 'Iztapalapa, CDMX' where id = $1`, [
        op.cliente,
      ]);
      expect(r.affectedRows).toBe(1);
    });
  });
});
