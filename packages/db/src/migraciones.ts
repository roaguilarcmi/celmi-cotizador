import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Migracion {
  nombre: string;
  sql: string;
  huella: string;
}

/** Lo mínimo que necesita el aplicador: ejecutar texto SQL (varias sentencias) y consultar filas. */
export interface EjecutorSql {
  ejecutar(sql: string): Promise<void>;
  consultar<T>(sql: string): Promise<T[]>;
}

export const DIRECTORIO_MIGRACIONES = join(import.meta.dirname, '..', 'migraciones');

/** Lee las migraciones NNNN_nombre.sql en orden. */
export function leerMigraciones(directorio = DIRECTORIO_MIGRACIONES): Migracion[] {
  return readdirSync(directorio)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((nombre) => {
      const sql = readFileSync(join(directorio, nombre), 'utf8');
      return { nombre, sql, huella: createHash('sha256').update(sql).digest('hex') };
    });
}

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción, y registra su huella.
 * Si una migración ya aplicada cambió de contenido, se detiene: las migraciones aplicadas no se editan,
 * se agrega una nueva.
 */
export async function aplicarMigraciones(
  db: EjecutorSql,
  migraciones = leerMigraciones(),
): Promise<string[]> {
  await db.ejecutar(`
    create schema if not exists app;
    create table if not exists app.migraciones (
      nombre text primary key,
      huella text not null,
      aplicada_en timestamptz not null default now()
    );
  `);
  const aplicadas = new Map(
    (
      await db.consultar<{ nombre: string; huella: string }>('select nombre, huella from app.migraciones')
    ).map((m) => [m.nombre, m.huella]),
  );

  const nuevas: string[] = [];
  for (const m of migraciones) {
    const huella = aplicadas.get(m.nombre);
    if (huella !== undefined) {
      if (huella !== m.huella) {
        throw new Error(`La migración ${m.nombre} ya aplicada fue modificada. Crea una migración nueva.`);
      }
      continue;
    }
    await db.ejecutar(
      `begin;\n${m.sql}\n;insert into app.migraciones (nombre, huella) values (${literal(m.nombre)}, ${literal(m.huella)});\ncommit;`,
    );
    nuevas.push(m.nombre);
  }
  return nuevas;
}
