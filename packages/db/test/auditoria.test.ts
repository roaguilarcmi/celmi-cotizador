import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS } from './base.ts';

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

type Fila = {
  id: number;
  en: string;
  tabla: string;
  accion: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  cotizacion_id: string | null;
  oportunidad_id: string | null;
  cliente_id: string | null;
  cliente: string | null;
  revision_numero: number | null;
  etiqueta: string | null;
};

const eventos = (filtros: object = {}, limite = 200) =>
  filas<Fila>(db, 'select * from public.auditoria_eventos($1, $2)', [JSON.stringify(filtros), limite]);

describe('consulta de la auditoría (0034)', () => {
  it('sólo con auditoria.ver; cada fila trae su contexto (cotización, oportunidad, cliente)', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await como(db, 'alejandro', async () => {
      const r = await eventos({ cotizacion: op.cotizacion });
      const costo = r.find((x) => x.tabla === 'partida_costos');
      expect(costo).toMatchObject({
        cotizacion_id: op.cotizacion,
        oportunidad_id: op.oportunidad,
        cliente_id: op.cliente,
        cliente: 'EPOXEMEX S.A. de C.V.',
        revision_numero: 0,
        etiqueta: 'Partida 1 · 2GHTM',
      });
      // Sólo cambios de esa cotización.
      expect(r.every((x) => x.cotizacion_id === op.cotizacion)).toBe(true);
    });
    await como(db, 'jorge', async () => {
      await expect(eventos()).rejects.toThrow(/permiso para consultar la auditoría/);
    });
  });

  it('agrupa por acción (misma transacción) y el límite cuenta acciones', async () => {
    const op = await crearOportunidad(db, 'jorge');
    // Una sola transacción que toca la partida y su costo: es una acción.
    await db.exec('begin');
    await db.query('update public.partidas set cantidad = 3 where id = $1', [op.partida]);
    await db.query('update public.partida_costos set costo_unitario = 14000 where partida_id = $1', [
      op.partida,
    ]);
    await db.exec('commit');
    await como(db, 'alejandro', async () => {
      const r = await eventos({ cotizacion: op.cotizacion }, 1);
      expect(new Set(r.map((x) => String(x.en))).size).toBe(1);
      expect(r.map((x) => x.tabla).sort()).toEqual(['partida_costos', 'partidas']);
    });
  });

  it('las tareas personales nunca aparecen', async () => {
    await db.query(
      `insert into public.tareas (responsable_id, titulo) values ($1, 'Llamar al cliente (privada)')`,
      [USUARIOS.jorge.id],
    );
    await como(db, 'alejandro', async () => {
      const r = await eventos({ texto: 'privada' });
      expect(r).toHaveLength(0);
    });
  });

  it('una partida borrada conserva su contexto (por la propia auditoría)', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query('delete from public.partidas where id = $1', [op.partida]);
    await como(db, 'alejandro', async () => {
      const r = await eventos({ cotizacion: op.cotizacion });
      const borrada = r.find((x) => x.tabla === 'partidas' && x.accion === 'DELETE');
      expect(borrada?.cotizacion_id).toBe(op.cotizacion);
    });
  });

  it('expedientes: cotizaciones, oportunidades, clientes y usuarios', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.perfiles set puesto = 'Ejecutivo de cuenta' where id = $1`, [
      USUARIOS.jorge.id,
    ]);
    await como(db, 'rodrigo', async () => {
      const r = await filas<{ tipo: string; id: string; eventos: number }>(
        db,
        'select * from public.auditoria_expedientes(null)',
      );
      expect(r.find((x) => x.tipo === 'cotizacion' && x.id === op.cotizacion)?.eventos).toBeGreaterThan(0);
      expect(r.find((x) => x.tipo === 'oportunidad' && x.id === op.oportunidad)).toBeTruthy();
      expect(r.find((x) => x.tipo === 'cliente' && x.id === op.cliente)).toBeTruthy();
      expect(r.find((x) => x.tipo === 'usuario' && x.id === USUARIOS.jorge.id)).toBeTruthy();
      // «Sólo lo sensible»: el cambio al perfil sí; los de partidas no.
      const sensibles = await filas<{ tabla: string; sensible: boolean }>(
        db,
        'select tabla, sensible from public.auditoria_eventos($1, 200)',
        [JSON.stringify({ sensible: true })],
      );
      expect(sensibles.some((x) => x.tabla === 'perfiles' && x.sensible)).toBe(true);
      expect(sensibles.some((x) => x.tabla === 'partidas')).toBe(false);
    });
    await como(db, 'jhovanny', async () => {
      await expect(filas(db, 'select * from public.auditoria_expedientes(null)')).rejects.toThrow(/permiso/);
    });
  });
});

describe('historial de la cotización (0034)', () => {
  const historial = (cotizacion: string) =>
    filas<Fila>(db, 'select * from public.historial_cotizacion($1)', [cotizacion]);

  it('quien tiene acceso lo ve sin utilidad ni transaccionalidad; quien autoriza, completo', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    // La transaccionalidad la fija quien autoriza (se confirma para que quede en la auditoría).
    await db.exec('begin');
    await db.exec(
      `set local role authenticated; set local request.jwt.claims = '${JSON.stringify({ sub: USUARIOS.alejandro.id, aal: 'aal2' })}';`,
    );
    await db.query(`update public.revisiones set transaccion_pct = 3 where id = $1`, [op.revision]);
    await db.exec('commit');
    await db.query(`update public.revisiones set estado = 'borrador' where id = $1`, [op.revision]);

    await como(db, 'jorge', async () => {
      const r = await historial(op.cotizacion);
      expect(r.length).toBeGreaterThan(0);
      expect(r.some((x) => x.tabla === 'partida_utilidad')).toBe(false);
      expect(r.some((x) => x.tabla === 'partida_costos')).toBe(true);
      for (const x of r) {
        expect(x.despues ?? {}).not.toHaveProperty('transaccion_pct');
        expect(x.antes ?? {}).not.toHaveProperty('transaccion_pct');
      }
      // El cambio que sólo tocaba la transaccionalidad desaparece.
      expect(
        r
          .filter((x) => x.tabla === 'revisiones' && x.accion === 'UPDATE')
          .every((x) => {
            return JSON.stringify(x.antes) !== JSON.stringify(x.despues);
          }),
      ).toBe(true);
    });

    await como(db, 'alejandro', async () => {
      const r = await historial(op.cotizacion);
      expect(r.some((x) => x.tabla === 'partida_utilidad')).toBe(true);
      expect(
        r.some((x) => x.despues && 'transaccion_pct' in x.despues && x.despues.transaccion_pct === 3),
      ).toBe(true);
    });

    // Otro ejecutivo sin acceso a la oportunidad.
    await como(db, 'fabiola', async () => {
      await expect(historial(op.cotizacion)).rejects.toThrow(/acceso a esta cotización/);
    });
  });

  it('nadie escribe ni borra la auditoría', async () => {
    await expect(db.query('delete from public.auditoria')).rejects.toThrow(/no se puede modificar/);
  });
});
