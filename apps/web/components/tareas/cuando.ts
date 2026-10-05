const zona = 'America/Mexico_City';
const fmt = (f: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...f, timeZone: zona });
const hora = fmt({ hour: '2-digit', minute: '2-digit' });
const fechaCorta = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dia = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

export type Tono = 'peligro' | 'aviso' | 'neutro' | 'vacio';

/**
 * «Venció…», «Hoy 16:00», «Mañana», «jue 8 oct 10:00» o «Sin fecha», con su tono. Sin hora (`sinHora`) sólo se
 * muestra el día (vence al final de ese día).
 */
export function cuando(venceEn: string | null, sinHora = false): { texto: string; tono: Tono } {
  if (!venceEn) return { texto: 'Sin fecha', tono: 'vacio' };
  const v = new Date(venceEn);
  const conHora = (texto: string) => (sinHora ? texto : `${texto} ${hora.format(v)}`);
  const hoy = dia.format(new Date());
  const manana = dia.format(new Date(Date.now() + 86_400_000));
  const d = dia.format(v);
  if (v.getTime() < Date.now())
    return { texto: `Venció ${d === hoy ? conHora('hoy') : fechaCorta.format(v)}`, tono: 'peligro' };
  if (d === hoy) return { texto: conHora('Hoy'), tono: 'aviso' };
  if (d === manana) return { texto: conHora('Mañana'), tono: 'neutro' };
  return { texto: conHora(fechaCorta.format(v)), tono: 'neutro' };
}

export const TONOS_CUANDO: Record<Tono, string> = {
  peligro: 'bg-peligro-suave text-peligro',
  aviso: 'bg-aviso-suave text-aviso',
  neutro: 'bg-neutro-suave text-neutro',
  vacio: 'border border-dashed border-texto/25 text-texto-suave',
};
