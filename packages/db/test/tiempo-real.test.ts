import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS, type Usuario } from './base.ts';

let db: PGlite;

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

const avisos = (tipo: string) =>
  filas<{ destinatario_id: string; titulo: string; cuerpo: string; enlace: string }>(
    db,
    'select destinatario_id, titulo, cuerpo, enlace from public.notificaciones where tipo = $1 order by destinatario_id',
    [tipo],
  );

const quienes = async (tipo: string) =>
  (await avisos(tipo))
    .map((a) => Object.entries(USUARIOS).find(([, u]) => u.id === a.destinatario_id)?.[0])
    .sort();

describe('avisos nuevos (0035)', () => {
  it('enviar a autorización avisa a quienes autorizan (no a quien la envía)', async () => {
    const op = await crearOportunidad(db, 'jorge');
    // crearOportunidad pasa por «pendiente» como superusuario: se empieza sin avisos.
    await db.exec('delete from public.notificaciones');
    await como(db, 'jorge', async () => {
      await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
        op.revision,
      ]);
      await ser(null);
      expect(await quienes('revision_enviada')).toEqual(['alejandro', 'rodrigo']);
      const [a] = await avisos('revision_enviada');
      expect(a).toMatchObject({
        titulo: 'jorge envió a autorización la versión original',
        cuerpo: 'Laptops Dell',
      });
      expect(a!.enlace).toBe(`/cotizaciones/${op.cotizacion}?paso=autorizacion`);
    });
  });

  it('autorizar y rechazar avisan a quien la capturó y al ejecutivo; el rechazo lleva el motivo', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.revisiones set creado_por = $2 where id = $1`, [
      op.revision,
      USUARIOS.jhovanny.id,
    ]);
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    await db.query(
      `insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48) on conflict do nothing`,
      [op.partida],
    );
    await como(db, 'alejandro', async () => {
      await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [op.revision]);
      await ser(null);
      expect(await quienes('revision_autorizada')).toEqual(['jhovanny', 'jorge']);
      expect((await avisos('revision_autorizada'))[0]!.titulo).toBe('alejandro autorizó la versión original');
    });
    await como(db, 'alejandro', async () => {
      await db.query(
        `update public.revisiones set estado = 'rechazada', comentario_autorizacion = 'Revisa el costo' where id = $1`,
        [op.revision],
      );
      await ser(null);
      expect(await quienes('revision_rechazada')).toEqual(['jhovanny', 'jorge']);
      expect((await avisos('revision_rechazada'))[0]!.cuerpo).toBe('Laptops Dell · «Revisa el costo»');
    });
  });

  it('emitir avisa al ejecutivo sólo si la emitió otra persona', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    await db.query(
      `insert into public.partida_precios (partida_id, precio_unitario) values ($1, 16495.48) on conflict do nothing`,
      [op.partida],
    );
    await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [op.revision]);
    await como(db, 'jorge', async () => {
      await db.query('select public.emitir_revision($1)', [op.revision]);
      await ser(null);
      expect(await avisos('revision_emitida')).toHaveLength(0);
    });
    await como(db, 'rodrigo', async () => {
      await db.query('select public.emitir_revision($1)', [op.revision]);
      await ser(null);
      expect(await quienes('revision_emitida')).toEqual(['jorge']);
    });
  });

  it('agregar un colaborador le avisa', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await como(db, 'jorge', async () => {
      await db.query(
        'insert into public.oportunidad_colaboradores (oportunidad_id, perfil_id) values ($1, $2)',
        [op.oportunidad, USUARIOS.jhovanny.id],
      );
      await ser(null);
      const [a] = await avisos('colaborador_agregado');
      expect(a).toMatchObject({
        destinatario_id: USUARIOS.jhovanny.id,
        titulo: 'jorge te agregó como colaborador',
        enlace: `/oportunidades/${op.oportunidad}`,
      });
    });
  });
});

describe('canales privados (0035)', () => {
  it('cada quien escucha sus avisos, la bandeja si autoriza y las cotizaciones que puede ver', async () => {
    const op = await crearOportunidad(db, 'jorge');
    const puede = async (tema: string) =>
      (await filas<{ p: boolean }>(db, 'select app.puede_usar_tema($1) as p', [tema]))[0]!.p;
    await como(db, 'jorge', async () => {
      expect(await puede(`avisos:${USUARIOS.jorge.id}`)).toBe(true);
      expect(await puede(`avisos:${USUARIOS.alejandro.id}`)).toBe(false);
      expect(await puede('autorizaciones')).toBe(false);
      expect(await puede(`cotizacion:${op.cotizacion}`)).toBe(true);
      expect(await puede('cotizacion:no-es-un-uuid')).toBe(false);
    });
    await como(db, 'fabiola', async () => {
      expect(await puede(`cotizacion:${op.cotizacion}`)).toBe(false);
    });
    await como(db, 'alejandro', async () => {
      expect(await puede('autorizaciones')).toBe(true);
    });
  });
});

describe('suscripciones a avisos de Windows (0035)', () => {
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'B' + 'A'.repeat(86),
    auth: 'A'.repeat(22),
  };

  it('cada quien da de alta, ve y borra sólo las suyas', async () => {
    await como(db, 'jorge', async () => {
      await db.query('insert into public.suscripciones_push (endpoint, p256dh, auth) values ($1, $2, $3)', [
        sub.endpoint,
        sub.p256dh,
        sub.auth,
      ]);
      expect(await filas(db, 'select usuario_id from public.suscripciones_push')).toEqual([
        { usuario_id: USUARIOS.jorge.id },
      ]);
      await ser('fabiola');
      expect(await filas(db, 'select * from public.suscripciones_push')).toHaveLength(0);
      // No puede darla de alta a nombre de otra persona.
      await db.exec('savepoint s');
      await expect(
        db.query(
          'insert into public.suscripciones_push (usuario_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)',
          [USUARIOS.jorge.id, 'https://otro.example/x', sub.p256dh, sub.auth],
        ),
      ).rejects.toThrow(/permission denied/);
      await db.exec('rollback to savepoint s');
      // Sólo https y llaves con forma válida.
      await expect(
        db.query('insert into public.suscripciones_push (endpoint, p256dh, auth) values ($1, $2, $3)', [
          'http://inseguro.example/x',
          sub.p256dh,
          sub.auth,
        ]),
      ).rejects.toThrow(/check/);
    });
  });

  it('el envío (push_enviado_en) no lo puede marcar quien recibe el aviso', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    await como(db, 'alejandro', async () => {
      await expect(db.query('update public.notificaciones set push_enviado_en = now()')).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});

describe('preferencias de avisos (0035)', () => {
  it('se guardan sin tocar las demás preferencias y sólo con claves conocidas', async () => {
    await db.query(`update public.perfiles set preferencias = '{"menu":"compacto"}' where id = $1`, [
      USUARIOS.jorge.id,
    ]);
    await como(db, 'jorge', async () => {
      await db.query(`select public.guardar_mis_avisos('{"sonido": false}')`);
      await db.query(`select public.guardar_mis_avisos('{"windows": true}')`);
      const [p] = await filas<{ preferencias: unknown }>(
        db,
        'select preferencias from public.perfiles where id = $1',
        [USUARIOS.jorge.id],
      );
      expect(p!.preferencias).toEqual({ menu: 'compacto', avisos: { sonido: false, windows: true } });
      await expect(db.query(`select public.guardar_mis_avisos('{"otra": true}')`)).rejects.toThrow(
        /no válida: otra/,
      );
    });
  });
});
