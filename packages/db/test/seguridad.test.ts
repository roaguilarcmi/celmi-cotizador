import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { aplicarMigraciones, leerMigraciones } from '../src/migraciones.ts';
import { como, crearBase, crearOportunidad, ejecutor, filas, USUARIOS } from './base.ts';

let db: PGlite;
let deJorge: Awaited<ReturnType<typeof crearOportunidad>>;
let deFabiola: Awaited<ReturnType<typeof crearOportunidad>>;

const contar = async (tabla: string) =>
  Number((await filas<{ n: number }>(db, `select count(*)::int as n from public.${tabla}`))[0]!.n);

beforeAll(async () => {
  db = await crearBase();
  deJorge = await crearOportunidad(db, 'jorge');
  deFabiola = await crearOportunidad(db, 'fabiola');
}, 60_000);

describe('migraciones', () => {
  it('se aplican una sola vez', async () => {
    expect(await aplicarMigraciones(ejecutor(db))).toEqual([]);
  });

  it('se detienen si alguien modifica una migración ya aplicada', async () => {
    const [primera, ...resto] = leerMigraciones();
    const alterada = { ...primera!, huella: 'otra' };
    await expect(aplicarMigraciones(ejecutor(db), [alterada, ...resto])).rejects.toThrow(/fue modificada/);
  });

  it('todas las tablas públicas tienen reglas de acceso por fila (RLS)', async () => {
    const sinRls = await filas(
      db,
      `select tablename from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    expect(sinRls).toEqual([]);
  });
});

describe('acceso: 2FA obligatoria y usuarios activos', () => {
  it('sin segundo factor (aal1) no se ve nada, ni catálogos', async () => {
    await como(
      db,
      'jorge',
      async () => {
        expect(await contar('monedas')).toBe(0);
        expect(await contar('oportunidades')).toBe(0);
      },
      { aal: 'aal1' },
    );
  });

  it('con segundo factor (aal2) sí ve catálogos', async () => {
    await como(db, 'jorge', async () => expect(await contar('monedas')).toBe(2));
  });

  it('un usuario desactivado no ve nada aunque tenga 2FA', async () => {
    await como(db, 'exempleado', async () => expect(await contar('monedas')).toBe(0));
  });

  it('sin sesión (anon) se rechaza el acceso a las tablas', async () => {
    await expect(como(db, null, () => contar('monedas'), { rol: 'anon' })).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('oportunidades: cada ejecutivo ve sólo las suyas', () => {
  it('Jorge ve la suya y no la de Fabiola', async () => {
    await como(db, 'jorge', async () => {
      const ids = (await filas<{ id: string }>(db, 'select id from public.oportunidades')).map((r) => r.id);
      expect(ids).toEqual([deJorge.oportunidad]);
    });
  });

  it('Alejandro y Rodrigo (administradores) ven todas', async () => {
    for (const u of ['alejandro', 'rodrigo'] as const) {
      await como(db, u, async () => expect(await contar('oportunidades')).toBe(2));
    }
  });

  it('el Cotizador sólo ve las oportunidades donde colabora', async () => {
    await como(db, 'jhovanny', async () => expect(await contar('oportunidades')).toBe(0));
    await db.query('insert into public.oportunidad_colaboradores values ($1, $2)', [
      deFabiola.oportunidad,
      USUARIOS.jhovanny.id,
    ]);
    await como(db, 'jhovanny', async () => {
      expect(await contar('oportunidades')).toBe(1);
      expect(await contar('partidas')).toBe(1);
    });
  });

  it('un ejecutivo no puede crear oportunidades a nombre de otro', async () => {
    await como(db, 'jorge', async () => {
      await db.query(
        `insert into public.oportunidades (cliente_id, nombre, ejecutivo_id) values ($1, 'Propia', $2)`,
        [deJorge.cliente, USUARIOS.jorge.id],
      );
      await expect(
        db.query(
          `insert into public.oportunidades (cliente_id, nombre, ejecutivo_id) values ($1, 'Ajena', $2)`,
          [deJorge.cliente, USUARIOS.fabiola.id],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe('información interna: costos y utilidad', () => {
  it('el ejecutivo ve costos y precio de venta de sus partidas, pero no la utilidad', async () => {
    await como(db, 'jorge', async () => {
      expect(await contar('partida_costos')).toBe(1);
      expect(await contar('partida_precios')).toBe(1);
      expect(await contar('partida_utilidad')).toBe(0);
    });
  });

  it('el administrador ve la utilidad de todas las partidas', async () => {
    await como(db, 'alejandro', async () => expect(await contar('partida_utilidad')).toBe(2));
  });

  it('el ejecutivo no puede registrar precios ni utilidad', async () => {
    await como(db, 'jorge', async () => {
      const r = await db.query(
        'update public.partida_precios set precio_unitario = 1 where partida_id = $1',
        [deJorge.partida],
      );
      expect(r.affectedRows).toBe(0);
    });
  });
});

describe('autorización y bloqueo de partidas', () => {
  it('el ejecutivo no puede autorizar su propia revisión', async () => {
    await como(db, 'jorge', async () => {
      await expect(
        db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [deJorge.revision]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('una vez autorizada, el ejecutivo ya no modifica partidas ni costos; el autorizador sí', async () => {
    await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [deJorge.revision]);
    await como(db, 'jorge', async () => {
      const p = await db.query('update public.partidas set cantidad = 5 where id = $1', [deJorge.partida]);
      const c = await db.query('update public.partida_costos set costo_unitario = 1 where partida_id = $1', [
        deJorge.partida,
      ]);
      expect([p.affectedRows, c.affectedRows]).toEqual([0, 0]);
    });
    await como(db, 'alejandro', async () => {
      const p = await db.query('update public.partidas set cantidad = 5 where id = $1', [deJorge.partida]);
      expect(p.affectedRows).toBe(1);
    });
  });
});

describe('auditoría', () => {
  it('registra quién hizo cada cambio, con valor anterior y nuevo', async () => {
    await como(db, 'fabiola', async () => {
      await db.query(`update public.oportunidades set nombre = 'Laptops Dell (2 equipos)' where id = $1`, [
        deFabiola.oportunidad,
      ]);
      await db.exec('reset role');
      const [a] = await filas<{
        usuario_id: string;
        accion: string;
        antes: { nombre: string };
        despues: { nombre: string };
      }>(
        db,
        `select usuario_id, accion, antes, despues from public.auditoria
         where tabla = 'oportunidades' and registro_id = $1 order by id desc limit 1`,
        [deFabiola.oportunidad],
      );
      expect(a).toMatchObject({ usuario_id: USUARIOS.fabiola.id, accion: 'UPDATE' });
      expect(a!.antes.nombre).toBe('Laptops Dell');
      expect(a!.despues.nombre).toBe('Laptops Dell (2 equipos)');
    });
  });

  it('sólo quien tiene permiso la consulta', async () => {
    await como(db, 'jorge', async () => expect(await contar('auditoria')).toBe(0));
    await como(db, 'alejandro', async () => expect(await contar('auditoria')).toBeGreaterThan(0));
  });

  it('nadie puede modificarla ni borrarla, ni siquiera con privilegios elevados', async () => {
    await expect(db.query('update public.auditoria set accion = accion')).rejects.toThrow(
      /no se puede modificar/,
    );
    await expect(db.query('delete from public.auditoria')).rejects.toThrow(/no se puede modificar/);
    await expect(como(db, 'alejandro', () => db.query('delete from public.auditoria'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('folio', () => {
  it('es consecutivo dentro del año y se reinicia al cambiar de año', async () => {
    const folios = [];
    for (const anio of [2026, 2026, 2027]) {
      const [c] = await filas<{ id: string }>(
        db,
        'insert into public.cotizaciones (oportunidad_id) values ($1) returning id',
        [deJorge.oportunidad],
      );
      const [f] = await filas<{ folio: string }>(db, 'select app.asignar_folio_en($1, $2) as folio', [
        c!.id,
        anio,
      ]);
      folios.push(f!.folio);
    }
    expect(folios).toEqual([
      'CELMISOLUTIONS-2026000001',
      'CELMISOLUTIONS-2026000002',
      'CELMISOLUTIONS-2027000001',
    ]);
  });

  it('no se puede reasignar ni capturar a mano', async () => {
    const [c] = await filas<{ id: string; folio: string }>(
      db,
      `select id, folio from public.cotizaciones where folio is not null limit 1`,
    );
    await expect(db.query('select app.asignar_folio_en($1, 2026)', [c!.id])).rejects.toThrow(
      /ya tiene folio/,
    );
    await como(db, 'jorge', async () => {
      await expect(
        db.query(`insert into public.cotizaciones (oportunidad_id, folio) values ($1, 'X')`, [
          deJorge.oportunidad,
        ]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('sólo se asigna en cotizaciones de oportunidades propias', async () => {
    await como(db, 'jorge', async () => {
      const [f] = await filas<{ folio: string }>(db, 'select public.asignar_folio($1) as folio', [
        deJorge.cotizacion,
      ]);
      expect(f!.folio).toMatch(/^CELMISOLUTIONS-\d{10}$/);
      await expect(db.query('select public.asignar_folio($1)', [deFabiola.cotizacion])).rejects.toThrow(
        /Sin permiso/,
      );
    });
  });
});

describe('permisos de la sesión', () => {
  it('mis_permisos refleja el rol y queda vacío sin 2FA', async () => {
    await como(db, 'jorge', async () => {
      const [r] = await filas<{ p: string[] }>(db, 'select public.mis_permisos() as p');
      expect(r!.p).toContain('costos.ver');
      expect(r!.p).not.toContain('utilidad.ver');
    });
    await como(
      db,
      'jorge',
      async () => {
        const [r] = await filas<{ p: string[] }>(db, 'select public.mis_permisos() as p');
        expect(r!.p).toEqual([]);
      },
      { aal: 'aal1' },
    );
  });
});

describe('perfiles y preferencias', () => {
  it('cada quien guarda sus preferencias, pero no puede cambiarse de rol', async () => {
    await como(db, 'jorge', async () => {
      await db.query(`select public.guardar_mis_preferencias('{"menu": "compacto"}')`);
      const r = await db.query(`update public.perfiles set rol_id = 'administrador' where id = $1`, [
        USUARIOS.jorge.id,
      ]);
      expect(r.affectedRows).toBe(0);
      const [p] = await filas<{ preferencias: { menu: string }; rol_id: string }>(
        db,
        'select preferencias, rol_id from public.perfiles where id = $1',
        [USUARIOS.jorge.id],
      );
      expect(p).toEqual({ preferencias: { menu: 'compacto' }, rol_id: 'ejecutivo' });
    });
  });
});
