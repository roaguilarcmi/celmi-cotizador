import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas, USUARIOS } from './base.ts';

let db: PGlite;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

/** Revisión capturada por Jhovanny para la oportunidad de Jorge, enviada a autorización. */
async function pendiente() {
  const op = await crearOportunidad(db, 'jorge');
  await db.query(
    `update public.revisiones set creado_por = $2, estado = 'pendiente_autorizacion' where id = $1`,
    [op.revision, USUARIOS.jhovanny.id],
  );
  return op;
}

describe('retirar para corregir (0027)', () => {
  it('quien autoriza la regresa a borrador con motivo y avisa al capturista y al ejecutivo', async () => {
    const op = await pendiente();
    await como(db, 'alejandro', async () => {
      await db.query('select public.retirar_revision($1, $2)', [op.revision, 'Falta el costo del flete']);
      const [r] = await filas<{ estado: string; motivo_retiro: string; retirada_por: string }>(
        db,
        'select estado, motivo_retiro, retirada_por from public.revisiones where id = $1',
        [op.revision],
      );
      expect(r).toMatchObject({
        estado: 'borrador',
        motivo_retiro: 'Falta el costo del flete',
        retirada_por: USUARIOS.alejandro.id,
      });
      // Alejandro no se avisa a sí mismo ni ve los avisos de otros.
      expect(await filas(db, 'select * from public.notificaciones')).toHaveLength(0);

      // Dentro de la misma transacción (se revierte al terminar): lo que quedó, visto como superusuario.
      await db.exec('reset role');
      const avisos = await filas<{ destinatario_id: string; cuerpo: string; enlace: string }>(
        db,
        'select destinatario_id, cuerpo, enlace from public.notificaciones order by destinatario_id',
      );
      expect(avisos.map((x) => x.destinatario_id)).toEqual([USUARIOS.jorge.id, USUARIOS.jhovanny.id]);
      expect(avisos[0]!.cuerpo).toContain('Falta el costo del flete');
      expect(avisos[0]!.enlace).toMatch(/^\/cotizaciones\//);

      // Cada quien ve sólo los suyos y los marca como leídos.
      await db.exec(
        `set local role authenticated; set local request.jwt.claims = '{"sub":"${USUARIOS.jorge.id}","aal":"aal2"}';`,
      );
      const mios = await filas<{ id: string }>(db, 'select id from public.notificaciones');
      expect(mios).toHaveLength(1);
      const leidas = await filas(db, 'update public.notificaciones set leida_en = now() returning id');
      expect(leidas).toHaveLength(1);
    });
  });

  it('los avisos sólo se marcan como leídos; nadie los crea a mano', async () => {
    await expect(
      como(db, 'jorge', () => db.query(`update public.notificaciones set cuerpo = 'otro'`)),
    ).rejects.toThrow(/permission|permiso/i);
    await expect(
      como(db, 'jorge', () =>
        db.query(
          `insert into public.notificaciones (destinatario_id, tipo, titulo) values ($1, 'revision_retirada', 'x')`,
          [USUARIOS.fabiola.id],
        ),
      ),
    ).rejects.toThrow(/permission|permiso/i);
  });

  it('exige motivo, sólo con la revisión en espera y sólo quien autoriza', async () => {
    const op = await pendiente();
    await expect(
      como(db, 'alejandro', () => db.query('select public.retirar_revision($1, $2)', [op.revision, ' '])),
    ).rejects.toThrow(/corregir/);
    await expect(
      como(db, 'jorge', () =>
        db.query('select public.retirar_revision($1, $2)', [op.revision, 'Corrige esto']),
      ),
    ).rejects.toThrow(/Sólo quien autoriza/);
    await db.query(`update public.revisiones set estado = 'borrador' where id = $1`, [op.revision]);
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.retirar_revision($1, $2)', [op.revision, 'Corrige esto']),
      ),
    ).rejects.toThrow(/espera autorización/);
  });
});

describe('vigencia en la autorización (0027)', () => {
  it('la fija quien autoriza mientras espera; el ejecutivo ya no la cambia', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await expect(
      como(db, 'jorge', () =>
        db.query(`update public.revisiones set vigencia_hasta = now() where id = $1`, [op.revision]),
      ),
    ).rejects.toThrow(/quien autoriza/);
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
    await como(db, 'alejandro', async () => {
      // Lunes 2026-10-19, 14:00 h de la Ciudad de México.
      await db.query(`select public.guardar_utilidades($1, '[]', '{}', $2)`, [
        op.revision,
        JSON.stringify({ vigencia_hasta: '2026-10-19T14:00:00-06:00' }),
      ]);
      const [r] = await filas<{ vigencia_hasta: Date }>(
        db,
        'select vigencia_hasta from public.revisiones where id = $1',
        [op.revision],
      );
      expect(new Date(r!.vigencia_hasta).toISOString()).toBe('2026-10-19T20:00:00.000Z');
      await expect(
        db.query(`select public.guardar_utilidades($1, '[]', '{}', $2)`, [
          op.revision,
          JSON.stringify({ vigencia_hasta: '2026-10-18T14:00:00-06:00' }),
        ]),
      ).rejects.toThrow(/sábado ni domingo/);
    });
  });

  it('no se autoriza sin vigencia', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(
      `update public.revisiones set vigencia_hasta = null, estado = 'pendiente_autorizacion' where id = $1`,
      [op.revision],
    );
    await expect(
      como(db, 'alejandro', () =>
        db.query('select public.autorizar_revision($1, $2)', [
          op.revision,
          JSON.stringify([{ partida_id: op.partida, utilidad_pct: '13.5', precio_unitario: '16495.48' }]),
        ]),
      ),
    ).rejects.toThrow(/vigencia/);
  });
});

describe('marca escrita y mayoristas con arrendamiento (0027)', () => {
  it('la marca se guarda como texto y la Rev nueva la conserva', async () => {
    const op = await crearOportunidad(db, 'jorge');
    const [prop] = await filas<{ id: string }>(
      db,
      'select id from public.propuestas where revision_id = $1',
      [op.revision],
    );
    // Como superusuario: lo hecho dentro de `como` se revierte al terminar.
    await db.query('select public.guardar_partidas($1, $2)', [
      op.revision,
      JSON.stringify([
        {
          id: prop!.id,
          nombre: 'Propuesta 1',
          tipo: '',
          es_adicional: false,
          partidas: [
            {
              id: op.partida,
              clave: op.partida,
              sku: 'P514',
              marca: '  Lenovo ',
              descripcion: 'Laptop',
              cantidad: 2,
              presentacion: 'linea',
              componentes: [],
              prorratear_entre: [],
              costo: { moneda: 'USD', costo_unitario: '800.00', tipo_cambio: '18.5' },
            },
          ],
        },
      ]),
    ]);
    const [pa] = await filas<{ marca: string; tipo_cambio: string }>(
      db,
      `select pa.marca, c.tipo_cambio from public.partidas pa join public.partida_costos c on c.partida_id = pa.id
       where pa.id = $1`,
      [op.partida],
    );
    // El T.C. ya no se captura en la partida: lo fija quien autoriza.
    expect(pa).toMatchObject({ marca: 'Lenovo' });
    expect(Number(pa!.tipo_cambio)).toBe(1);
    const [copia] = await filas<{ marca: string }>(
      db,
      `insert into public.partidas (propuesta_id, orden, descripcion, cantidad, partida_origen_id)
       values ($1, 9, 'Copia', 1, $2) returning marca`,
      [prop!.id, op.partida],
    );
    expect(copia!.marca).toBe('Lenovo');
  });

  it('un arrendamiento sólo se envía con un mayorista que trabaja arrendamientos', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(
      `update public.mayoristas set trabaja_arrendamiento = false
       where id = (select mayorista_arrendamiento_id from public.revisiones where id = $1)`,
      [op.revision],
    );
    await expect(
      db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [op.revision]),
    ).rejects.toThrow(/no se trabajan arrendamientos/);
  });
});

describe('precios vencidos (0028)', () => {
  it('no se envía a autorización con el precio del mayorista vencido', async () => {
    const op = await crearOportunidad(db, 'jorge');
    await db.query(`update public.partida_costos set vigencia = current_date - 1 where partida_id = $1`, [
      op.partida,
    ]);
    await expect(
      db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [op.revision]),
    ).rejects.toThrow(/precio del mayorista vencido/);
    await db.query(`update public.partida_costos set vigencia = current_date + 30 where partida_id = $1`, [
      op.partida,
    ]);
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      op.revision,
    ]);
  });
});

describe('convertir una partida en adicional (2026-10-10)', () => {
  it('una partida ya guardada pasa a ser adicional incluido de otra', async () => {
    const op = await crearOportunidad(db, 'jorge');
    const [prop] = await filas<{ id: string }>(
      db,
      'select id from public.propuestas where revision_id = $1',
      [op.revision],
    );
    await db.query('select public.guardar_partidas($1, $2)', [
      op.revision,
      JSON.stringify([
        {
          id: prop!.id,
          nombre: 'Propuesta 1',
          tipo: '',
          es_adicional: false,
          partidas: [
            {
              clave: 'nueva',
              descripcion: 'Laptop con 32 GB',
              cantidad: 2,
              presentacion: 'linea',
              costo: { moneda: 'MXN', costo_unitario: '15000.00' },
              componentes: [
                {
                  id: op.partida,
                  clave: op.partida,
                  descripcion: 'Laptop Dell Pro 14 Essential',
                  cantidad: 2,
                  presentacion: 'incluida',
                  costo: { moneda: 'MXN', costo_unitario: '14533.46' },
                },
              ],
              prorratear_entre: [],
            },
          ],
        },
      ]),
    ]);
    const [pa] = await filas<{ presentacion: string; padre: string | null; padre_desc: string }>(
      db,
      `select pa.presentacion, pa.partida_padre_id as padre, p.descripcion as padre_desc
       from public.partidas pa left join public.partidas p on p.id = pa.partida_padre_id where pa.id = $1`,
      [op.partida],
    );
    expect(pa).toMatchObject({ presentacion: 'incluida', padre_desc: 'Laptop con 32 GB' });
  });
});
