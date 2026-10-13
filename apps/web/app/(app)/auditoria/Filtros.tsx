'use client';

import { MODULOS_AUDITORIA, type ModuloAuditoria } from '@celmi/core';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { PERIODOS, type Periodo } from './periodos';

interface Valores {
  q: string;
  quien: string;
  que: ModuloAuditoria | '';
  cuando: Periodo;
  sensible: boolean;
}

const selectClases =
  'min-h-10 cursor-pointer appearance-none rounded-md border border-borde bg-superficie py-0 pr-8 pl-3 text-[13px] font-semibold text-texto hover:bg-superficie-2';

function Selector({
  etiqueta,
  valor,
  onChange,
  children,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={selectClases}
        aria-label={etiqueta}
      >
        {children}
      </select>
      <Icon name="abajo" size={14} className="pointer-events-none absolute right-2.5 text-texto-suave" />
    </label>
  );
}

/** Filtros de la auditoría: se aplican al cambiarlos (la búsqueda, con Enter). */
export function Filtros({
  personas,
  valores,
  vista,
}: {
  personas: { id: string; nombre: string }[];
  valores: Valores;
  vista: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [cargando, iniciar] = useTransition();
  const [texto, setTexto] = useState(valores.q);

  const aplicar = (cambio: Partial<Valores>) => {
    const v = { ...valores, q: texto, ...cambio };
    const u = new URLSearchParams();
    if (vista !== 'linea') u.set('vista', vista);
    if (v.q.trim()) u.set('q', v.q.trim());
    if (v.quien) u.set('quien', v.quien);
    if (v.que) u.set('que', v.que);
    if (v.cuando !== '30') u.set('cuando', v.cuando);
    if (v.sensible) u.set('sensible', '1');
    iniciar(() => router.push(`${ruta}?${u.toString()}`));
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 px-6 py-3 ${cargando ? 'opacity-70' : ''}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar({ q: texto });
        }}
        className="flex min-h-10 w-full items-center gap-2 rounded-md border border-borde bg-superficie px-3 text-[13px] focus-within:border-acento sm:w-[300px]"
      >
        <Icon name="buscar" size={16} className="text-texto-suave" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Folio, cliente, partida o persona…"
          autoComplete="off"
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-texto-suave"
          aria-label="Buscar en la auditoría"
        />
      </form>
      <Selector etiqueta="Quién" valor={valores.quien} onChange={(quien) => aplicar({ quien })}>
        <option value="">Quién: todos</option>
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </Selector>
      <Selector
        etiqueta="Qué"
        valor={valores.que}
        onChange={(que) => aplicar({ que: que as ModuloAuditoria | '' })}
      >
        <option value="">Qué: todo</option>
        {(Object.entries(MODULOS_AUDITORIA) as [ModuloAuditoria, { nombre: string }][]).map(([k, m]) => (
          <option key={k} value={k}>
            {m.nombre}
          </option>
        ))}
      </Selector>
      <Selector
        etiqueta="Cuándo"
        valor={valores.cuando}
        onChange={(cuando) => aplicar({ cuando: cuando as Periodo })}
      >
        {(Object.entries(PERIODOS) as [Periodo, { texto: string }][]).map(([k, x]) => (
          <option key={k} value={k}>
            {x.texto}
          </option>
        ))}
      </Selector>
      <button
        type="button"
        aria-pressed={valores.sensible}
        onClick={() => aplicar({ sensible: !valores.sensible })}
        className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] font-semibold ${
          valores.sensible
            ? 'border-peligro/40 bg-peligro-suave text-peligro'
            : 'border-borde bg-superficie text-texto-suave hover:text-texto'
        }`}
      >
        <span className="size-1.5 rounded-full bg-current" />
        Sólo lo sensible
      </button>
      {(valores.q || valores.quien || valores.que || valores.sensible || valores.cuando !== '30') && (
        <button
          type="button"
          onClick={() => {
            setTexto('');
            aplicar({ q: '', quien: '', que: '', sensible: false, cuando: '30' });
          }}
          className="cursor-pointer px-2 text-[13px] font-semibold text-acento hover:underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
