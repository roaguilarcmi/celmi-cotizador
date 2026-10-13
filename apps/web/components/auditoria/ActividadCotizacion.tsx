'use client';

import { fechaHoraAuditoria } from '@celmi/core';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cargarActividad } from '@/lib/acciones-auditoria';
import type { AccionVista } from '@/lib/auditoria';
import { Icon } from '../Icon';
import { Boton, clasesBoton } from '../ui';
import { Frase, ListaCambios, Persona, textoCambios } from './Piezas';

/**
 * Botón «Actividad» de la cotización (Fase 7 · E): panel lateral con quién hizo qué y cuándo, sin salir del wizard.
 * Cada acción se despliega para ver sus cambios.
 */
export function ActividadCotizacion({
  cotizacionId,
  veAuditoria,
}: {
  cotizacionId: string;
  veAuditoria: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton tamano="chico" icono="auditoria" onClick={() => setAbierto(true)}>
        Actividad
      </Boton>
      {abierto && (
        <Panel cotizacionId={cotizacionId} veAuditoria={veAuditoria} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}

function Panel({
  cotizacionId,
  veAuditoria,
  onCerrar,
}: {
  cotizacionId: string;
  veAuditoria: boolean;
  onCerrar: () => void;
}) {
  const ventana = useRef<HTMLDialogElement>(null);
  const [datos, setDatos] = useState<{ acciones?: AccionVista[]; error?: string } | null>(null);
  const [desplegada, setDesplegada] = useState<string | null>(null);

  useEffect(() => {
    const d = ventana.current;
    if (d && !d.open) d.showModal();
    let vigente = true;
    void cargarActividad(cotizacionId).then((r) => {
      if (vigente) setDatos(r);
    });
    return () => {
      vigente = false;
      d?.close();
    };
  }, [cotizacionId]);

  return createPortal(
    <dialog
      ref={ventana}
      aria-labelledby="actividad-titulo"
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ventana.current) onCerrar();
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(440px,100vw)] max-w-none border-l border-borde bg-superficie p-0 text-texto shadow-2xl backdrop:bg-[#0F0E1F]/35 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
          <Icon name="auditoria" size={18} />
          <h2 id="actividad-titulo" className="flex-1 text-[15px] font-bold">
            Actividad de esta cotización
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto"
          >
            <Icon name="cerrar" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {!datos ? (
            <p className="py-10 text-center text-sm text-texto-suave">Cargando…</p>
          ) : datos.error ? (
            <p className="my-4 rounded-md bg-peligro-suave px-3 py-2 text-[13px] text-peligro">
              {datos.error}
            </p>
          ) : !datos.acciones?.length ? (
            <p className="py-10 text-center text-sm text-texto-suave">Aún no hay actividad registrada.</p>
          ) : (
            <ul>
              {datos.acciones.map((a) => {
                const abierta = desplegada === a.clave;
                return (
                  <li key={a.clave} className="border-b border-borde last:border-0">
                    <button
                      type="button"
                      aria-expanded={abierta}
                      onClick={() => setDesplegada(abierta ? null : a.clave)}
                      className="flex w-full cursor-pointer gap-3 py-2.5 text-left text-[13px]"
                    >
                      <Persona a={a} tamano={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block leading-snug font-semibold">
                          <Frase a={a} conUsuario={false} />
                        </span>
                        <span className="block text-[12px] text-texto-suave">
                          {fechaHoraAuditoria(a.en)} · {a.usuario}
                        </span>
                      </span>
                      {a.cambios.length > 0 && (
                        <span className="self-center text-[12px] font-semibold whitespace-nowrap text-acento">
                          {textoCambios(a.cambios.length)}
                        </span>
                      )}
                    </button>
                    {abierta && (
                      <div className="mb-3 rounded-md border border-borde px-3">
                        <ListaCambios cambios={a.cambios} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-borde p-3 text-[12px] text-texto-suave">
          {veAuditoria ? (
            <Link
              href={`/auditoria?vista=expedientes&exp=cotizacion:${cotizacionId}`}
              className={`${clasesBoton('fantasma', 'chico')} w-full`}
            >
              Ver expediente completo en Auditoría
              <Icon name="derecha" size={16} />
            </Link>
          ) : (
            <p className="px-1">Sólo se muestra lo que tu rol puede ver.</p>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
