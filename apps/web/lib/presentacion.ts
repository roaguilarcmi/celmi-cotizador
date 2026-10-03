import type { Tono } from '@/components/ui';

/** Color de cada estado de oportunidad (los estados son configurables: los nuevos usan el neutro). */
const TONOS_ESTADO: Record<string, Tono> = {
  nueva: 'neutro',
  en_preparacion: 'info',
  pendiente_autorizacion: 'aviso',
  autorizada: 'exito',
  enviada: 'info',
  en_negociacion: 'info',
  ganada: 'exito',
  perdida: 'peligro',
  abandonada: 'neutro',
  cancelada: 'neutro',
};

export const tonoEstado = (id: string): Tono => TONOS_ESTADO[id] ?? 'neutro';

const zona = 'America/Mexico_City';

export function haceCuanto(fecha: string | Date): string {
  const minutos = Math.round((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return fechaCorta(fecha);
}

export function fechaCorta(fecha: string | Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: zona,
  }).format(new Date(fecha));
}

export function fechaHora(fecha: string | Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zona,
  }).format(new Date(fecha));
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const COLORES_AVATAR = [
  '#7C3AED',
  '#0E7490',
  '#BE185D',
  '#B45309',
  '#1D5BD8',
  '#047857',
  '#9333EA',
  '#C2410C',
];

/** Color estable por persona (mismo nombre → mismo color en toda la app). */
export function colorAvatar(clave: string): string {
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_AVATAR[h % COLORES_AVATAR.length]!;
}
