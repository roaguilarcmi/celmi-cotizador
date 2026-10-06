'use client';

import { useState, type KeyboardEvent } from 'react';
import { Icon } from '@/components/Icon';
import { Boton } from '@/components/ui';

/** Captura de subtareas al crear la tarea principal (se guardan junto con ella). */
export function SubtareasNuevas({ inicial = [] }: { inicial?: string[] }) {
  const [lista, setLista] = useState<string[]>(inicial);
  const [titulo, setTitulo] = useState('');

  const agregar = () => {
    const t = titulo.trim();
    if (t.length < 2 || lista.length >= 30) return;
    setLista((xs) => [...xs, t]);
    setTitulo('');
  };
  const alPresionar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Enter agrega la subtarea; no envía la tarea
      agregar();
    }
  };

  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-texto-suave">
        Subtareas <span className="font-normal">(opcional; Enter para agregar cada una)</span>
      </legend>
      <input type="hidden" name="subtareas" value={JSON.stringify(lista)} />
      {lista.length > 0 && (
        <ul className="mb-1.5 flex flex-col">
          {lista.map((s, i) => (
            <li
              key={`${i}-${s}`}
              className="flex min-h-10 items-center gap-2.5 border-b border-borde/70 px-1"
            >
              <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-texto/25" />
              <span className="min-w-0 flex-1 truncate text-sm">{s}</span>
              <button
                type="button"
                onClick={() => setLista((xs) => xs.filter((_, j) => j !== i))}
                aria-label={`Quitar «${s}»`}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-peligro"
              >
                <Icon name="cerrar" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2.5 px-1">
        <span className="inline-flex size-4 shrink-0 items-center justify-center text-acento-texto">
          <Icon name="mas" size={16} strokeWidth={2.4} />
        </span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={alPresionar}
          maxLength={200}
          autoComplete="off"
          aria-label="Agregar subtarea"
          placeholder="Ej. «Pedir precio a CVA»"
          className="h-10 min-w-0 flex-1 rounded-md border-2 border-dashed border-texto/15 bg-transparent px-3 text-sm outline-none placeholder:text-texto-suave focus:border-solid focus:border-acento focus:bg-superficie focus:ring-4 focus:ring-acento-suave"
        />
        {titulo.trim().length >= 2 && (
          <Boton tamano="chico" onClick={agregar}>
            Agregar
          </Boton>
        )}
      </div>
    </fieldset>
  );
}
