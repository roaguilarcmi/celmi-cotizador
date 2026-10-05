import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { aplicarMigraciones, type EjecutorSql } from '../src/migraciones.ts';

export const USUARIOS = {
  alejandro: { id: '00000000-0000-4000-8000-000000000001', rol: 'administrador', activo: true },
  rodrigo: { id: '00000000-0000-4000-8000-000000000002', rol: 'administrador', activo: true },
  jorge: { id: '00000000-0000-4000-8000-000000000003', rol: 'ejecutivo', activo: true },
  fabiola: { id: '00000000-0000-4000-8000-000000000004', rol: 'ejecutivo', activo: true },
  jhovanny: { id: '00000000-0000-4000-8000-000000000005', rol: 'cotizador', activo: true },
  exempleado: { id: '00000000-0000-4000-8000-000000000006', rol: 'ejecutivo', activo: false },
} as const;

export type Usuario = keyof typeof USUARIOS;

export function ejecutor(db: PGlite): EjecutorSql {
  return {
    ejecutar: async (sql) => {
      await db.exec(sql);
    },
    consultar: async <T>(sql: string) => (await db.query<T>(sql)).rows,
  };
}

/** Base nueva en memoria con las migraciones aplicadas y los usuarios de prueba dados de alta. */
export async function crearBase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('./supabase-simulado.sql', import.meta.url), 'utf8'));
  await aplicarMigraciones(ejecutor(db));
  for (const [nombre, u] of Object.entries(USUARIOS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [u.id, `${nombre}@celmi.test`]);
    await db.query(
      'insert into public.perfiles (id, nombre, correo, rol_id, activo) values ($1, $2, $3, $4, $5)',
      [u.id, nombre, `${nombre}@celmi.test`, u.rol, u.activo],
    );
  }
  return db;
}

/**
 * Ejecuta `fn` con la sesión de un usuario, como lo haría la API de Supabase (rol authenticated y token con
 * su id y nivel de autenticación). Todo se revierte al terminar.
 */
export async function como<T>(
  db: PGlite,
  usuario: Usuario | null,
  fn: () => Promise<T>,
  { aal = 'aal2', rol = 'authenticated' }: { aal?: 'aal1' | 'aal2'; rol?: 'authenticated' | 'anon' } = {},
): Promise<T> {
  const claims = usuario ? JSON.stringify({ sub: USUARIOS[usuario].id, aal }) : '{}';
  await db.exec('begin');
  try {
    await db.exec(`set local role ${rol}; set local request.jwt.claims = '${claims}';`);
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

export async function filas<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

/** Crea, como superusuario, una oportunidad completa del ejecutivo indicado. */
export async function crearOportunidad(db: PGlite, ejecutivo: Usuario) {
  const id = USUARIOS[ejecutivo].id;
  const [cliente] = await filas<{ id: string }>(
    db,
    `insert into public.clientes (razon_social) values ('EPOXEMEX S.A. de C.V.') returning id`,
  );
  const [op] = await filas<{ id: string }>(
    db,
    `insert into public.oportunidades (cliente_id, nombre, ejecutivo_id) values ($1, 'Laptops Dell', $2) returning id`,
    [cliente!.id, id],
  );
  const [cot] = await filas<{ id: string }>(
    db,
    `insert into public.cotizaciones (oportunidad_id) values ($1) returning id`,
    [op!.id],
  );
  const [rev] = await filas<{ id: string }>(
    db,
    `insert into public.revisiones (cotizacion_id, numero) values ($1, 0) returning id`,
    [cot!.id],
  );
  const [prop] = await filas<{ id: string }>(
    db,
    `insert into public.propuestas (revision_id, orden, nombre) values ($1, 1, 'Propuesta 1') returning id`,
    [rev!.id],
  );
  const [partida] = await filas<{ id: string }>(
    db,
    `insert into public.partidas (propuesta_id, orden, sku, descripcion, cantidad)
     values ($1, 1, '2GHTM', 'Laptop Dell Pro 14 Essential', 2) returning id`,
    [prop!.id],
  );
  await db.query(`insert into public.partida_costos (partida_id, costo_unitario) values ($1, 14533.46)`, [
    partida!.id,
  ]);
  await db.query(`insert into public.partida_utilidad (partida_id, utilidad_pct) values ($1, 13.5)`, [
    partida!.id,
  ]);
  // Flujo real (0014): los precios sólo se registran mientras la revisión espera autorización.
  await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [rev!.id]);
  await db.query(`insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48)`, [
    partida!.id,
  ]);
  await db.query(`update public.revisiones set estado = 'borrador' where id = $1`, [rev!.id]);
  return {
    cliente: cliente!.id,
    oportunidad: op!.id,
    cotizacion: cot!.id,
    revision: rev!.id,
    propuesta: prop!.id,
    partida: partida!.id,
  };
}
