import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearOportunidad, filas } from './base.ts';

let db: PGlite;
let op: Awaited<ReturnType<typeof crearOportunidad>>;

beforeAll(async () => {
  db = await crearBase();
  op = await crearOportunidad(db, 'jorge');
}, 60_000);

const estado = (id = op.revision) =>
  filas<{ estado: string }>(db, 'select estado::text from public.revisiones where id = $1', [id]).then(
    (r) => r[0]!.estado,
  );
const mover = (nuevo: string, id = op.revision) =>
  db.query('update public.revisiones set estado = $1 where id = $2', [nuevo, id]);
const precio = (valor: string, partida = op.partida) =>
  db.query(
    `insert into public.partida_precios (partida_id, precio_unitario) values ($1, $2)
     on conflict (partida_id) do update set precio_unitario = excluded.precio_unitario`,
    [partida, valor],
  );

describe('reglas de la cotización (Fase 3A, decisiones 2026-10-05)', () => {
  it('tipo de cambio con máximo 5 decimales', async () => {
    await expect(
      como(db, 'jorge', () =>
        db.query('update public.partida_costos set tipo_cambio = 18.123456 where partida_id = $1', [
          op.partida,
        ]),
      ),
    ).rejects.toThrow(/tipo_cambio_5_decimales/);
    await como(db, 'jorge', async () => {
      const r = await db.query(
        'update public.partida_costos set tipo_cambio = 18.12345 where partida_id = $1',
        [op.partida],
      );
      expect(r.affectedRows).toBe(1);
    });
  });

  it('no se envía a autorización una partida sin costo', async () => {
    await expect(
      como(db, 'jorge', async () => {
        await db.query(
          `insert into public.partidas (propuesta_id, orden, descripcion, cantidad) values ($1, 2, 'Sin costo', 1)`,
          [op.propuesta],
        );
        await mover('pendiente_autorizacion');
      }),
    ).rejects.toThrow(/Faltan costos en 1 partida/);
  });

  it('mientras espera autorización, el ejecutivo ya no cambia partidas; puede retirarla a borrador', async () => {
    await como(db, 'jorge', async () => {
      await mover('pendiente_autorizacion');
      const p = await db.query('update public.partidas set cantidad = 9 where id = $1', [op.partida]);
      expect(p.affectedRows).toBe(0);
      await mover('borrador');
      expect(await estado()).toBe('borrador');
    });
  });

  it('el precio nunca baja del costo, y sólo se registra mientras espera autorización', async () => {
    await expect(como(db, 'alejandro', () => precio('16495.48'))).rejects.toThrow(/al autorizar/);
    await mover('pendiente_autorizacion');
    await expect(como(db, 'alejandro', () => precio('14000.00'))).rejects.toThrow(/menor que el costo/);
    await mover('borrador');
  });

  it('no se autoriza sin precios; el rechazo exige motivo', async () => {
    await mover('pendiente_autorizacion');
    await expect(como(db, 'alejandro', () => mover('autorizada'))).rejects.toThrow(/Faltan precios/);
    await expect(como(db, 'alejandro', () => mover('rechazada'))).rejects.toThrow(/motivo del rechazo/);
    await como(db, 'alejandro', async () => {
      await db.query(
        `update public.revisiones set estado = 'rechazada', comentario_autorizacion = 'Revisar el costo del SSD' where id = $1`,
        [op.revision],
      );
      expect(await estado()).toBe('rechazada');
    });
    await mover('borrador');
  });

  it('autorizar registra quién y cuándo; después no hay cambios de estado arbitrarios', async () => {
    await mover('pendiente_autorizacion');
    await como(db, 'alejandro', async () => {
      await precio('16495.48');
      await mover('autorizada');
      await db.exec('reset role');
      const [r] = await filas<{ quien: boolean; cuando: boolean }>(
        db,
        'select autorizada_por is not null as quien, autorizada_en is not null as cuando from public.revisiones where id = $1',
        [op.revision],
      );
      expect(r).toEqual({ quien: true, cuando: true });
    });
    await mover('pendiente_autorizacion');
    await precio('16495.48');
    await mover('autorizada');
    await expect(mover('borrador')).rejects.toThrow(/no permitido/);
  });

  it('una Rev por mejora de precio copia todo sin utilidad ni precio, guarda el «Precio anterior» y vuelve a autorización', async () => {
    await como(db, 'jorge', async () => {
      const [{ id }] = (await filas<{ id: string }>(
        db,
        `select public.crear_revision($1, 'mejora_precio') as id`,
        [op.cotizacion],
      )) as [{ id: string }];
      const [rev] = await filas<{ numero: number; estado: string }>(
        db,
        'select numero, estado::text from public.revisiones where id = $1',
        [id],
      );
      expect(rev).toEqual({ numero: 1, estado: 'borrador' });
      const [copia] = await filas<{ costo: string; anterior: string; precios: number }>(
        db,
        `select c.costo_unitario::text as costo, c.costo_anterior::text as anterior,
                (select count(*)::int from public.partida_precios p where p.partida_id = pa.id) as precios
         from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
         join public.partida_costos c on c.partida_id = pa.id
         where pr.revision_id = $1 and pa.orden = 1`,
        [id],
      );
      expect(copia).toEqual({ costo: '14533.46', anterior: '14533.46', precios: 0 });
      // El ejecutivo captura el costo mejorado en la Rev nueva (está en borrador).
      const r = await db.query(
        `update public.partida_costos c set costo_unitario = 13900 from public.partidas pa, public.propuestas pr
         where c.partida_id = pa.id and pa.propuesta_id = pr.id and pr.revision_id = $1`,
        [id],
      );
      expect(r.affectedRows).toBe(1);
    });
  });

  it('sólo se crea una Rev a partir de una revisión autorizada', async () => {
    const otra = await crearOportunidad(db, 'fabiola');
    await expect(
      como(db, 'fabiola', () =>
        db.query(`select public.crear_revision($1, 'solicitud_cliente')`, [otra.cotizacion]),
      ),
    ).rejects.toThrow(/a partir de una autorizada/);
  });
});

describe('guardar partidas en una transacción (Fase 3B)', () => {
  it('agrega, reordena (intercambiando posiciones), borra y guarda costos de una vez', async () => {
    const otra = await crearOportunidad(db, 'fabiola');
    await como(db, 'fabiola', async () => {
      const guardar = (datos: unknown) =>
        db.query('select public.guardar_partidas($1, $2)', [otra.revision, JSON.stringify(datos)]);
      await guardar([
        {
          id: otra.propuesta,
          nombre: 'Propuesta 1',
          partidas: [
            {
              descripcion: 'Monitor Dell Pro P22',
              cantidad: 30,
              costo: { costo_unitario: '2329.18', moneda: 'MXN', vigencia: '2026-10-09' },
            },
            {
              id: otra.partida,
              descripcion: 'Laptop Dell Pro 14 Essential',
              cantidad: 2,
              costo: { costo_unitario: '14533.46' },
            },
          ],
        },
        {
          nombre: 'Accesorios',
          es_adicional: true,
          partidas: [{ descripcion: 'Teclado y mouse', cantidad: 30, se_suma: true }],
        },
      ]);
      const r = await filas<{
        propuesta: string;
        orden: number;
        descripcion: string;
        costo: string | null;
        se_suma: boolean;
      }>(
        db,
        `select pr.nombre as propuesta, pa.orden, pa.descripcion, c.costo_unitario::text as costo, pa.se_suma
         from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
         left join public.partida_costos c on c.partida_id = pa.id
         where pr.revision_id = $1 order by pr.orden, pa.orden`,
        [otra.revision],
      );
      expect(r).toEqual([
        {
          propuesta: 'Propuesta 1',
          orden: 1,
          descripcion: 'Monitor Dell Pro P22',
          costo: '2329.18',
          se_suma: false,
        },
        {
          propuesta: 'Propuesta 1',
          orden: 2,
          descripcion: 'Laptop Dell Pro 14 Essential',
          costo: '14533.46',
          se_suma: false,
        },
        { propuesta: 'Accesorios', orden: 1, descripcion: 'Teclado y mouse', costo: null, se_suma: true },
      ]);
      // Guardar otra vez sin la propuesta de accesorios la borra con sus partidas.
      const [laptop] = await filas<{ id: string }>(
        db,
        `select id from public.partidas where descripcion like 'Laptop%' and propuesta_id = $1`,
        [otra.propuesta],
      );
      await guardar([
        {
          id: otra.propuesta,
          nombre: 'Propuesta 1',
          partidas: [{ id: laptop!.id, descripcion: 'Laptop', cantidad: 3 }],
        },
      ]);
      const quedan = await filas(db, 'select 1 from public.propuestas where revision_id = $1', [
        otra.revision,
      ]);
      expect(quedan).toHaveLength(1);
    });
  });

  it('no se guarda nada si la revisión ya está en autorización, ni se tocan revisiones ajenas', async () => {
    const otra = await crearOportunidad(db, 'fabiola');
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      otra.revision,
    ]);
    await expect(
      como(db, 'fabiola', () => db.query('select public.guardar_partidas($1, $2)', [otra.revision, '[]'])),
    ).rejects.toThrow(/ya no se puede modificar/);
    await expect(
      como(db, 'jorge', () => db.query('select public.guardar_partidas($1, $2)', [otra.revision, '[]'])),
    ).rejects.toThrow(/no existe o no tienes acceso/);
  });
});
