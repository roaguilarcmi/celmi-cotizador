'use client';

import { aEscalado, ESCALA_DINERO, formatearMXN, mejoraDePrecio } from '@celmi/core';
import { textoPlano, type ContenidoEnriquecido } from '@celmi/validation';
import type { JSONContent } from '@tiptap/core';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { Icon } from '@/components/Icon';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import { costoDeFila, erroresDeFila, filaVacia, type Catalogos, type FilaEditable } from './modelo';

/** Texto simple como documento para abrirlo en el editor. */
export const textoComoDocumento = (texto: string): JSONContent => ({
  type: 'doc',
  content: texto
    .split('\n')
    .map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })),
});

/**
 * Captura o edición de una partida en ventana flotante (decisión 2026-10-05): producto con descripción con formato
 * (mismo editor que tareas y notas) y su costo. Al cerrar con cambios pregunta, como en las demás capturas.
 */
export function VentanaPartida({
  fila,
  numero,
  esAdicional,
  catalogos,
  soloLectura,
  onGuardar,
  onCerrar,
}: {
  /** null: partida nueva. */
  fila: FilaEditable | null;
  numero: number;
  esAdicional: boolean;
  catalogos: Catalogos;
  soloLectura: boolean;
  /** `otra`: guardar y abrir una nueva en blanco. */
  onGuardar: (fila: FilaEditable, otra: boolean) => void;
  onCerrar: () => void;
}) {
  const [version, setVersion] = useState(0);
  return (
    <VentanaFlotante
      titulo={fila ? `Partida ${numero}` : 'Nueva partida'}
      detalle={
        soloLectura ? 'Sólo lectura.' : 'Producto y costo. La utilidad y el precio los define quien autoriza.'
      }
      esEdicion={Boolean(fila)}
      version={version}
      onCerrar={onCerrar}
    >
      <Formulario
        key={version}
        inicial={fila ?? filaVacia(catalogos.unidades[0]?.id ?? null)}
        nueva={!fila}
        esAdicional={esAdicional}
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
  nueva,
  esAdicional,
  catalogos,
  soloLectura,
  onGuardar,
}: {
  inicial: FilaEditable;
  nueva: boolean;
  esAdicional: boolean;
  catalogos: Catalogos;
  soloLectura: boolean;
  onGuardar: (fila: FilaEditable, otra: boolean) => void;
}) {
  const ventana = useVentana();
  const id = useId();
  const [f, setF] = useState(inicial);
  const [intento, setIntento] = useState(false);
  const cambiar = (cambio: Partial<FilaEditable>) => setF((x) => ({ ...x, ...cambio }));

  const errores = erroresDeFila(f);
  const costo = costoDeFila(f);

  const enviar = (e: FormEvent<HTMLFormElement>, otra = false) => {
    e.preventDefault();
    const form = (e.target as HTMLElement).closest('form');
    const valor = String(new FormData(form ?? undefined).get('descripcion_contenido') ?? '');
    const doc = valor ? (JSON.parse(valor) as ContenidoEnriquecido) : null;
    const lista = { ...f, descripcion_contenido: doc, descripcion: doc ? textoPlano(doc) : '' };
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

  return (
    <form onSubmit={(e) => enviar(e)} className="flex flex-col gap-5">
      {/* Huella para «¿descartar cambios?»: los campos controlados viajan como ocultos. */}
      <input
        type="hidden"
        name="huella"
        value={JSON.stringify({ ...f, descripcion: undefined, descripcion_contenido: undefined })}
      />

      <Seccion titulo="Producto">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-texto-suave">Descripción</span>
          <EditorEnriquecido
            nombre="descripcion_contenido"
            inicial={
              (f.descripcion_contenido as JSONContent | null) ??
              (f.descripcion ? textoComoDocumento(f.descripcion) : null)
            }
            etiqueta="Descripción de la partida"
            placeholder={'Dell Pro 5 14 (P514260), 14", U7 355 S3, 32 GB, 512 GB…'}
            minAlto={96}
          />
          {intento && errores.descripcion && (
            <span className="text-xs text-peligro">{errores.descripcion}</span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
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
          <Campo etiqueta="Cantidad" id={`${id}-cantidad`} error={intento ? errores.cantidad : undefined}>
            <input
              id={`${id}-cantidad`}
              inputMode="numeric"
              value={f.cantidad}
              disabled={soloLectura}
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
          {esAdicional && (
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
          <Campo etiqueta="Mayorista" id={`${id}-mayorista`}>
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
          {f.moneda !== 'MXN' && (
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

      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="submit"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110"
          >
            <Icon name="palomita" strokeWidth={2.2} />
            {nueva ? 'Agregar partida' : 'Aplicar cambios'}
          </button>
          {nueva && (
            <button
              type="button"
              onClick={(e) => enviar(e as unknown as FormEvent<HTMLFormElement>, true)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-borde bg-superficie px-4 text-sm font-semibold hover:bg-superficie-2"
            >
              <Icon name="mas" strokeWidth={2.2} />
              Agregar y capturar otra
            </button>
          )}
          {ventana && (
            <button
              type="button"
              onClick={ventana.intentarCerrar}
              className="min-h-11 cursor-pointer rounded-md px-4 text-sm font-semibold text-texto-suave hover:bg-superficie-2"
            >
              Cancelar
            </button>
          )}
          <span className="text-xs text-texto-suave">
            Los cambios se guardan en la cotización con «Guardar».
          </span>
        </div>
      )}
    </form>
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
