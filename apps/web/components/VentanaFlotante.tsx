'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/** Permite que el botón «Cancelar» de un formulario pase por la misma confirmación que el clic fuera. */
const Contexto = createContext<{ intentarCerrar: () => void } | null>(null);
export const useVentana = () => useContext(Contexto);

/** Huella del formulario para saber si hay cambios sin guardar (incluye campos ocultos del editor y los avisos). */
const huella = (form: HTMLFormElement | null | undefined) =>
  form
    ? [...new FormData(form)]
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => `${k}=${v as string}`)
        .join('&')
    : '';

/**
 * Ventana flotante con el fondo desenfocado. Si hay cambios y se intenta cerrar (clic fuera, Esc, «×» o «Cancelar»),
 * pregunta: seguir editando, guardar, guardar como borrador (si se ofrece) o descartar.
 */
export function VentanaFlotante({
  titulo,
  detalle,
  onCerrar,
  onBorrador,
  esEdicion,
  version = 0,
  children,
}: {
  titulo: string;
  detalle?: ReactNode;
  onCerrar: () => void;
  /** Guarda el formulario a medias; si no se pasa, no se ofrece «Guardar como borrador». */
  onBorrador?: (datos: FormData) => Promise<{ error?: string }>;
  esEdicion?: boolean;
  /** Al cambiar (p. ej. «Empezar de cero»), el contenido actual pasa a ser la referencia de «sin cambios». */
  version?: number;
  children: ReactNode;
}) {
  const idTitulo = useId();
  const ventana = useRef<HTMLDialogElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const inicial = useRef('');
  const presionDentro = useRef(false);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formulario = () => cuerpo.current?.querySelector('form');

  useEffect(() => {
    const d = ventana.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  useEffect(() => {
    inicial.current = huella(formulario());
  }, [version]);

  const intentarCerrar = () => {
    if (huella(formulario()) === inicial.current) onCerrar();
    else {
      setError(null);
      setConfirmar(true);
    }
  };

  const guardar = () => {
    setConfirmar(false);
    formulario()?.requestSubmit();
  };

  const guardarBorrador = async () => {
    const form = formulario();
    if (!form || !onBorrador) return;
    setGuardando(true);
    const r = await onBorrador(new FormData(form));
    setGuardando(false);
    if (r.error) setError(r.error);
    else onCerrar();
  };

  // Portal: una ventana abierta desde otra (p. ej. una subtarea) no queda dentro del formulario de la primera.
  return createPortal(
    <dialog
      ref={ventana}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        // En React los eventos de un portal suben al componente que lo contiene: sólo atender los propios.
        if (e.target !== ventana.current) return;
        e.preventDefault(); // Esc pasa por la confirmación
        if (confirmar) setConfirmar(false);
        else intentarCerrar();
      }}
      onMouseDown={(e) => {
        presionDentro.current = e.target !== ventana.current;
      }}
      onClick={(e) => {
        // Sólo cuenta como «clic fuera» si también se presionó fuera (no al soltar una selección de texto).
        if (e.target === ventana.current && !presionDentro.current && !confirmar) intentarCerrar();
      }}
      className="m-auto w-[min(680px,calc(100vw-2rem))] overflow-visible rounded-lg border border-borde bg-superficie p-0 text-texto shadow-2xl backdrop:bg-[#0F0E1F]/45 backdrop:backdrop-blur-md"
    >
      <Contexto.Provider value={{ intentarCerrar }}>
        <div className={`relative ${confirmar ? 'min-h-[400px]' : ''}`}>
          <div className="flex items-start justify-between gap-3 border-b border-borde px-6 py-4">
            <div className="min-w-0">
              <h2 id={idTitulo} className="text-[17px] font-bold tracking-tight">
                {titulo}
              </h2>
              {detalle && <div className="mt-0.5 text-[13px] text-texto-suave">{detalle}</div>}
            </div>
            <button
              type="button"
              onClick={intentarCerrar}
              aria-label="Cerrar"
              className="-mr-2 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto"
            >
              <Icon name="cerrar" size={18} />
            </button>
          </div>
          <div ref={cuerpo} className="max-h-[min(75vh,720px)] overflow-y-auto px-6 py-5">
            {children}
          </div>

          {confirmar && (
            <div
              role="alertdialog"
              aria-labelledby="confirmar-titulo"
              aria-describedby="confirmar-detalle"
              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-superficie/70 p-4 backdrop-blur-sm"
            >
              <div className="animar-entrada w-full max-w-[400px] rounded-lg border border-borde bg-superficie p-5 sombra">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-aviso-suave text-aviso">
                    <Icon name="guardado" size={20} />
                  </span>
                  <div>
                    <h3 id="confirmar-titulo" className="text-[15px] font-bold">
                      {esEdicion ? 'Tienes cambios sin guardar' : 'Este registro no se ha guardado'}
                    </h3>
                    <p id="confirmar-detalle" className="mt-1 text-[13px] text-texto-suave">
                      ¿Qué quieres hacer con lo que capturaste?
                    </p>
                  </div>
                </div>
                {error && <p className="mt-3 text-xs text-peligro">{error}</p>}
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmar(false)}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-paso px-4 text-sm font-semibold text-white hover:brightness-110"
                  >
                    <Icon name="izquierda" size={16} /> Seguir editando
                  </button>
                  <button
                    type="button"
                    onClick={guardar}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-acento px-4 text-sm font-semibold text-sobre-acento hover:brightness-110"
                  >
                    <Icon name="palomita" size={16} strokeWidth={2.4} />{' '}
                    {esEdicion ? 'Guardar cambios' : 'Guardar'}
                  </button>
                  {onBorrador && (
                    <button
                      type="button"
                      onClick={guardarBorrador}
                      disabled={guardando}
                      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-borde bg-superficie px-4 text-sm font-semibold text-texto hover:bg-superficie-2 disabled:opacity-60"
                    >
                      <Icon name="guardado" size={16} />{' '}
                      {guardando ? 'Guardando borrador…' : 'Guardar como borrador'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onCerrar}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-peligro hover:bg-peligro-suave"
                  >
                    <Icon name="cerrar" size={16} /> {esEdicion ? 'Descartar cambios' : 'Descartar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Contexto.Provider>
    </dialog>,
    document.body,
  );
}
