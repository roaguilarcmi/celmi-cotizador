'use client';

import type { JSONContent } from '@tiptap/core';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Icon } from '@/components/Icon';
import { Boton, Tarjeta, Titulo2 } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import type { CondicionCatalogo, CondicionRevision, RevisionDetalle } from '@/lib/datos';
import { mover } from '@/lib/reordenar';
import { conVigencia } from '@/lib/vigencia';
import { guardarCondicionesCotizacion } from '../acciones';
import { claveNueva } from './modelo';

interface Elegida {
  clave: string;
  condicion_id: string | null;
  contenido: unknown;
}

/**
 * Paso «Condiciones comerciales» (decisión 2026-10-05): condiciones elegidas del catálogo, ajustables sólo para esta
 * cotización. Compacto (propuesta B, 2026-10-10): catálogo como etiquetas y sólo lo elegido, en su orden. La vigencia
 * no se menciona aquí: la fija quien autoriza (su marcador se ve como un espacio en blanco).
 */
export function PasoCondiciones({
  revision,
  cotizacionId,
  editable,
  catalogo,
  elegidasIniciales,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  editable: boolean;
  catalogo: CondicionCatalogo[];
  elegidasIniciales: CondicionRevision[];
}) {
  const desdeServidor = () =>
    elegidasIniciales.map((c) => ({ clave: c.id, condicion_id: c.condicion_id, contenido: c.contenido }));
  const [elegidas, setElegidas] = useState<Elegida[]>(desdeServidor);
  const [base, setBase] = useState(() => JSON.stringify(desdeServidor()));
  const [previas, setPrevias] = useState(elegidasIniciales);
  if (elegidasIniciales !== previas) {
    setPrevias(elegidasIniciales);
    const nuevas = desdeServidor();
    setElegidas(nuevas);
    setBase(JSON.stringify(nuevas));
  }
  const [ajustando, setAjustando] = useState<string | 'propia' | null>(null);
  /** Condiciones elegidas que se ven completas (por omisión, en una línea). */
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternarVista = (clave: string) =>
    setAbiertas((xs) => {
      const n = new Set(xs);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const sucio = editable && JSON.stringify(elegidas) !== base;
  const delCatalogo = (id: string) => catalogo.find((c) => c.id === id);
  const elegida = (id: string) => elegidas.some((e) => e.condicion_id === id);

  const alternar = (c: CondicionCatalogo) =>
    setElegidas((xs) =>
      elegida(c.id)
        ? xs.filter((e) => e.condicion_id !== c.id)
        : [...xs, { clave: claveNueva('condicion'), condicion_id: c.id, contenido: c.contenido }],
    );

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarCondicionesCotizacion(
        revision.id,
        cotizacionId,
        elegidas.map((e) => ({ condicion_id: e.condicion_id, contenido: e.contenido })),
      );
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
      if (!r.error) setBase(JSON.stringify(elegidas));
    });

  const abierta = elegidas.find((e) => e.clave === ajustando);
  /** Texto para mostrar: el marcador de la vigencia queda como un espacio en blanco (lo llena quien autoriza). */
  const mostrar = (contenido: unknown) => conVigencia(contenido, null, '____');

  return (
    <Tarjeta className="overflow-hidden">
      {/* Propuesta B (2026-10-10): encabezado en una línea, catálogo como etiquetas y sólo lo elegido debajo. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borde px-5 py-3">
        <Titulo2>Condiciones comerciales</Titulo2>
        <span className="text-[13px] text-texto-suave">
          {elegidas.length} {elegidas.length === 1 ? 'elegida' : 'elegidas'}
        </span>
        {editable && (
          <div className="ml-auto flex items-center gap-2">
            {sucio ? (
              <span className="text-xs font-semibold text-aviso">Sin guardar</span>
            ) : (
              mensaje && (
                <span className={`text-xs font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}>
                  {mensaje.texto}
                </span>
              )
            )}
            <Boton
              tamano="chico"
              variante="primario"
              icono="guardado"
              disabled={pendiente || !sucio}
              onClick={guardar}
            >
              {pendiente ? 'Guardando…' : 'Guardar'}
            </Boton>
          </div>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-borde bg-superficie-2/50 px-5 py-2.5">
          <span className="mr-1 text-xs font-semibold text-texto-suave">Catálogo:</span>
          {catalogo.length === 0 && (
            <span className="text-xs text-texto-suave">vacío; un administrador lo llena en Catálogos.</span>
          )}
          {catalogo.map((c) => {
            const on = elegida(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => alternar(c)}
                title={on ? 'Quitar de esta cotización' : 'Agregar a esta cotización'}
                className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-pill border px-3 text-xs font-semibold transition-colors ${
                  on
                    ? 'border-acento bg-acento-suave text-acento-texto'
                    : 'border-borde bg-superficie text-texto hover:bg-superficie-2'
                }`}
              >
                <Icon name={on ? 'palomita' : 'mas'} size={12} strokeWidth={on ? 3 : 2.4} />
                {c.nombre}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setAjustando('propia')}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-pill border border-dashed border-texto/30 px-3 text-xs font-semibold text-texto-suave hover:bg-superficie-2 hover:text-texto"
          >
            <Icon name="mas" size={12} /> Propia
          </button>
        </div>
      )}

      {elegidas.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-texto-suave">
          {editable
            ? 'Elige del catálogo las condiciones que aplican.'
            : 'Esta cotización no tiene condiciones.'}
        </p>
      ) : (
        <ol aria-label="Condiciones de esta cotización" className="divide-y divide-borde">
          {elegidas.map((e, i) => {
            const original = e.condicion_id ? delCatalogo(e.condicion_id) : undefined;
            const ajustada = !original || JSON.stringify(original.contenido) !== JSON.stringify(e.contenido);
            const expandida = abiertas.has(e.clave);
            return (
              <li
                key={e.clave}
                className="group flex items-center gap-3 px-5 py-1.5 hover:bg-superficie-2/50"
              >
                <button
                  type="button"
                  onClick={() => alternarVista(e.clave)}
                  aria-expanded={expandida}
                  title={expandida ? 'Ver en una línea' : 'Ver completa'}
                  className={`flex min-w-0 flex-1 cursor-pointer gap-3 text-left ${expandida ? 'items-start' : 'items-center'}`}
                >
                  <span className="w-5 shrink-0 text-[13px] font-bold text-texto-suave tabular">
                    {i + 1}.
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold">
                    {original?.nombre ?? 'Condición propia'}
                  </span>
                  {original && ajustada && (
                    <span className="shrink-0 rounded-pill bg-aviso-suave px-2 text-[11px] font-semibold text-aviso">
                      Ajustada
                    </span>
                  )}
                  <span
                    className={`min-w-0 flex-1 text-texto-suave [&_.texto-enriquecido]:text-xs [&_.texto-enriquecido]:leading-snug ${
                      expandida ? '' : 'line-clamp-1 [&_p]:inline'
                    }`}
                  >
                    <TextoEnriquecido contenido={mostrar(e.contenido)} respaldo="" />
                  </span>
                </button>
                {editable && (
                  <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Accion
                      etiqueta="Subir"
                      disabled={i === 0}
                      onClick={() => setElegidas((xs) => mover(xs, i, i - 1))}
                    >
                      <Icon name="arriba" size={15} />
                    </Accion>
                    <Accion
                      etiqueta="Bajar"
                      disabled={i === elegidas.length - 1}
                      onClick={() => setElegidas((xs) => mover(xs, i, i + 1))}
                    >
                      <Icon name="abajo" size={15} />
                    </Accion>
                    <Accion
                      etiqueta="Ajustar el texto sólo para esta cotización"
                      onClick={() => setAjustando(e.clave)}
                    >
                      <Icon name="herramienta" size={15} />
                    </Accion>
                    {original && ajustada && (
                      <Accion
                        etiqueta="Volver al texto del catálogo"
                        onClick={() =>
                          setElegidas((xs) =>
                            xs.map((x) =>
                              x.clave === e.clave ? { ...x, contenido: original.contenido } : x,
                            ),
                          )
                        }
                      >
                        <Icon name="restablecer" size={15} />
                      </Accion>
                    )}
                    <Accion
                      etiqueta="Quitar"
                      onClick={() => setElegidas((xs) => xs.filter((x) => x.clave !== e.clave))}
                    >
                      <Icon name="cerrar" size={15} />
                    </Accion>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {(ajustando === 'propia' || abierta) && (
        <VentanaFlotante
          titulo={abierta ? 'Ajustar condición' : 'Condición propia'}
          detalle="Sólo para esta cotización; el catálogo no cambia."
          esEdicion={Boolean(abierta)}
          onCerrar={() => setAjustando(null)}
        >
          <FormularioAjuste
            inicial={(abierta?.contenido as JSONContent | null) ?? null}
            onAplicar={(contenido) => {
              if (abierta)
                setElegidas((xs) => xs.map((x) => (x.clave === abierta.clave ? { ...x, contenido } : x)));
              else
                setElegidas((xs) => [
                  ...xs,
                  { clave: claveNueva('condicion'), condicion_id: null, contenido },
                ]);
              setAjustando(null);
            }}
          />
        </VentanaFlotante>
      )}
    </Tarjeta>
  );
}

/** Botón de sólo ícono (área de 32 px) para las acciones de cada condición. */
function Accion({
  etiqueta,
  disabled,
  onClick,
  children,
}: {
  etiqueta: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie-2 hover:text-texto disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function FormularioAjuste({
  inicial,
  onAplicar,
}: {
  inicial: JSONContent | null;
  onAplicar: (doc: unknown) => void;
}) {
  const ventana = useVentana();
  const [error, setError] = useState<string | null>(null);
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const valor = String(new FormData(e.currentTarget).get('contenido') ?? '');
    if (!valor) return setError('Escribe el texto de la condición.');
    onAplicar(JSON.parse(valor));
  };
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <EditorEnriquecido
        nombre="contenido"
        inicial={inicial}
        etiqueta="Texto de la condición"
        placeholder="Texto de la condición"
        minAlto={140}
      />
      {error && <p className="text-xs text-peligro">{error}</p>}
      <div className="flex gap-2.5">
        <Boton type="submit" variante="primario" icono="palomita">
          Aplicar
        </Boton>
        {ventana && (
          <Boton variante="fantasma" onClick={ventana.intentarCerrar}>
            Cancelar
          </Boton>
        )}
      </div>
    </form>
  );
}
