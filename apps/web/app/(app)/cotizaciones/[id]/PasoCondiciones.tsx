'use client';

import type { JSONContent } from '@tiptap/core';
import { textoPlano, type ContenidoEnriquecido } from '@celmi/validation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent as EventoTecla,
  type ReactNode,
} from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { Icon } from '@/components/Icon';
import { Boton, Tarjeta, Titulo2 } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import type { CondicionCatalogo, CondicionRevision, PaqueteCondiciones, RevisionDetalle } from '@/lib/datos';
import { mover } from '@/lib/reordenar';
import { conVigencia } from '@/lib/vigencia';
import {
  eliminarPaqueteCondiciones,
  guardarCondicionesCotizacion,
  guardarPaqueteCondiciones,
} from '../acciones';
import { claveNueva } from './modelo';

interface Elegida {
  clave: string;
  condicion_id: string | null;
  contenido: unknown;
}

/** Huella para comparar listas sin importar sus claves locales. */
const firma = (xs: readonly Elegida[]) => JSON.stringify(xs.map((x) => [x.condicion_id, x.contenido]));

const textoDe = (contenido: unknown) => {
  try {
    return textoPlano(contenido as ContenidoEnriquecido);
  } catch {
    return '';
  }
};

const docDeTexto = (texto: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: texto ? [{ type: 'text', text: texto }] : [] }],
});

/**
 * Paso «Condiciones comerciales» (decisión 2026-10-05). Combinación G + D (2026-10-10): arriba se carga un **paquete**
 * de un clic (reemplaza lo actual, previa confirmación); abajo las condiciones se ven **como saldrán en la cotización**
 * (viñetas), con mover, ajustar y quitar al pasar el mouse, y un renglón para agregar una suelta (sugiere las del
 * catálogo o se redacta una propia). La vigencia no se menciona: la fija quien autoriza (su marcador va en blanco).
 */
export function PasoCondiciones({
  revision,
  cotizacionId,
  editable,
  catalogo,
  elegidasIniciales,
  paquetes,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  editable: boolean;
  catalogo: CondicionCatalogo[];
  elegidasIniciales: CondicionRevision[];
  paquetes: { lista: PaqueteCondiciones[]; usuarioId: string; esAdmin: boolean };
}) {
  const desdeServidor = () =>
    elegidasIniciales.map((c) => ({ clave: c.id, condicion_id: c.condicion_id, contenido: c.contenido }));
  const [elegidas, setElegidas] = useState<Elegida[]>(desdeServidor);
  const [base, setBase] = useState(() => firma(desdeServidor()));
  const [previas, setPrevias] = useState(elegidasIniciales);
  if (elegidasIniciales !== previas) {
    setPrevias(elegidasIniciales);
    const nuevas = desdeServidor();
    setElegidas(nuevas);
    setBase(firma(nuevas));
  }
  const [ajustando, setAjustando] = useState<string | null>(null);
  /** Texto inicial de una condición propia (lo escrito en el renglón de agregar). */
  const [propia, setPropia] = useState<string | null>(null);
  const [aCargar, setACargar] = useState<PaqueteCondiciones | null>(null);
  const [guardandoPaquete, setGuardandoPaquete] = useState(false);
  /** Último paquete cargado en esta sesión (para indicar «ajustado» y ofrecer actualizarlo). */
  const [cargadoId, setCargadoId] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const lista = useRef<HTMLUListElement>(null);
  const enfocar = useRef<string | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    lista.current?.querySelector<HTMLElement>(`[data-manija="${enfocar.current}"]`)?.focus();
    enfocar.current = null;
  }, [elegidas]);

  const sucio = editable && firma(elegidas) !== base;
  const delCatalogo = (id: string) => catalogo.find((c) => c.id === id);

  /** Condiciones de un paquete con el texto vigente del catálogo donde no trae uno propio. */
  const resolver = (p: PaqueteCondiciones): Elegida[] =>
    p.condiciones.flatMap((c) => {
      const contenido = c.contenido ?? (c.condicion_id ? delCatalogo(c.condicion_id)?.contenido : undefined);
      return contenido ? [{ clave: claveNueva('condicion'), condicion_id: c.condicion_id, contenido }] : [];
    });
  const huellaActual = firma(elegidas);
  const igual = paquetes.lista.find((p) => firma(resolver(p)) === huellaActual);
  const cargado = paquetes.lista.find((p) => p.id === (igual?.id ?? cargadoId));
  const puedeEditar = (p: PaqueteCondiciones) => paquetes.esAdmin || p.creado_por === paquetes.usuarioId;

  const cargar = (p: PaqueteCondiciones) => {
    setElegidas(resolver(p));
    setCargadoId(p.id);
    setACargar(null);
  };
  const pedirCarga = (p: PaqueteCondiciones) => {
    if (elegidas.length && firma(resolver(p)) !== huellaActual) setACargar(p);
    else cargar(p);
  };

  const agregar = (c: CondicionCatalogo) =>
    setElegidas((xs) => [
      ...xs,
      { clave: claveNueva('condicion'), condicion_id: c.id, contenido: c.contenido },
    ]);

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarCondicionesCotizacion(
        revision.id,
        cotizacionId,
        elegidas.map((e) => ({ condicion_id: e.condicion_id, contenido: e.contenido })),
      );
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
      if (!r.error) setBase(huellaActual);
    });

  const teclas = (i: number, clave: string) => (e: EventoTecla) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setElegidas((xs) => mover(xs, i, i + (e.key === 'ArrowUp' ? -1 : 1)));
    enfocar.current = clave;
  };

  const abierta = elegidas.find((e) => e.clave === ajustando);
  /** Texto para mostrar: el marcador de la vigencia queda como un espacio en blanco (lo llena quien autoriza). */
  const mostrar = (contenido: unknown) => conVigencia(contenido, null, '____');
  const disponibles = catalogo.filter((c) => !elegidas.some((e) => e.condicion_id === c.id));

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borde px-5 py-3">
        <Titulo2>Condiciones comerciales</Titulo2>
        {cargado && (
          <span
            className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
              igual ? 'bg-acento-suave text-acento-texto' : 'bg-aviso-suave text-aviso'
            }`}
          >
            {cargado.nombre}
            {!igual && ' · ajustado'}
          </span>
        )}
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
          <span className="mr-1 text-xs font-semibold text-texto-suave">Cargar paquete:</span>
          {paquetes.lista.length === 0 && (
            <span className="text-xs text-texto-suave">
              aún no hay; arma las condiciones y guárdalas como paquete.
            </span>
          )}
          {paquetes.lista.map((p) => {
            const activo = igual?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                onClick={() => pedirCarga(p)}
                title={`Cargar las ${p.condiciones.length} condiciones de «${p.nombre}»`}
                className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-3 text-xs font-semibold transition-colors ${
                  activo
                    ? 'border-acento bg-acento-suave text-acento-texto'
                    : 'border-borde bg-superficie text-texto hover:bg-superficie-2'
                }`}
              >
                {activo && <Icon name="palomita" size={12} strokeWidth={3} />}
                {p.nombre}
              </button>
            );
          })}
          <button
            type="button"
            disabled={!elegidas.length}
            onClick={() => setGuardandoPaquete(true)}
            title={elegidas.length ? 'Guardar estas condiciones como paquete' : 'Agrega condiciones primero'}
            className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-semibold text-texto-suave hover:bg-superficie hover:text-texto disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="guardado" size={13} /> Guardar como paquete
          </button>
        </div>
      )}

      <div className="px-6 py-4">
        {elegidas.length === 0 ? (
          <p className="py-1 text-[13px] text-texto-suave">
            {editable
              ? 'Carga un paquete o agrega condiciones abajo.'
              : 'Esta cotización no tiene condiciones.'}
          </p>
        ) : (
          <ul ref={lista} aria-label="Condiciones de esta cotización" className="flex flex-col gap-0.5">
            {elegidas.map((e, i) => {
              const original = e.condicion_id ? delCatalogo(e.condicion_id) : undefined;
              const ajustada = original && JSON.stringify(original.contenido) !== JSON.stringify(e.contenido);
              const nombre = original?.nombre ?? 'Condición propia';
              return (
                <li
                  key={e.clave}
                  onDragOver={(ev) => {
                    if (arrastrando === null || arrastrando === i) return;
                    ev.preventDefault();
                    setElegidas((xs) => mover(xs, arrastrando, i));
                    setArrastrando(i);
                  }}
                  className={`group flex items-start gap-2 rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-superficie-2 ${
                    arrastrando === i ? 'bg-acento-suave' : ''
                  }`}
                >
                  <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-texto" />
                  <div
                    title={nombre}
                    className="min-w-0 flex-1 py-0.5 [&_.texto-enriquecido]:text-[13px] [&_.texto-enriquecido]:leading-relaxed [&_p]:my-0"
                  >
                    <TextoEnriquecido contenido={mostrar(e.contenido)} respaldo="" />
                  </div>
                  {(ajustada || !original) && (
                    <span className="mt-1 shrink-0 rounded-pill bg-superficie-2 px-2 text-[11px] font-semibold text-texto-suave">
                      {original ? 'Ajustada' : 'Propia'}
                    </span>
                  )}
                  {editable && (
                    <div className="-my-1 flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        draggable
                        data-manija={e.clave}
                        onDragStart={(ev) => {
                          ev.dataTransfer.effectAllowed = 'move';
                          setArrastrando(i);
                        }}
                        onDragEnd={() => setArrastrando(null)}
                        onKeyDown={teclas(i, e.clave)}
                        aria-label={`Mover «${nombre}» (posición ${i + 1} de ${elegidas.length}); usa las flechas`}
                        title="Arrastra para mover (o ↑ ↓)"
                        className="inline-flex size-7 cursor-grab items-center justify-center rounded-sm text-texto-suave hover:bg-superficie hover:text-texto active:cursor-grabbing"
                      >
                        <Icon name="arrastrar" size={15} strokeWidth={3} />
                      </button>
                      <Accion
                        etiqueta="Ajustar el texto sólo para esta cotización"
                        onClick={() => setAjustando(e.clave)}
                      >
                        <Icon name="herramienta" size={15} />
                      </Accion>
                      {ajustada && (
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
                        etiqueta={`Quitar «${nombre}»`}
                        onClick={() => setElegidas((xs) => xs.filter((x) => x.clave !== e.clave))}
                      >
                        <Icon name="cerrar" size={15} />
                      </Accion>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editable && (
          <AgregarCondicion
            disponibles={disponibles}
            onElegir={agregar}
            onPropia={(texto) => setPropia(texto)}
          />
        )}
      </div>

      {(propia !== null || abierta) && (
        <VentanaFlotante
          titulo={abierta ? 'Ajustar condición' : 'Condición propia'}
          detalle="Sólo para esta cotización; el catálogo no cambia."
          esEdicion={Boolean(abierta)}
          onCerrar={() => {
            setAjustando(null);
            setPropia(null);
          }}
        >
          <FormularioAjuste
            inicial={(abierta?.contenido as JSONContent | undefined) ?? docDeTexto(propia ?? '')}
            onAplicar={(contenido) => {
              if (abierta)
                setElegidas((xs) => xs.map((x) => (x.clave === abierta.clave ? { ...x, contenido } : x)));
              else
                setElegidas((xs) => [
                  ...xs,
                  { clave: claveNueva('condicion'), condicion_id: null, contenido },
                ]);
              setAjustando(null);
              setPropia(null);
            }}
          />
        </VentanaFlotante>
      )}

      {aCargar && (
        <VentanaFlotante titulo={`Cargar «${aCargar.nombre}»`} onCerrar={() => setACargar(null)}>
          <p className="mb-5 text-sm">
            Se reemplazarán las {elegidas.length} condiciones actuales por las {resolver(aCargar).length} del
            paquete.
          </p>
          <div className="flex gap-2.5">
            <Boton variante="primario" icono="palomita" onClick={() => cargar(aCargar)}>
              Reemplazar
            </Boton>
            <Boton variante="fantasma" onClick={() => setACargar(null)}>
              Cancelar
            </Boton>
          </div>
        </VentanaFlotante>
      )}

      {guardandoPaquete && (
        <VentanaFlotante
          titulo="Guardar como paquete"
          detalle={`Las ${elegidas.length} condiciones, en este orden, para cargarlas de un clic en otras cotizaciones.`}
          onCerrar={() => setGuardandoPaquete(false)}
        >
          <FormularioPaquete
            actual={cargado && puedeEditar(cargado) ? cargado : null}
            onGuardar={async (id, nombre) => {
              const r = await guardarPaqueteCondiciones(
                id,
                {
                  nombre,
                  // Sin contenido: el paquete seguirá el texto vigente del catálogo.
                  condiciones: elegidas.map((e) => {
                    const o = e.condicion_id ? delCatalogo(e.condicion_id) : undefined;
                    const igualAlCatalogo = o && JSON.stringify(o.contenido) === JSON.stringify(e.contenido);
                    return { condicion_id: e.condicion_id, contenido: igualAlCatalogo ? null : e.contenido };
                  }),
                },
                cotizacionId,
              );
              if (!r.error) {
                setCargadoId(r.id ?? null);
                setGuardandoPaquete(false);
              }
              return r;
            }}
            onEliminar={async (id) => {
              const r = await eliminarPaqueteCondiciones(id, cotizacionId);
              if (!r.error) {
                setCargadoId(null);
                setGuardandoPaquete(false);
              }
              return r;
            }}
          />
        </VentanaFlotante>
      )}
    </Tarjeta>
  );
}

/** Renglón para agregar: escribe para buscar en el catálogo o redacta una condición propia. */
function AgregarCondicion({
  disponibles,
  onElegir,
  onPropia,
}: {
  disponibles: CondicionCatalogo[];
  onElegir: (c: CondicionCatalogo) => void;
  onPropia: (texto: string) => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const q = texto.trim().toLowerCase();
  const sugeridas = disponibles.filter(
    (c) => !q || c.nombre.toLowerCase().includes(q) || textoDe(c.contenido).toLowerCase().includes(q),
  );
  /** Opciones: las sugeridas y, al final, redactar una propia. */
  const total = sugeridas.length + 1;

  const elegir = (i: number) => {
    const c = sugeridas[i];
    if (c) onElegir(c);
    else onPropia(texto.trim());
    setTexto('');
    setActiva(0);
    setAbierto(false);
  };

  const teclas = (e: EventoTecla<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setAbierto(true);
      setActiva((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + total) % total);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (abierto) elegir(Math.min(activa, total - 1));
      else setAbierto(true);
    } else if (e.key === 'Escape') setAbierto(false);
  };

  return (
    <div className="relative mt-2">
      <label htmlFor={id} className="sr-only">
        Agregar condición
      </label>
      <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-texto/30 px-3 focus-within:border-solid focus-within:border-acento focus-within:ring-4 focus-within:ring-acento-suave">
        <Icon name="mas" size={14} className="shrink-0 text-texto-suave" />
        <input
          id={id}
          value={texto}
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-activedescendant={abierto ? `${id}-op-${activa}` : undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            setActiva(0);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={teclas}
          placeholder="Agregar condición: escribe para buscar en el catálogo o redacta una propia…"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-texto outline-none placeholder:text-texto-suave"
        />
      </div>
      {abierto && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute top-full left-0 z-20 mt-1 max-h-72 w-full max-w-[560px] overflow-auto rounded-md border border-borde bg-superficie py-1 text-[13px] sombra"
        >
          {sugeridas.map((c, i) => (
            <li
              key={c.id}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={activa === i}
              // mousedown: antes de que el campo pierda el foco y cierre la lista.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(i);
              }}
              onMouseEnter={() => setActiva(i)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 ${activa === i ? 'bg-superficie-2' : ''}`}
            >
              <strong className="shrink-0">{c.nombre}</strong>
              <span className="min-w-0 truncate text-xs text-texto-suave">{textoDe(c.contenido)}</span>
            </li>
          ))}
          {!sugeridas.length && (
            <li className="px-3 py-2 text-xs text-texto-suave">
              {q ? 'Ninguna del catálogo coincide.' : 'Ya están todas las del catálogo.'}
            </li>
          )}
          <li
            id={`${id}-op-${sugeridas.length}`}
            role="option"
            aria-selected={activa === sugeridas.length}
            onMouseDown={(e) => {
              e.preventDefault();
              elegir(sugeridas.length);
            }}
            onMouseEnter={() => setActiva(sugeridas.length)}
            className={`flex cursor-pointer items-center gap-1.5 border-t border-borde px-3 py-2 text-texto-suave ${
              activa === sugeridas.length ? 'bg-superficie-2 text-texto' : ''
            }`}
          >
            <Icon name="mas" size={13} />
            {q ? `Redactar «${texto.trim()}» como condición propia` : 'Redactar una condición propia'}
          </li>
        </ul>
      )}
    </div>
  );
}

/** Botón de sólo ícono (área de 28 px) para las acciones de cada condición. */
function Accion({
  etiqueta,
  onClick,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={onClick}
      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-texto-suave hover:bg-superficie hover:text-texto"
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

/** Nombre del paquete; si el cargado es tuyo (o eres administrador), actualizarlo o eliminarlo. */
function FormularioPaquete({
  actual,
  onGuardar,
  onEliminar,
}: {
  actual: PaqueteCondiciones | null;
  onGuardar: (id: string | null, nombre: string) => Promise<{ error?: string }>;
  onEliminar: (id: string) => Promise<{ error?: string }>;
}) {
  const ventana = useVentana();
  const id = useId();
  const [modo, setModo] = useState<'nuevo' | 'actualizar'>(actual ? 'actualizar' : 'nuevo');
  const [error, setError] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nombre = String(new FormData(e.currentTarget).get('nombre') ?? '').trim();
    if (!nombre) return setError('Escribe el nombre del paquete.');
    iniciar(async () => {
      const r = await onGuardar(modo === 'actualizar' && actual ? actual.id : null, nombre);
      if (r.error) setError(r.error);
    });
  };

  const control =
    'h-11 w-full rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm text-texto outline-none transition-colors focus:border-acento focus:ring-4 focus:ring-acento-suave';

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {actual && (
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="sr-only">Qué hacer</legend>
          {(
            [
              ['actualizar', `Actualizar «${actual.nombre}» con estas condiciones`],
              ['nuevo', 'Crear un paquete nuevo'],
            ] as const
          ).map(([valor, texto]) => (
            <label key={valor} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="modo"
                value={valor}
                checked={modo === valor}
                onChange={() => setModo(valor)}
                className="size-4 accent-acento"
              />
              {texto}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[13px] font-semibold">
          Nombre del paquete
        </label>
        <input
          key={modo}
          id={id}
          name="nombre"
          required
          maxLength={80}
          autoComplete="off"
          defaultValue={modo === 'actualizar' && actual ? actual.nombre : ''}
          placeholder="p. ej. Gobierno, Sólo servicios"
          className={control}
        />
      </div>
      {error && <p className="text-xs text-peligro">{error}</p>}
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton type="submit" variante="primario" icono="guardado" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar paquete'}
        </Boton>
        {ventana && (
          <Boton variante="fantasma" onClick={ventana.intentarCerrar}>
            Cancelar
          </Boton>
        )}
        {actual &&
          (eliminar ? (
            <Boton
              className="ml-auto"
              variante="peligroFuerte"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  const r = await onEliminar(actual.id);
                  if (r.error) setError(r.error);
                })
              }
            >
              Sí, eliminar «{actual.nombre}»
            </Boton>
          ) : (
            <Boton className="ml-auto" variante="peligro" onClick={() => setEliminar(true)}>
              Eliminar paquete
            </Boton>
          ))}
      </div>
    </form>
  );
}
