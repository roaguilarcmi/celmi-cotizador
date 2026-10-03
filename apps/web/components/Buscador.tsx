'use client';

import { Icon } from './Icon';
import { Tecla } from './ui';

/** Campo de búsqueda con ícono; `/` lo enfoca desde cualquier parte de la página. */
export function Buscador({
  valor,
  onCambio,
  placeholder,
  etiqueta = 'Buscar',
}: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder: string;
  etiqueta?: string;
}) {
  return (
    <label className="flex min-h-11 w-full max-w-md items-center gap-2.5 rounded-md border border-borde bg-superficie px-3 text-texto-suave focus-within:border-acento focus-within:ring-4 focus-within:ring-acento-suave">
      <Icon name="buscar" />
      <span className="sr-only">{etiqueta}</span>
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        data-buscador
        className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-suave"
      />
      <Tecla>/</Tecla>
    </label>
  );
}

/** Normaliza para buscar sin importar acentos ni mayúsculas. */
export const paraBuscar = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
