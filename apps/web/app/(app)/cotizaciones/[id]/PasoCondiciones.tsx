'use client';

import type { JSONContent } from '@tiptap/core';
import { useState, useTransition, type FormEvent } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Icon } from '@/components/Icon';
import { Boton, Tarjeta, Titulo2 } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import type { CondicionCatalogo, CondicionRevision, RevisionDetalle } from '@/lib/datos';
import { mover } from '@/lib/reordenar';
import { conVigencia, MARCADOR_VIGENCIA } from '@/lib/vigencia';
import { guardarCondicionesCotizacion } from '../acciones';
import { claveNueva } from './modelo';

interface Elegida {
  clave: string;
  condicion_id: string | null;
  contenido: unknown;
}

const fechaLarga = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeStyle: 'short', hour12: false });

/**
 * Paso «Condiciones comerciales» (decisión 2026-10-05): condiciones elegidas del catálogo, ajustables sólo para esta
 * cotización. Donde una condición diga {vigencia} se muestra la vigencia, que fija quien autoriza en la corrida (0027).
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
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const sucio = editable && JSON.stringify(elegidas) !== base;
  const vigenciaIso = revision.vigencia_hasta;
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

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-4 border-b border-borde px-6 py-4">
        <div className="mr-auto">
          <Titulo2>Condiciones comerciales</Titulo2>
          <p className="mt-0.5 text-[13px] text-texto-suave">
            Elige del catálogo las que aplican; puedes ajustarlas sólo para esta cotización.
          </p>
        </div>
      </div>

      {/* La vigencia la fija quien autoriza en la corrida de precios (2026-10-07). */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-borde bg-superficie-2/50 px-6 py-3 text-[13px] text-texto-suave">
        <Icon name="reloj" size={16} />
        <span>
          <strong className="text-texto">Vigencia:</strong>{' '}
          {vigenciaIso
            ? `${fechaLarga.format(new Date(vigenciaIso))} h`
            : 'la fija quien autoriza, en la corrida de precios.'}
        </span>
        {vigenciaIso && (
          <span>· La fija quien autoriza; aparece donde una condición diga {MARCADOR_VIGENCIA}.</span>
        )}
      </p>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Catálogo */}
        <section
          aria-label="Catálogo de condiciones"
          className="border-b border-borde lg:border-r lg:border-b-0"
        >
          <h3 className="px-6 pt-4 pb-2 text-[11px] font-bold tracking-wide text-texto-suave uppercase">
            Catálogo ({catalogo.length})
          </h3>
          {catalogo.length === 0 ? (
            <p className="px-6 pb-6 text-[13px] text-texto-suave">
              Aún no hay condiciones en el catálogo. Un administrador las agrega en Catálogos.
            </p>
          ) : (
            <ul className="pb-2">
              {catalogo.map((c) => (
                <li key={c.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 px-6 py-2.5 hover:bg-superficie-2/70 ${editable ? '' : 'pointer-events-none'}`}
                  >
                    <input
                      type="checkbox"
                      checked={elegida(c.id)}
                      disabled={!editable}
                      onChange={() => alternar(c)}
                      className="mt-1 size-4 shrink-0 accent-acento"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{c.nombre}</span>
                      <span className="mt-0.5 line-clamp-2 text-texto-suave [&_.texto-enriquecido]:text-xs [&_p]:inline">
                        <TextoEnriquecido contenido={c.contenido} respaldo="" />
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Elegidas */}
        <section aria-label="Condiciones de esta cotización">
          <div className="flex items-center gap-2 px-6 pt-4 pb-2">
            <h3 className="mr-auto text-[11px] font-bold tracking-wide text-texto-suave uppercase">
              En esta cotización ({elegidas.length})
            </h3>
            {editable && (
              <Boton tamano="chico" icono="mas" onClick={() => setAjustando('propia')}>
                Condición propia
              </Boton>
            )}
          </div>
          {elegidas.length === 0 ? (
            <p className="px-6 pb-6 text-[13px] text-texto-suave">
              Marca en el catálogo las condiciones que aplican.
            </p>
          ) : (
            <ol className="flex flex-col gap-2 px-4 pb-4">
              {elegidas.map((e, i) => {
                const original = e.condicion_id ? delCatalogo(e.condicion_id) : undefined;
                const ajustada =
                  !original || JSON.stringify(original.contenido) !== JSON.stringify(e.contenido);
                return (
                  <li key={e.clave} className="rounded-md border border-borde bg-superficie">
                    <div className="flex flex-wrap items-center gap-2 border-b border-borde/70 bg-superficie-2/50 py-1.5 pr-1.5 pl-3">
                      <span className="text-[13px] font-bold tabular">{i + 1}.</span>
                      <span className="min-w-0 truncate text-[13px] font-semibold">
                        {original?.nombre ?? 'Condición propia'}
                      </span>
                      {original && ajustada && (
                        <span className="rounded-pill bg-aviso-suave px-2 text-[11px] font-semibold text-aviso">
                          Ajustada
                        </span>
                      )}
                      {editable && (
                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                          <Boton
                            tamano="chico"
                            variante="fantasma"
                            icono="arriba"
                            aria-label={`Subir la condición ${i + 1}`}
                            title="Subir"
                            disabled={i === 0}
                            onClick={() => setElegidas((xs) => mover(xs, i, i - 1))}
                          />
                          <Boton
                            tamano="chico"
                            variante="fantasma"
                            icono="abajo"
                            aria-label={`Bajar la condición ${i + 1}`}
                            title="Bajar"
                            disabled={i === elegidas.length - 1}
                            onClick={() => setElegidas((xs) => mover(xs, i, i + 1))}
                          />
                          <Boton tamano="chico" icono="herramienta" onClick={() => setAjustando(e.clave)}>
                            Ajustar
                          </Boton>
                          {original && ajustada && (
                            <Boton
                              tamano="chico"
                              icono="restablecer"
                              title="Volver al texto del catálogo"
                              onClick={() =>
                                setElegidas((xs) =>
                                  xs.map((x) =>
                                    x.clave === e.clave ? { ...x, contenido: original.contenido } : x,
                                  ),
                                )
                              }
                            >
                              Restablecer
                            </Boton>
                          )}
                          <Boton
                            tamano="chico"
                            variante="peligro"
                            icono="cerrar"
                            onClick={() => setElegidas((xs) => xs.filter((x) => x.clave !== e.clave))}
                          >
                            Quitar
                          </Boton>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2 text-[13px] leading-snug [&_.texto-enriquecido]:text-[13px] [&_.texto-enriquecido]:leading-snug">
                      <TextoEnriquecido contenido={conVigencia(e.contenido, vigenciaIso)} respaldo="" />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-3 border-t border-borde bg-superficie-2/60 px-6 py-3">
          <Boton
            variante="primario"
            tamano="chico"
            icono="guardado"
            disabled={pendiente || !sucio}
            onClick={guardar}
          >
            {pendiente ? 'Guardando…' : 'Guardar condiciones'}
          </Boton>
          {sucio && <span className="text-xs font-semibold text-aviso">Cambios sin guardar</span>}
          {mensaje && (
            <span className={`text-xs font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}>
              {mensaje.texto}
            </span>
          )}
        </div>
      )}

      {(ajustando === 'propia' || abierta) && (
        <VentanaFlotante
          titulo={abierta ? 'Ajustar condición' : 'Condición propia'}
          detalle={`Sólo para esta cotización; el catálogo no cambia. ${MARCADOR_VIGENCIA} se sustituye por la vigencia.`}
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
