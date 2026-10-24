import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS } from './base.ts';

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

async function autorizada() {
  const op = await crearOportunidad(db, 'jorge');
  await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
    op.revision,
  ]);
  await db.query(
    `insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48) on conflict do nothing`,
    [op.partida],
  );
  await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [op.revision]);
  return op;
}

const registrar = (revision: string, propuesta: string, extra: Record<string, unknown> = {}) =>
  db.query(
    `insert into public.solicitudes_corrida (revision_id, propuesta_id, formato, plazos, esquemas, presentacion)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      revision,
      propuesta,
      extra.formato ?? 'ct',
      extra.plazos ?? [36, 48],
      extra.esquemas ?? ['vjm', 'fpo'],
      extra.presentacion ?? 'cliente',
    ],
  );

describe('solicitud de corrida (0036)', () => {
  it('el formato se asigna por nombre del mayorista (CT e Ingram)', async () => {
    const m = await filas<{ nombre: string; formato_arrendamiento: string | null }>(
      db,
      'select nombre, formato_arrendamiento from public.mayoristas order by nombre',
    );
    const formato = (n: string) =>
      m.find((x) => x.nombre.toLowerCase().includes(n))?.formato_arrendamiento ?? null;
    expect(formato('ct')).toBe('ct');
    expect(formato('ingram')).toBe('ingram');
    expect(formato('cva')).toBeNull();
    await expect(
      db.query(`update public.mayoristas set formato_arrendamiento = 'otro' where nombre = 'CVA'`),
    ).rejects.toThrow(/check/);
  });

  it('se registra sólo con la revisión autorizada, por quien ve costos y tiene acceso', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await como(db, 'jorge', async () => {
      await db.exec('savepoint s');
      // Aún en borrador: no hay precios autorizados.
      await expect(registrar(op.revision, op.propuesta)).rejects.toThrow(/row-level security/);
      await db.exec('rollback to savepoint s');
    });
    const ok = await autorizada();
    await como(db, 'jorge', async () => {
      await registrar(ok.revision, ok.propuesta);
      const [r] = await filas<{ generada_por: string; plazos: number[] }>(
        db,
        'select generada_por, plazos from public.solicitudes_corrida where revision_id = $1',
        [ok.revision],
      );
      expect(r).toMatchObject({ generada_por: USUARIOS.jorge.id, plazos: [36, 48] });
    });
    // Otro ejecutivo sin acceso a la oportunidad.
    await como(db, 'fabiola', async () => {
      await expect(registrar(ok.revision, ok.propuesta)).rejects.toThrow(/row-level security/);
    });
  });

  it('sólo plazos 24/36/48/60 y esquemas conocidos', async () => {
    const op = await autorizada();
    await como(db, 'jorge', async () => {
      await db.exec('savepoint s');
      await expect(registrar(op.revision, op.propuesta, { plazos: [18] })).rejects.toThrow(/check/);
      await db.exec('rollback to savepoint s');
      await expect(registrar(op.revision, op.propuesta, { esquemas: ['otro'] })).rejects.toThrow(/check/);
    });
  });

  it('la auditoría la ubica en su cotización', async () => {
    const op = await autorizada();
    await db.exec('begin');
    await db.exec(
      `set local role authenticated; set local request.jwt.claims = '${JSON.stringify({ sub: USUARIOS.jorge.id, aal: 'aal2' })}';`,
    );
    await registrar(op.revision, op.propuesta);
    await db.exec('commit');
    await como(db, 'alejandro', async () => {
      const r = await filas<{ tabla: string; cotizacion_id: string }>(
        db,
        'select tabla, cotizacion_id from public.auditoria_eventos($1, 50)',
        [JSON.stringify({ cotizacion: op.cotizacion })],
      );
      expect(r.find((x) => x.tabla === 'solicitudes_corrida')?.cotizacion_id).toBe(op.cotizacion);
    });
  });
});

describe('categorías por número de parte (0036)', () => {
  it('las ve cualquiera con sesión; las guarda quien ve costos; el SKU va en mayúsculas', async () => {
    await como(db, 'jorge', async () => {
      await db.query(
        `insert into public.categorias_producto (sku, categoria) values ('PM3406CKA', 'Laptop')`,
      );
      await db.exec('savepoint s');
      await expect(
        db.query(`insert into public.categorias_producto (sku, categoria) values ('minusculas', 'Laptop')`),
      ).rejects.toThrow(/check/);
      await db.exec('rollback to savepoint s');
      await db.query(
        `update public.categorias_producto set categoria = 'Workstation' where sku = 'PM3406CKA'`,
      );
      const [c] = await filas<{ categoria: string; actualizado_por: string }>(
        db,
        `select categoria, actualizado_por from public.categorias_producto where sku = 'PM3406CKA'`,
      );
      expect(c).toMatchObject({ categoria: 'Workstation', actualizado_por: USUARIOS.jorge.id });
    });
  });
});
