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

describe('adicionales de una partida y cargos prorrateados (0016)', () => {
  const guardar = (revision: string, datos: unknown) =>
    db.query('select public.guardar_partidas($1, $2)', [revision, JSON.stringify(datos)]);
  const partidas = (revision: string) =>
    filas<{ descripcion: string; cantidad: number; presentacion: string; padre: string | null }>(
      db,
      `select pa.descripcion, pa.cantidad, pa.presentacion, padre.descripcion as padre
       from public.partidas pa join public.propuestas pr on pr.id = pa.propuesta_id
       left join public.partidas padre on padre.id = pa.partida_padre_id
       where pr.revision_id = $1 order by pa.orden`,
      [revision],
    );

  it('guarda adicionales (el incluido toma la cantidad de su partida) y repartos entre partidas', async () => {
    const otra = await crearOportunidad(db, 'fabiola');
    await como(db, 'fabiola', async () => {
      await guardar(otra.revision, [
        {
          id: otra.propuesta,
          nombre: 'Propuesta 1',
          partidas: [
            {
              clave: 'laptop',
              descripcion: 'Laptop',
              cantidad: 10,
              componentes: [
                { clave: 'ram', descripcion: 'Memoria RAM 16 GB', cantidad: 3, presentacion: 'incluida' },
                { clave: 'mochila', descripcion: 'Mochila', cantidad: 2, presentacion: 'linea' },
              ],
            },
            { clave: 'monitor', descripcion: 'Monitor', cantidad: 30 },
            {
              clave: 'envio',
              descripcion: 'Envío especial',
              cantidad: 1,
              presentacion: 'prorrateada',
              prorratear_entre: ['laptop', 'monitor'],
            },
          ],
        },
      ]);
      expect(await partidas(otra.revision)).toEqual([
        { descripcion: 'Laptop', cantidad: 10, presentacion: 'linea', padre: null },
        { descripcion: 'Memoria RAM 16 GB', cantidad: 10, presentacion: 'incluida', padre: 'Laptop' },
        { descripcion: 'Mochila', cantidad: 2, presentacion: 'linea', padre: 'Laptop' },
        { descripcion: 'Monitor', cantidad: 30, presentacion: 'linea', padre: null },
        { descripcion: 'Envío especial', cantidad: 1, presentacion: 'prorrateada', padre: null },
      ]);
      const repartos = await filas<{ destino: string }>(
        db,
        `select d.descripcion as destino from public.partida_prorrateos x
         join public.partidas d on d.id = x.destino_id order by d.orden`,
      );
      expect(repartos.map((r) => r.destino)).toEqual(['Laptop', 'Monitor']);

      // Si cambia la cantidad de la partida, el incluido la sigue.
      await db.query(
        `update public.partidas set cantidad = 12 where descripcion = 'Laptop' and propuesta_id = $1`,
        [otra.propuesta],
      );
      const [ram] = await filas<{ cantidad: number }>(
        db,
        `select cantidad from public.partidas where descripcion like 'Memoria%' and propuesta_id = $1`,
        [otra.propuesta],
      );
      expect(ram!.cantidad).toBe(12);
    });
  });

  it('un cargo prorrateado sin partidas no se envía a autorización', async () => {
    const otra = await crearOportunidad(db, 'fabiola');
    await expect(
      como(db, 'fabiola', async () => {
        await guardar(otra.revision, [
          {
            id: otra.propuesta,
            nombre: 'Propuesta 1',
            partidas: [
              { id: otra.partida, descripcion: 'Laptop', cantidad: 2, costo: { costo_unitario: '100' } },
              {
                descripcion: 'Envío',
                cantidad: 1,
                presentacion: 'prorrateada',
                costo: { costo_unitario: '50' },
              },
            ],
          },
        ]);
        await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
          otra.revision,
        ]);
      }),
    ).rejects.toThrow(/entre qué partidas se reparte/);
  });

  it('no se permiten incluidos en primer nivel ni adicionales de adicionales', async () => {
    const otra = await crearOportunidad(db, 'fabiola');
    await expect(
      como(db, 'fabiola', () =>
        guardar(otra.revision, [
          {
            id: otra.propuesta,
            nombre: 'P',
            partidas: [{ descripcion: 'X', cantidad: 1, presentacion: 'incluida' }],
          },
        ]),
      ),
    ).rejects.toThrow(/Sólo un adicional/);
  });

  it('una Rev nueva copia adicionales y repartos', async () => {
    const otra = await crearOportunidad(db, 'fabiola');
    // Fuera de como(): debe quedar guardado para autorizar y crear la Rev después.
    await Promise.resolve(
      guardar(otra.revision, [
        {
          id: otra.propuesta,
          nombre: 'P',
          partidas: [
            {
              id: otra.partida,
              clave: 'laptop',
              descripcion: 'Laptop',
              cantidad: 2,
              costo: { costo_unitario: '14533.46' },
              componentes: [
                {
                  descripcion: 'RAM',
                  cantidad: 2,
                  presentacion: 'incluida',
                  costo: { costo_unitario: '900' },
                },
              ],
            },
            {
              clave: 'envio',
              descripcion: 'Envío',
              cantidad: 1,
              presentacion: 'prorrateada',
              costo: { costo_unitario: '500' },
              prorratear_entre: ['laptop'],
            },
          ],
        },
      ]),
    );
    // Autorizar por el camino real (superusuario: precios mientras espera).
    await db.query(`update public.revisiones set estado = 'pendiente_autorizacion' where id = $1`, [
      otra.revision,
    ]);
    await db.query(
      `insert into public.partida_precios (partida_id, precio_unitario)
       select pa.id, round(c.costo_unitario * c.tipo_cambio * 1.2, 2) from public.partidas pa
       join public.partida_costos c on c.partida_id = pa.id where pa.propuesta_id = $1`,
      [otra.propuesta],
    );
    await db.query(`update public.revisiones set estado = 'autorizada' where id = $1`, [otra.revision]);
    await como(db, 'fabiola', async () => {
      const [{ id }] = (await filas<{ id: string }>(
        db,
        `select public.crear_revision($1, 'solicitud_cliente') as id`,
        [otra.cotizacion],
      )) as [{ id: string }];
      expect(await partidas(id)).toEqual([
        { descripcion: 'Laptop', cantidad: 2, presentacion: 'linea', padre: null },
        { descripcion: 'RAM', cantidad: 2, presentacion: 'incluida', padre: 'Laptop' },
        { descripcion: 'Envío', cantidad: 1, presentacion: 'prorrateada', padre: null },
      ]);
      const n = await filas(
        db,
        `select 1 from public.partida_prorrateos x join public.partidas pa on pa.id = x.partida_id
         join public.propuestas pr on pr.id = pa.propuesta_id where pr.revision_id = $1`,
        [id],
      );
      expect(n).toHaveLength(1);
    });
  });
});
