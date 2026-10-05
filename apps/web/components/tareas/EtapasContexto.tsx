'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { EtapaTarea } from '@/lib/etapas-tareas';

/** Etapas de quien tiene la sesión: las carga el layout una vez y las usan tablero, listas y menús. */
const Contexto = createContext<EtapaTarea[]>([]);

export function EtapasTareas({ etapas, children }: { etapas: EtapaTarea[]; children: ReactNode }) {
  return <Contexto.Provider value={etapas}>{children}</Contexto.Provider>;
}

export const useEtapas = () => useContext(Contexto);
