'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Campo, Mensaje } from '@/components/formulario';
import { Icon } from '@/components/Icon';
import { Boton } from '@/components/ui';
import type { ClienteFila } from '@/lib/datos';
import { crearContacto } from '../../clientes/acciones';

/** Tratamientos frecuentes (se puede escribir otro). */
const TRATAMIENTOS = ['Lic.', 'Ing.', 'C.P.', 'Arq.', 'Mtro.', 'Mtra.', 'Dr.', 'Dra.', 'Sr.', 'Sra.'];

const nombreCompleto = (k: ClienteFila['contactos'][number]) =>
  [k.tratamiento, k.nombre].filter(Boolean).join(' ');

/**
 * Quién solicita la oportunidad (decisión 2026-10-07): una misma empresa tiene contactos de distintas áreas. Se elige
 * uno de los registrados o se da de alta uno nuevo ahí mismo (tratamiento, nombre completo, puesto, teléfono y correo).
 */
export function SeleccionContacto({
  cliente,
  contactoId,
  onElegir,
  puedeCrear,
}: {
  cliente: ClienteFila;
  /** '' = sin contacto. */
  contactoId: string;
  onElegir: (id: string) => void;
  puedeCrear: boolean;
}) {
  const [nuevo, setNuevo] = useState(cliente.contactos.length === 0 && puedeCrear);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const agregar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    const datos = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await crearContacto(cliente.id, datos);
      if (r.error || !r.id) return setError(r.error ?? 'No se pudo agregar el contacto.');
      setError(null);
      setNuevo(false);
      onElegir(r.id);
    });
  };

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto text-[15px] font-bold">¿Quién lo solicita?</h3>
        {puedeCrear && !nuevo && (
          <Boton tamano="chico" icono="mas" onClick={() => setNuevo(true)}>
            Nuevo contacto
          </Boton>
        )}
      </div>

      {cliente.contactos.length > 0 && (
        <div role="radiogroup" aria-label="Contacto que solicita" className="grid gap-2.5 sm:grid-cols-2">
          {cliente.contactos.map((k) => {
            const activo = contactoId === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => onElegir(k.id)}
                className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-3.5 text-left transition-colors ${
                  activo
                    ? 'border-acento bg-acento-suave/50'
                    : 'border-borde bg-superficie hover:border-acento/40'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    activo ? 'border-acento bg-acento text-sobre-acento' : 'border-borde'
                  }`}
                >
                  {activo && <Icon name="palomita" size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0 text-[13px]">
                  <span className="block text-sm font-bold">{nombreCompleto(k)}</span>
                  {k.puesto && <span className="block text-texto-suave">{k.puesto}</span>}
                  <span className="mt-1 flex flex-wrap gap-x-3 text-texto-suave">
                    {k.telefono && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="telefono" size={13} />
                        {k.telefono}
                      </span>
                    )}
                    {k.correo && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Icon name="mensaje" size={13} />
                        <span className="truncate">{k.correo}</span>
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={contactoId === ''}
            onClick={() => onElegir('')}
            className={`flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed p-3.5 text-left text-[13px] transition-colors ${
              contactoId === ''
                ? 'border-acento bg-acento-suave/40'
                : 'border-borde text-texto-suave hover:border-acento/40'
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                contactoId === '' ? 'border-acento bg-acento text-sobre-acento' : 'border-borde'
              }`}
            >
              {contactoId === '' && <Icon name="palomita" size={12} strokeWidth={3} />}
            </span>
            Sin contacto por ahora
          </button>
        </div>
      )}

      {cliente.contactos.length === 0 && !nuevo && (
        <p className="rounded-md border border-dashed border-borde px-4 py-3 text-[13px] text-texto-suave">
          {cliente.razon_social} aún no tiene contactos registrados.
        </p>
      )}

      {nuevo && (
        <form
          onSubmit={agregar}
          className="animar-entrada mt-3 rounded-md border-2 border-acento/30 bg-acento-suave/20 p-4"
        >
          <p className="mb-3 text-sm font-bold">Nuevo contacto de {cliente.razon_social}</p>
          {error && (
            <div className="mb-3">
              <Mensaje>{error}</Mensaje>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <Campo
              etiqueta="Tratamiento"
              name="tratamiento"
              placeholder="Ing."
              list="tratamientos"
              autoComplete="off"
            />
            <Campo etiqueta="Nombre completo" name="nombre" required autoFocus autoComplete="off" />
          </div>
          <datalist id="tratamientos">
            {TRATAMIENTOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Puesto o área" name="puesto" autoComplete="off" placeholder="Ej. Compras" />
            <Campo etiqueta="Teléfono" name="telefono" type="tel" autoComplete="off" />
            <Campo etiqueta="Correo electrónico" name="correo" type="email" autoComplete="off" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Boton type="submit" variante="primario" icono="mas" disabled={pendiente}>
              {pendiente ? 'Agregando…' : 'Agregar y elegir'}
            </Boton>
            {cliente.contactos.length > 0 && (
              <Boton variante="fantasma" onClick={() => setNuevo(false)}>
                Cancelar
              </Boton>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
