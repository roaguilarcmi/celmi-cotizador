'use client';

import { fechaHoraAuditoria, MODULOS_AUDITORIA, moduloDeTabla } from '@celmi/core';
import { useState } from 'react';
import { DetalleAccion, Persona } from '@/components/auditoria/Piezas';
import { Pill } from '@/components/ui';
import { VentanaFlotante } from '@/components/VentanaFlotante';
import type { AccionVista } from '@/lib/auditoria';

const modulo = (a: AccionVista) => {
  const m = a.tablas.map(moduloDeTabla).find(Boolean);
  return m ? MODULOS_AUDITORIA[m].nombre : '—';
};

/** «autorizó la» → «Autorizó». */
const accionCorta = (a: AccionVista) => {
  const v = a.verbo.split(' ')[0] ?? '';
  return v.charAt(0).toUpperCase() + v.slice(1);
};

/** Vista B · Tabla de registro con el detalle de la acción elegida en el panel derecho. */
export function VistaTabla({ acciones }: { acciones: AccionVista[] }) {
  const [elegida, setElegida] = useState<string | null>(acciones[0]?.clave ?? null);
  const [flotante, setFlotante] = useState(false);
  const actual = acciones.find((a) => a.clave === elegida) ?? null;
  // En pantallas angostas el panel queda debajo de la tabla: el detalle se abre en una ventana.
  const elegir = (clave: string) => {
    setElegida(clave);
    if (!window.matchMedia('(min-width: 1024px)').matches) setFlotante(true);
  };
  if (acciones.length === 0)
    return (
      <p className="px-6 py-14 text-center text-sm text-texto-suave">No hay registros con estos filtros.</p>
    );
  return (
    <div className="grid border-t border-borde lg:grid-cols-[1fr_400px]">
      <div className="self-start overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-superficie-2 text-left text-[11.5px] tracking-wide text-texto-suave uppercase">
              <th className="px-4 py-2.5 font-bold">Fecha</th>
              <th className="px-2 py-2.5 font-bold">Quién</th>
              <th className="px-2 py-2.5 font-bold">Módulo</th>
              <th className="px-2 py-2.5 font-bold">Registro</th>
              <th className="px-4 py-2.5 font-bold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {acciones.map((a) => {
              const sel = a.clave === elegida;
              return (
                <tr
                  key={a.clave}
                  onClick={() => elegir(a.clave)}
                  aria-selected={sel}
                  className={`cursor-pointer border-b border-borde hover:bg-superficie-2 ${
                    sel ? 'bg-info-suave/60 shadow-[inset_3px_0_0_var(--color-acento)]' : ''
                  }`}
                >
                  <td className="tabular px-4 py-2.5 whitespace-nowrap text-texto-suave">
                    {fechaHoraAuditoria(a.en).replace(/ \d{4},/, '')}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Persona a={a} tamano={24} />
                      {a.usuario.split(' ')[0]}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap text-texto-suave">{modulo(a)}</td>
                  <td className="max-w-[300px] px-2 py-2.5">
                    <button
                      type="button"
                      className="block w-full cursor-pointer truncate text-left font-medium"
                    >
                      {[a.objeto, a.contexto].filter(Boolean).join(' · ') || '—'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <Pill tono={a.tono}>{accionCorta(a)}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <aside
        aria-label="Detalle del cambio"
        className="hidden border-borde bg-superficie p-4 lg:sticky lg:block lg:top-0 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:border-t-0 lg:border-l"
      >
        {actual ? (
          <DetalleAccion a={actual} />
        ) : (
          <p className="py-10 text-center text-sm text-texto-suave">Elige un registro para ver su detalle.</p>
        )}
      </aside>
      {flotante && actual && (
        <VentanaFlotante titulo="Detalle del cambio" onCerrar={() => setFlotante(false)}>
          <DetalleAccion a={actual} />
        </VentanaFlotante>
      )}
    </div>
  );
}
