'use client';

import { aEscalado, ESCALA_DINERO, formatearMXN, mejoraDePrecio } from '@celmi/core';
import { textoPlano, type ContenidoEnriquecido } from '@celmi/validation';
import type { JSONContent } from '@tiptap/core';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { Icon } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Boton } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import { textoComoDocumento } from '@/lib/documento';
import { costoDeFila, erroresDeFila, filaVacia, type Catalogos, type FilaEditable } from './modelo';

/** partida: de primer nivel · adicional: de una partida · cargo: se prorratea entre partidas (reglas 2026-10-05). */
export type ModoPartida = 'partida' | 'adicional' | 'cargo';

const TITULOS: Record<ModoPartida, { nueva: string; existente: string; detalle: string }> = {
  partida: {
    nueva: 'Nueva partida',
    existente: 'Partida',
    detalle: 'Producto, costo y sus adicionales. La utilidad y el precio los define quien autoriza.',
  },
  adicional: {
    nueva: 'Nuevo adicional',
    existente: 'Adicional',
    detalle:
      'Con su propio costo y utilidad. Puede ir incluido en el precio de la partida o como línea visible.',
  },
  cargo: {
    nueva: 'Nuevo cargo a prorratear',
    existente: 'Cargo a prorratear',
    detalle:
      'Con su propio costo y utilidad; su precio se reparte entre las partidas que elijas, según su precio de venta.',
  },
};

/**
 * Captura o edición en ventana flotante (decisión 2026-10-05): descripción con formato (mismo editor que tareas y
 * notas), producto y costo. Al cerrar con cambios pregunta, como en las demás capturas.
 */
export function VentanaPartida({
  fila,
  modo = 'partida',
  numero,
  esAdicional = false,
  cantidadPadre,
  descripcionPadre,
  destinos = [],
  catalogos,
  soloLectura,
  onGuardar,
  onCerrar,
}: {
  /** null: nueva. */
  fila: FilaEditable | null;
  modo?: ModoPartida;
  numero?: number;
  /** La propuesta es de adicionales (aparece «Se suma»). */
  esAdicional?: boolean;
  /** Cantidad de la partida (para adicionales incluidos, que llevan la misma). */
  cantidadPadre?: string;
  descripcionPadre?: string;
  /** Partidas entre las que se puede repartir un cargo. */
  destinos?: { clave: string; descripcion: string }[];
  catalogos: Catalogos;
  soloLectura: boolean;
  /** `otra`: guardar y abrir una nueva en blanco. */
  onGuardar: (fila: FilaEditable, otra: boolean) => void;
  onCerrar: () => void;
}) {
  const [version, setVersion] = useState(0);
  const t = TITULOS[modo];
  const unidad = catalogos.unidades[0]?.id ?? null;
  const vacia = () => {
    const f = filaVacia(
      modo === 'cargo' ? (catalogos.unidades.find((u) => u.id === 'servicio')?.id ?? unidad) : unidad,
    );
    if (modo === 'adicional')
      return { ...f, presentacion: 'incluida' as const, cantidad: cantidadPadre ?? '1' };
    if (modo === 'cargo') return { ...f, presentacion: 'prorrateada' as const };
    return f;
  };
  return (
    <VentanaFlotante
      titulo={fila ? `${t.existente}${numero ? ` ${numero}` : ''}` : t.nueva}
      detalle={
        soloLectura
          ? 'Sólo lectura.'
          : modo === 'adicional' && descripcionPadre
            ? `De «${descripcionPadre}». ${t.detalle}`
            : t.detalle
      }
      esEdicion={Boolean(fila)}
      version={version}
      onCerrar={onCerrar}
    >
      <Formulario
        key={version}
        inicial={fila ?? vacia()}
        modo={modo}
        nueva={!fila}
        esAdicional={esAdicional}
        cantidadPadre={cantidadPadre}
        destinos={destinos}
        catalogos={catalogos}
        soloLectura={soloLectura}
        onGuardar={(f, otra) => {
          onGuardar(f, otra);
          if (otra) setVersion((v) => v + 1);
        }}
      />
    </VentanaFlotante>
  );
}

function Formulario({
  inicial,
  modo,
  nueva,
  esAdicional,
  cantidadPadre,
  destinos,
  catalogos,
  soloLectura,
  onGuardar,
}: {
  inicial: FilaEditable;
  modo: ModoPartida;
  nueva: boolean;
  esAdicional: boolean;
  cantidadPadre?: string;
  destinos: { clave: string; descripcion: string }[];
  catalogos: Catalogos;
  soloLectura: boolean;
  onGuardar: (fila: FilaEditable, otra: boolean) => void;
}) {
  const ventana = useVentana();
  const id = useId();
  const [f, setF] = useState(inicial);
  const [intento, setIntento] = useState(false);
  const [adicional, setAdicional] = useState<string | 'nuevo' | null>(null);

  // El incluido lleva la misma cantidad que su partida.
  const incluido = modo === 'adicional' && f.presentacion === 'incluida';
  const cambiar = (cambio: Partial<FilaEditable>) =>
    setF((x) => {
      const nuevo = { ...x, ...cambio };
      if (cambio.cantidad !== undefined)
        nuevo.componentes = nuevo.componentes.map((c) =>
          c.presentacion === 'incluida' ? { ...c, cantidad: nuevo.cantidad } : c,
        );
      return nuevo;
    });

  const errores = erroresDeFila(f);
  const costo = costoDeFila(f);

  const enviar = (e: FormEvent, otra = false) => {
    e.preventDefault();
    const form = (e.target as HTMLElement).closest('form');
    const valor = String(new FormData(form ?? undefined).get('descripcion_contenido') ?? '');
    const doc = valor ? (JSON.parse(valor) as ContenidoEnriquecido) : null;
    const lista = {
      ...f,
      cantidad: incluido ? (cantidadPadre ?? f.cantidad) : f.cantidad,
      descripcion_contenido: doc,
      descripcion: doc ? textoPlano(doc) : '',
    };
    setIntento(true);
    if (Object.keys(erroresDeFila(lista)).length) {
      setF(lista);
      return;
    }
    onGuardar(lista, otra);
  };

  const control =
    'h-10 w-full rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm text-texto outline-none transition-colors focus:border-acento focus:ring-4 focus:ring-acento-suave disabled:bg-superficie-2 disabled:text-texto-suave';
  const mal = (campo: keyof typeof errores) => (intento && errores[campo] ? 'border-peligro' : '');
  const componenteAbierto = f.componentes.find((c) => c.clave === adicional);

  return (
    <form
      onSubmit={(e) => {
        // El envío del formulario de un adicional (ventana anidada, en un portal) también llega aquí por el árbol de
        // React: sólo se atiende el propio.
        if (e.target !== e.currentTarget) return;
        enviar(e);
      }}
      className="flex flex-col gap-5"
    >
      {/* Huella para «¿descartar cambios?»: los campos controlados viajan como ocultos. */}
      <input
        type="hidden"
        name="huella"
        value={JSON.stringify({ ...f, descripcion: undefined, descripcion_contenido: undefined })}
      />

      {modo === 'adicional' && (
        <div
          role="radiogroup"
          aria-label="Cómo se presenta al cliente"
          className="inline-flex w-fit flex-wrap rounded-md border border-borde bg-superficie-2 p-1"
        >
          {(
            [
              { valor: 'incluida', nombre: 'Incluido en el precio', ayuda: 'El cliente ve una sola línea' },
              { valor: 'linea', nombre: 'Línea visible', ayuda: 'Aparece como línea propia' },
            ] as const
          ).map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={f.presentacion === o.valor}
              disabled={soloLectura}
              title={o.ayuda}
              onClick={() =>
                cambiar({
                  presentacion: o.valor,
                  ...(o.valor === 'incluida' ? { cantidad: cantidadPadre ?? f.cantidad } : {}),
                })
              }
              className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm px-3.5 text-[13px] font-semibold transition-colors ${
                f.presentacion === o.valor
                  ? 'bg-superficie text-texto sombra'
                  : 'text-texto-suave hover:text-texto'
              }`}
            >
              <Icon name={o.valor === 'incluida' ? 'candado' : 'ojo'} size={14} />
              {o.nombre}
            </button>
          ))}
        </div>
      )}

      <Seccion titulo={modo === 'cargo' ? 'Cargo' : 'Producto'}>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-texto-suave">Descripción</span>
          <EditorEnriquecido
            nombre="descripcion_contenido"
            inicial={
              (f.descripcion_contenido as JSONContent | null) ??
              (f.descripcion ? textoComoDocumento(f.descripcion) : null)
            }
            etiqueta="Descripción"
            placeholder={
              modo === 'cargo'
                ? 'Envío especial a Pachuca…'
                : modo === 'adicional'
                  ? 'Memoria RAM 16 GB DDR5, servicio de instalación…'
                  : 'Dell Pro 5 14 (P514260), 14", U7 355 S3, 32 GB, 512 GB…'
            }
            minAlto={88}
          />
          {intento && errores.descripcion && (
            <span className="text-xs text-peligro">{errores.descripcion}</span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {modo !== 'cargo' && (
            <>
              <Campo etiqueta="SKU" id={`${id}-sku`}>
                <input
                  id={`${id}-sku`}
                  value={f.sku}
                  maxLength={60}
                  disabled={soloLectura}
                  onChange={(e) => cambiar({ sku: e.target.value })}
                  className={`${control} font-mono`}
                />
              </Campo>
              <Campo etiqueta="Marca" id={`${id}-marca`}>
                <select
                  id={`${id}-marca`}
                  value={f.marca_id ?? ''}
                  disabled={soloLectura}
                  onChange={(e) => cambiar({ marca_id: e.target.value || null })}
                  className={control}
                >
                  <option value="">—</option>
                  {catalogos.marcas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Tiempo de entrega" id={`${id}-entrega`}>
                <input
                  id={`${id}-entrega`}
                  value={f.entrega}
                  maxLength={60}
                  placeholder="10 semanas"
                  disabled={soloLectura}
                  onChange={(e) => cambiar({ entrega: e.target.value })}
                  className={control}
                />
              </Campo>
            </>
          )}
          <Campo
            etiqueta={incluido ? 'Cantidad (igual a la partida)' : 'Cantidad'}
            id={`${id}-cantidad`}
            error={intento ? errores.cantidad : undefined}
          >
            <input
              id={`${id}-cantidad`}
              inputMode="numeric"
              value={incluido ? (cantidadPadre ?? f.cantidad) : f.cantidad}
              disabled={soloLectura || incluido}
              onChange={(e) => cambiar({ cantidad: e.target.value.replace(/[^\d]/g, '') })}
              className={`${control} text-right tabular ${mal('cantidad')}`}
            />
          </Campo>
          <Campo etiqueta="Unidad" id={`${id}-unidad`}>
            <select
              id={`${id}-unidad`}
              value={f.unidad_id ?? ''}
              disabled={soloLectura}
              onChange={(e) => cambiar({ unidad_id: e.target.value || null })}
              className={control}
            >
              {catalogos.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {esAdicional && modo === 'partida' && (
            <label className="flex min-h-10 cursor-pointer items-end gap-2 pb-2 text-[13px] font-semibold">
              <input
                type="checkbox"
                checked={f.se_suma}
                disabled={soloLectura}
                onChange={(e) => cambiar({ se_suma: e.target.checked })}
                className="size-4 accent-acento"
              />
              Se suma a cada propuesta
            </label>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Costo">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Mayorista / proveedor" id={`${id}-mayorista`}>
            <select
              id={`${id}-mayorista`}
              value={f.mayorista_id ?? ''}
              disabled={soloLectura}
              onChange={(e) => cambiar({ mayorista_id: e.target.value || null })}
              className={control}
            >
              <option value="">—</option>
              {catalogos.mayoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Moneda" id={`${id}-moneda`}>
            <select
              id={`${id}-moneda`}
              value={f.moneda}
              disabled={soloLectura}
              onChange={(e) =>
                cambiar({
                  moneda: e.target.value,
                  tipo_cambio: e.target.value === 'MXN' ? '1' : f.tipo_cambio === '1' ? '' : f.tipo_cambio,
                })
              }
              className={control}
            >
              {catalogos.monedas.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.codigo} · {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Vigencia del precio" id={`${id}-vigencia`}>
            <input
              id={`${id}-vigencia`}
              type="date"
              value={f.vigencia}
              disabled={soloLectura}
              onChange={(e) => cambiar({ vigencia: e.target.value })}
              className={control}
            />
          </Campo>
          <Campo
            etiqueta="Costo unitario antes de IVA"
            id={`${id}-costo`}
            error={intento ? errores.costo_unitario : undefined}
          >
            <input
              id={`${id}-costo`}
              inputMode="decimal"
              value={f.costo_unitario}
              placeholder="0.00"
              disabled={soloLectura}
              onChange={(e) => cambiar({ costo_unitario: e.target.value.replace(/[^\d.,]/g, '') })}
              className={`${control} text-right tabular ${mal('costo_unitario')}`}
            />
            {f.costo_anterior && <PrecioAnterior anterior={f.costo_anterior} actual={f.costo_unitario} />}
          </Campo>
          {f.moneda === 'MXN' ? (
            // Pesos: el T.C. es 1 y no se modifica (decisión 2026-10-06).
            <Campo etiqueta="Tipo de cambio" id={`${id}-tc`}>
              <span
                id={`${id}-tc`}
                title="En pesos mexicanos el tipo de cambio es 1 y no se modifica"
                className={`${control} flex items-center justify-between bg-superficie-2 text-texto-suave tabular`}
              >
                <Icon name="candado" size={14} />1
              </span>
            </Campo>
          ) : (
            <Campo
              etiqueta="Tipo de cambio (5 decimales)"
              id={`${id}-tc`}
              error={intento ? errores.tipo_cambio : undefined}
            >
              <input
                id={`${id}-tc`}
                inputMode="decimal"
                value={f.tipo_cambio}
                placeholder="0.00000"
                disabled={soloLectura}
                onChange={(e) => cambiar({ tipo_cambio: e.target.value.replace(/[^\d.]/g, '') })}
                className={`${control} text-right tabular ${mal('tipo_cambio')}`}
              />
            </Campo>
          )}
          <div className="flex flex-col justify-end rounded-md bg-superficie-2 px-3.5 py-2">
            <span className="text-xs font-semibold text-texto-suave">Costo total en MXN</span>
            <span className="text-lg font-bold tabular">{costo ? formatearMXN(costo.costoTotal) : '—'}</span>
            {costo && f.moneda !== 'MXN' && (
              <span className="text-[11px] text-texto-suave tabular">
                {formatearMXN(costo.costoUnitarioMXN)} c/u
              </span>
            )}
          </div>
        </div>
        {!f.costo_unitario && !soloLectura && (
          <p className="text-xs text-texto-suave">
            Puedes guardarla sin costo y capturarlo después; para enviar a autorización todas deben tenerlo.
          </p>
        )}
      </Seccion>

      {modo === 'cargo' && (
        <Seccion titulo="Repartir entre">
          {destinos.length === 0 ? (
            <p className="text-[13px] text-texto-suave">Primero agrega partidas a esta propuesta.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[13px] font-semibold">
                <input
                  type="checkbox"
                  disabled={soloLectura}
                  checked={destinos.every((d) => f.prorratear_entre.includes(d.clave))}
                  onChange={(e) =>
                    cambiar({ prorratear_entre: e.target.checked ? destinos.map((d) => d.clave) : [] })
                  }
                  className="size-4 accent-acento"
                />
                Todas las partidas
              </label>
              <ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-borde">
                {destinos.map((d, i) => (
                  <li key={d.clave} className="border-b border-borde last:border-0">
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-superficie-2">
                      <input
                        type="checkbox"
                        disabled={soloLectura}
                        checked={f.prorratear_entre.includes(d.clave)}
                        onChange={(e) =>
                          cambiar({
                            prorratear_entre: e.target.checked
                              ? [...f.prorratear_entre, d.clave]
                              : f.prorratear_entre.filter((c) => c !== d.clave),
                          })
                        }
                        className="size-4 shrink-0 accent-acento"
                      />
                      <span className="w-6 shrink-0 text-xs text-texto-suave tabular">{i + 1}</span>
                      <span className="line-clamp-1">{d.descripcion || 'Sin descripción'}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-texto-suave">
                Al autorizar, el precio del cargo se reparte en proporción al precio de venta de cada partida
                elegida y se suma a su precio unitario.
              </p>
              {intento && errores.prorratear_entre && (
                <span className="text-xs text-peligro">{errores.prorratear_entre}</span>
              )}
            </div>
          )}
        </Seccion>
      )}

      {modo === 'partida' && (f.componentes.length > 0 || !soloLectura) && (
        <Seccion titulo="Adicionales de esta partida">
          {f.componentes.length > 0 && (
            <ul className="flex flex-col rounded-md border border-borde">
              {f.componentes.map((c) => {
                const cc = costoDeFila(c);
                return (
                  <li
                    key={c.clave}
                    className="flex items-center gap-3 border-b border-borde px-3 py-2 last:border-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-[13px] [&_p]:inline">
                        {c.descripcion_contenido != null ? (
                          <TextoEnriquecido contenido={c.descripcion_contenido} respaldo={c.descripcion} />
                        ) : (
                          c.descripcion
                        )}
                      </span>
                      <ChipPresentacion presentacion={c.presentacion} />
                    </span>
                    <span className="text-[13px] font-semibold tabular">
                      {cc ? formatearMXN(cc.costoTotal) : 'Sin costo'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAdicional(c.clave)}
                      aria-label={`${soloLectura ? 'Ver' : 'Editar'} adicional`}
                      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie-2 hover:text-texto"
                    >
                      <Icon name={soloLectura ? 'ojo' : 'herramienta'} size={15} />
                    </button>
                    {!soloLectura && (
                      <button
                        type="button"
                        onClick={() =>
                          cambiar({ componentes: f.componentes.filter((x) => x.clave !== c.clave) })
                        }
                        aria-label="Quitar adicional"
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie-2 hover:text-peligro"
                      >
                        <Icon name="cerrar" size={15} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!soloLectura && (
            <Boton tamano="chico" icono="mas" onClick={() => setAdicional('nuevo')} className="w-fit">
              Agregar adicional (memoria, instalación…)
            </Boton>
          )}
        </Seccion>
      )}

      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Boton type="submit" variante="primario" icono="palomita">
            {nueva ? 'Agregar' : 'Aplicar cambios'}
          </Boton>
          {nueva && modo !== 'cargo' && (
            <Boton icono="mas" onClick={(e) => enviar(e, true)}>
              Agregar y capturar otro
            </Boton>
          )}
          {ventana && (
            <Boton variante="fantasma" onClick={ventana.intentarCerrar}>
              Cancelar
            </Boton>
          )}
          <span className="text-xs text-texto-suave">Se guardan en la cotización con «Guardar».</span>
        </div>
      )}

      {(adicional === 'nuevo' || componenteAbierto) && (
        <VentanaPartida
          fila={componenteAbierto ?? null}
          modo="adicional"
          cantidadPadre={f.cantidad}
          descripcionPadre={f.descripcion || 'esta partida'}
          catalogos={catalogos}
          soloLectura={soloLectura}
          onCerrar={() => setAdicional(null)}
          onGuardar={(c, otra) => {
            const existe = f.componentes.some((x) => x.clave === c.clave);
            cambiar({
              componentes: existe
                ? f.componentes.map((x) => (x.clave === c.clave ? c : x))
                : [...f.componentes, c],
            });
            if (!otra) setAdicional(null);
          }}
        />
      )}
    </form>
  );
}

export function ChipPresentacion({ presentacion }: { presentacion: FilaEditable['presentacion'] }) {
  return presentacion === 'incluida' ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-texto-suave">
      <Icon name="candado" size={11} />
      Incluido en el precio
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-acento-texto">
      <Icon name="ojo" size={11} />
      Línea visible
    </span>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[11px] font-bold tracking-wide text-texto-suave uppercase">
        {titulo}
      </legend>
      {children}
    </fieldset>
  );
}

function Campo({
  etiqueta,
  id,
  error,
  children,
}: {
  etiqueta: string;
  id: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-texto-suave">
        {etiqueta}
      </label>
      {children}
      {error && <span className="text-xs text-peligro">{error}</span>}
    </div>
  );
}

/** «Precio anterior» tachado con el % de mejora (aclaración 2026-10-03). */
export function PrecioAnterior({ anterior, actual }: { anterior: string; actual: string }) {
  let porcentaje: string | null = null;
  try {
    if (actual) porcentaje = mejoraDePrecio(anterior, actual.replaceAll(',', '')).porcentaje;
  } catch {
    porcentaje = null;
  }
  return (
    <span className="flex gap-1.5 text-[11px] tabular">
      <span className="text-texto-suave line-through" title="Precio anterior">
        {formatearMXN(aEscalado(anterior, ESCALA_DINERO))}
      </span>
      {porcentaje && Number(porcentaje) > 0 && (
        <span className="font-semibold text-exito">−{porcentaje} %</span>
      )}
    </span>
  );
}
