import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type Tono = 'exito' | 'aviso' | 'peligro' | 'info' | 'neutro';

const TONOS: Record<Tono, string> = {
  exito: 'bg-exito-suave text-exito',
  aviso: 'bg-aviso-suave text-aviso',
  peligro: 'bg-peligro-suave text-peligro',
  info: 'bg-info-suave text-info',
  neutro: 'bg-neutro-suave text-neutro',
};

export function Pill({ tono, children, punto = true }: { tono: Tono; children: ReactNode; punto?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs leading-4 font-semibold ${TONOS[tono]}`}
    >
      {punto && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/**
 * Botones de toda la interfaz (decisión 2026-10-06: homogéneos; no se estilizan botones a mano).
 *   primario: acción principal · secundario: acción normal (con borde) · peligro: acción destructiva con borde ·
 *   peligroFuerte: confirmación final de algo destructivo · exito: completar · fantasma: «Cancelar» y acciones discretas ·
 *   paso: avanzar en el wizard.
 */
export type Variante =
  'primario' | 'secundario' | 'peligro' | 'peligroFuerte' | 'exito' | 'fantasma' | 'paso';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acento text-sobre-acento hover:brightness-110 active:brightness-95',
  secundario: 'border border-borde bg-superficie text-texto hover:bg-superficie-2',
  peligro: 'border border-borde bg-superficie text-peligro hover:bg-peligro-suave',
  peligroFuerte: 'bg-peligro text-white hover:brightness-110 active:brightness-95',
  exito: 'bg-exito text-white hover:brightness-110 active:brightness-95',
  fantasma: 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
  paso: 'bg-paso text-white hover:brightness-110 active:brightness-95',
};

/** normal: 44 px (formularios y ventanas) · chico: 40 px (barras de herramientas y filas). */
export type TamanoBoton = 'normal' | 'chico';

const TAMANOS: Record<TamanoBoton, string> = {
  normal: 'min-h-11 px-4 text-sm',
  chico: 'min-h-10 px-3.5 text-[13px]',
};

const RELLENOS = new Set<Variante>(['primario', 'peligroFuerte', 'exito', 'paso']);

/** Clases de `Boton`, para enlaces (`Link`, `a`) que deben verse como botón. */
export function clasesBoton(variante: Variante = 'secundario', tamano: TamanoBoton = 'normal') {
  return `inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-[filter,background-color,transform] duration-150 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 ${TAMANOS[tamano]} ${VARIANTES[variante]}`;
}

export function Boton({
  variante = 'secundario',
  tamano = 'normal',
  icono,
  iconoFinal,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamano?: TamanoBoton;
  icono?: IconName;
  iconoFinal?: IconName;
}) {
  const icon = tamano === 'chico' ? 16 : 18;
  return (
    <button type="button" {...props} className={`${clasesBoton(variante, tamano)} ${className ?? ''}`}>
      {icono && <Icon name={icono} size={icon} strokeWidth={RELLENOS.has(variante) ? 2.2 : undefined} />}
      {children}
      {iconoFinal && <Icon name={iconoFinal} size={icon} strokeWidth={2.2} />}
    </button>
  );
}

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-borde bg-superficie sombra ${className ?? ''}`}>
      {children}
    </section>
  );
}

export function Titulo2({ children }: { children: ReactNode }) {
  return <h2 className="text-[17px] font-bold tracking-tight">{children}</h2>;
}

export function Tecla({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-[5px] border border-b-2 border-borde bg-superficie-2 px-1.5 py-px text-[11px] font-medium text-texto-suave">
      {children}
    </kbd>
  );
}

export function Avatar({
  iniciales,
  color,
  tamano = 32,
}: {
  iniciales: string;
  color: string;
  tamano?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: tamano, height: tamano, background: color, fontSize: Math.round(tamano * 0.38) }}
    >
      {iniciales}
    </span>
  );
}
