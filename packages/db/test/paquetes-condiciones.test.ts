import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, filas } from './base.ts';

let db: PGlite;
let condicion: string;

const doc = (texto: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }] });

beforeAll(async () => {
  db = await crearBase();
  const [c] = await filas<{ id: string }>(
    db,
    `insert into public.condiciones_comerciales (nombre, contenido) values ('Precios', $1) returning id`,
    [doc('Precios en MXN más IVA')],
  );
  condicion = c!.id;
}, 60_000);

const guardar = (paquete: string | null, nombre: string, condiciones: unknown[]) =>
  db.query<{ id: string }>('select public.guardar_paquete_condiciones($1, $2, $3) as id', [
    paquete,
    nombre,
    JSON.stringify(condiciones),
  ]);

describe('paquetes de condiciones (0029)', () => {
  it('quien cotiza crea un paquete; los demás lo ven pero no lo cambian', async () => {
    await como(db, 'jhovanny', async () => {
      const r = await guardar(null, '  Gobierno ', [
        { condicion_id: condicion, contenido: null },
        { condicion_id: null, contenido: JSON.parse(doc('Entrega en Pachuca')) },
      ]);
      const id = r.rows[0]!.id;
      const [p] = await filas<{ nombre: string }>(
        db,
        'select nombre from public.paquetes_condiciones where id = $1',
        [id],
      );
      expect(p!.nombre).toBe('Gobierno');
      const items = await filas<{ condicion_id: string | null; contenido: unknown }>(
        db,
        'select condicion_id, contenido from public.paquete_condiciones where paquete_id = $1 order by orden',
        [id],
      );
      expect(items.map((x) => x.condicion_id)).toEqual([condicion, null]);
      expect(items[0]!.contenido).toBeNull();

      // Dentro de la misma transacción: Jorge lo ve, pero no lo cambia ni lo elimina.
      await db.exec(
        `set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","aal":"aal2"}';`,
      );
      expect(await filas(db, 'select 1 from public.paquetes_condiciones where id = $1', [id])).toHaveLength(
        1,
      );
      await db.exec('savepoint antes');
      await expect(guardar(id, 'Otro', [{ condicion_id: condicion }])).rejects.toThrow(/Sólo quien creó/);
      await db.exec('rollback to savepoint antes');
      const baja = await filas(
        db,
        'update public.paquetes_condiciones set activo = false where id = $1 returning id',
        [id],
      );
      expect(baja).toHaveLength(0);

      // Un administrador sí.
      await db.exec(
        `set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';`,
      );
      await guardar(id, 'Gobierno federal', [{ condicion_id: condicion }]);
      const archivado = await filas(
        db,
        'update public.paquetes_condiciones set activo = false where id = $1 returning id',
        [id],
      );
      expect(archivado).toHaveLength(1);
    });
  });

  it('no repite nombres de paquetes activos ni acepta paquetes vacíos', async () => {
    await como(db, 'jorge', async () => {
      await guardar(null, 'Arrendamiento VJM', [{ condicion_id: condicion }]);
      await db.exec('savepoint antes');
      await expect(guardar(null, 'arrendamiento vjm ', [{ condicion_id: condicion }])).rejects.toThrow(
        /Ya existe un paquete/,
      );
    });
    await expect(como(db, 'jorge', () => guardar(null, 'Vacío', []))).rejects.toThrow(/al menos una/);
  });

  it('no se cambia quién lo creó', async () => {
    await expect(
      como(db, 'jorge', () => db.query(`update public.paquetes_condiciones set creado_por = auth.uid()`)),
    ).rejects.toThrow(/permission|permiso/i);
  });
});
