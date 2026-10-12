import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS, type Usuario } from './base.ts';

let db: PGlite;
const anio = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Mexico_City' }).format(
  new Date(),
);

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

/** Dentro de una transacción de `como`: cambia de usuario (o a superusuario con null). */
async function ser(usuario: Usuario | null) {
  if (!usuario) return db.exec('reset role');
  await db.exec(
    `set local role authenticated; set local request.jwt.claims = '${JSON.stringify({ sub: USUARIOS[usuario].id, aal: 'aal2' })}';`,
  );
}

/** Revisión autorizada (como superusuario), lista para emitirse. */
async function autorizar(revision: string) {
  await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [revision]);
  await db.query(
    `insert into public.partida_precios (partida_id, precio_unitario)
     select pa.id, 16495.48 from public.partidas pa join public.propuestas p on p.id = pa.propuesta_id
     where p.revision_id = $1 on conflict do nothing`,
    [revision],
  );
  await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [revision]);
}

async function autorizada() {
  const op = await crearOportunidad(db, 'jorge');
  await autorizar(op.revision);
  return op;
}

/** Rev nueva (como superusuario) con la presentación indicada, ya autorizada. */
async function revNueva(cotizacion: string, visibilidad: 'visible' | 'interna' | 'nuevo_folio') {
  const [r] = await filas<{ id: string }>(
    db,
    `select public.crear_revision($1, 'solicitud_cliente', 'Cambio pedido por el cliente', $2) as id`,
    [cotizacion, visibilidad],
  );
  await autorizar(r!.id);
  return r!.id;
}

const emitir = async (revision: string) =>
  (await filas<{ folio: string }>(db, 'select public.emitir_revision($1) as folio', [revision]))[0]!.folio;

describe('emisión con folio (0031)', () => {
  it('cualquiera con acceso emite la revisión autorizada; el folio se asigna al emitir', async () => {
    const op = await autorizada();
    await como(db, 'jorge', async () => {
      const folio = await emitir(op.revision);
      expect(folio).toMatch(new RegExp(`^CELMISOLUTIONS-${anio}\\d{6}$`));
      const [r] = await filas<{ estado: string; folio: string; emitida_por: string }>(
        db,
        'select estado, folio, emitida_por from public.revisiones where id = $1',
        [op.revision],
      );
      expect(r).toMatchObject({ estado: 'emitida', folio, emitida_por: USUARIOS.jorge.id });
      const [c] = await filas<{ folio: string }>(db, 'select folio from public.cotizaciones where id = $1', [
        op.cotizacion,
      ]);
      expect(c!.folio).toBe(folio);
      // Ya no se emite dos veces ni se cambia el folio a mano.
      await db.exec('savepoint s');
      await expect(emitir(op.revision)).rejects.toThrow(/autorizada/);
      await db.exec('rollback to savepoint s');
      await ser(null);
      await expect(
        db.query(`update public.revisiones set folio = 'OTRO' where id = $1`, [op.revision]),
      ).rejects.toThrow(/sólo se registran al emitir/);
    });
  });

  it('no emite sin autorización, sin acceso ni una revisión que ya no es la vigente', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await expect(como(db, 'jorge', () => emitir(op.revision))).rejects.toThrow(/autorizada/);
    const ok = await autorizada();
    await expect(como(db, 'fabiola', () => emitir(ok.revision))).rejects.toThrow(/No tienes acceso/);
  });

  it('Rev visible: mismo folio + « Rev A»; interna: mismo folio; nuevo folio: otro consecutivo', async () => {
    const op = await autorizada();
    await como(db, 'jorge', async () => {
      const original = await emitir(op.revision);
      await ser(null);
      const a = await revNueva(op.cotizacion, 'visible');
      await ser('jorge');
      expect(await emitir(a)).toBe(`${original} Rev A`);
      await ser(null);
      const b = await revNueva(op.cotizacion, 'interna');
      await ser('jorge');
      expect(await emitir(b)).toBe(original);
      await ser(null);
      const c = await revNueva(op.cotizacion, 'nuevo_folio');
      await ser('jorge');
      const nuevo = await emitir(c);
      expect(nuevo).not.toBe(original);
      expect(nuevo).toMatch(/^CELMISOLUTIONS-\d{10}$/);
      // La Rev visible siguiente usa el folio nuevo, con su letra (la cuarta revisión es la D).
      await ser(null);
      const d = await revNueva(op.cotizacion, 'visible');
      await ser('jorge');
      expect(await emitir(d)).toBe(`${nuevo} Rev D`);
      // No se emite una revisión que ya no es la vigente.
      await ser(null);
      await db.exec('savepoint s');
      await expect(emitir(a)).rejects.toThrow(/autorizada|más reciente/);
      await db.exec('rollback to savepoint s');
    });
  });
});

describe('cancelación (0031)', () => {
  it('todos la solicitan; sólo quien autoriza la aprueba y se avisa a ambos lados', async () => {
    const op = await autorizada();
    await como(db, 'jorge', async () => {
      const folio = await emitir(op.revision);
      const [s] = await filas<{ id: string }>(db, 'select public.solicitar_cancelacion($1, $2) as id', [
        op.revision,
        'El cliente canceló el proyecto',
      ]);
      // No hay dos solicitudes pendientes ni jorge la puede resolver.
      await db.exec('savepoint s');
      await expect(
        db.query('select public.solicitar_cancelacion($1, $2)', [op.revision, 'Otra vez, por favor']),
      ).rejects.toThrow(/pendiente/);
      await db.exec('rollback to savepoint s');
      await db.exec('savepoint s');
      await expect(db.query('select public.resolver_cancelacion($1, true)', [s!.id])).rejects.toThrow(
        /Sólo quien autoriza/,
      );
      await db.exec('rollback to savepoint s');

      await ser(null);
      const avisos = await filas<{ destinatario_id: string }>(
        db,
        `select destinatario_id from public.notificaciones where tipo = 'cancelacion_solicitada' order by 1`,
      );
      expect(avisos.map((x) => x.destinatario_id)).toEqual([USUARIOS.alejandro.id, USUARIOS.rodrigo.id]);

      await ser('alejandro');
      await db.query('select public.resolver_cancelacion($1, true)', [s!.id]);
      await ser(null);
      const [r] = await filas<{ cancelada_por: string; motivo_cancelacion: string; estado: string }>(
        db,
        'select cancelada_por, motivo_cancelacion, estado from public.revisiones where id = $1',
        [op.revision],
      );
      expect(r).toMatchObject({
        cancelada_por: USUARIOS.alejandro.id,
        motivo_cancelacion: 'El cliente canceló el proyecto',
        estado: 'emitida',
      });
      const [aviso] = await filas<{ destinatario_id: string; titulo: string }>(
        db,
        `select destinatario_id, titulo from public.notificaciones where tipo = 'cancelacion_resuelta'`,
      );
      expect(aviso).toMatchObject({
        destinatario_id: USUARIOS.jorge.id,
        titulo: `Cotización cancelada: ${folio}`,
      });

      // Una Rev interna posterior vuelve a usar el folio cancelado.
      const b = await revNueva(op.cotizacion, 'interna');
      await ser('jorge');
      expect(await emitir(b)).toBe(folio);
    });
  });

  it('quien autoriza cancela directamente; rechazar exige explicación', async () => {
    const op = await autorizada();
    const otra = await autorizada();
    await como(db, 'alejandro', async () => {
      await emitir(op.revision);
      await db.query('select public.solicitar_cancelacion($1, $2)', [op.revision, 'Duplicada por error']);
      const [r] = await filas<{ cancelada_en: Date | null }>(
        db,
        'select cancelada_en from public.revisiones where id = $1',
        [op.revision],
      );
      expect(r!.cancelada_en).not.toBeNull();

      await emitir(otra.revision);
      await ser('jorge');
      const [s] = await filas<{ id: string }>(db, 'select public.solicitar_cancelacion($1, $2) as id', [
        otra.revision,
        'Ya no la quieren',
      ]);
      await ser('alejandro');
      await db.exec('savepoint s');
      await expect(
        db.query('select public.resolver_cancelacion($1, false, $2)', [s!.id, '']),
      ).rejects.toThrow(/Explica/);
      await db.exec('rollback to savepoint s');
      await db.query('select public.resolver_cancelacion($1, false, $2)', [s!.id, 'Sigue en negociación']);
      const [x] = await filas<{ cancelada_en: Date | null }>(
        db,
        'select cancelada_en from public.revisiones where id = $1',
        [otra.revision],
      );
      expect(x!.cancelada_en).toBeNull();
    });
  });
});
