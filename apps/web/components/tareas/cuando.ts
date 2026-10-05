const zona = 'America/Mexico_City';
const fmt = (f: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...f, timeZone: zona });
const hora = fmt({ hour: '2-digit', minute: '2-digit' });
const fechaCorta = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dia = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

/** «Venció…», «Hoy 16:00», «Mañana 10:00» o «jue 8 oct 10:00», con su tono. */
export function cuando(venceEn: string): { texto: string; tono: 'peligro' | 'aviso' | 'neutro' } {
  const v = new Date(venceEn);
  const hoy = dia.format(new Date());
  const manana = dia.format(new Date(Date.now() + 86_400_000));
  const d = dia.format(v);
  if (v.getTime() < Date.now())
    return { texto: `Venció ${d === hoy ? `hoy ${hora.format(v)}` : fechaCorta.format(v)}`, tono: 'peligro' };
  if (d === hoy) return { texto: `Hoy ${hora.format(v)}`, tono: 'aviso' };
  if (d === manana) return { texto: `Mañana ${hora.format(v)}`, tono: 'neutro' };
  return { texto: `${fechaCorta.format(v)} ${hora.format(v)}`, tono: 'neutro' };
}

export const TONOS_CUANDO = {
  peligro: 'bg-peligro-suave text-peligro',
  aviso: 'bg-aviso-suave text-aviso',
  neutro: 'bg-neutro-suave text-neutro',
};
