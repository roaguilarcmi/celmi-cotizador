'use client';

import { useTiempoReal } from './Proveedor';

/** Punto «En vivo» / «Reconectando…» al pie del menú (Fase 8 · B). */
export function IndicadorEnVivo() {
  const tr = useTiempoReal();
  if (!tr) return null;
  const vivo = tr.estado === 'en_vivo';
  const texto = vivo ? 'En vivo' : tr.estado === 'conectando' ? 'Conectando…' : 'Reconectando…';
  return (
    <p
      role="status"
      title={vivo ? 'Los avisos llegan al instante' : 'Sin conexión en tiempo real: se reintenta solo'}
      className="hidden items-center gap-2 px-3 text-[11.5px] text-nav-texto lg:flex lg:compacto:justify-center lg:compacto:px-0"
    >
      <span className="relative inline-flex size-2 shrink-0">
        <span className={`relative size-2 rounded-full ${vivo ? 'bg-[#4ade80]' : 'bg-[#F5B544]'}`} />
      </span>
      <span className="lg:compacto:sr-only">{texto}</span>
    </p>
  );
}
