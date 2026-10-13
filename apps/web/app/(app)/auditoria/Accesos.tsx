import {
  accesosDesdeRedNueva,
  dispositivoDeAgente,
  EVENTOS_ACCESO,
  fechaHoraAuditoria,
  ipParcial,
  rachasFallidas,
  type Acceso,
} from '@celmi/core';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui';

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
const DIA_MS = 24 * 3600 * 1000;
const MOSTRAR = 100;

/** Cifras de la pestaña (se calculan con la hora actual, fuera del render). */
function resumen(accesos: Acceso[], nombres: Record<string, string>) {
  const ahora = Date.now();
  const hace = (dias: number) => accesos.filter((a) => ahora - new Date(a.en).getTime() <= dias * DIA_MS);
  const hoy = DIA.format(new Date());
  const iniciosHoy = accesos.filter((a) => a.evento === 'inicio' && DIA.format(new Date(a.en)) === hoy);
  const fallidos7 = hace(7).filter((a) => a.evento === 'fallido' || a.evento === 'bloqueo');
  const porCorreo = new Map<string, number>();
  for (const a of fallidos7) {
    const c = (a.correo ?? '—').toLowerCase();
    porCorreo.set(c, (porCorreo.get(c) ?? 0) + 1);
  }
  const maxCorreo = Math.max(0, ...porCorreo.values());
  const restablecidas = hace(30).filter((a) => a.evento === 'mfa_restablecido');
  const redNueva = accesosDesdeRedNueva(accesos);
  const redNueva7 = hace(7).filter((a) => redNueva.has(a.id));
  const racha = rachasFallidas(hace(7))[0];
  const cuenta = (a: Pick<Acceso, 'usuarioId' | 'correo'>) =>
    (a.usuarioId && nombres[a.usuarioId]) || a.correo || 'Cuenta desconocida';
  const cuentaExiste = racha
    ? accesos.some((a) => a.correo?.toLowerCase() === racha.correo && a.usuarioId)
    : false;

  return {
    hace,
    iniciosHoy,
    fallidos7,
    maxCorreo,
    restablecidas,
    redNueva,
    redNueva7,
    racha,
    cuenta,
    cuentaExiste,
  };
}

/** Pestaña «Accesos»: indicadores, aviso de algo raro y el registro de inicios, cierres, fallos y 2FA. */
export function Accesos({ accesos, nombres }: { accesos: Acceso[]; nombres: Record<string, string> }) {
  const {
    iniciosHoy,
    fallidos7,
    maxCorreo,
    restablecidas,
    redNueva,
    redNueva7,
    racha,
    cuenta,
    cuentaExiste,
  } = resumen(accesos, nombres);
  const kpis = [
    {
      t: 'Inicios de sesión hoy',
      v: iniciosHoy.length,
      s: `${new Set(iniciosHoy.map((a) => a.usuarioId)).size} ${new Set(iniciosHoy.map((a) => a.usuarioId)).size === 1 ? 'persona' : 'personas'}`,
      tono: 'text-texto',
    },
    {
      t: 'Intentos fallidos (7 días)',
      v: fallidos7.length,
      s: fallidos7.length ? `Máximo ${maxCorreo} de un mismo correo` : 'Sin intentos fallidos',
      tono: fallidos7.length ? 'text-peligro' : 'text-texto',
    },
    {
      t: '2FA restablecidas (30 días)',
      v: restablecidas.length,
      s: restablecidas.length ? [...new Set(restablecidas.map(cuenta))].join(', ') : 'Ninguna',
      tono: restablecidas.length ? 'text-aviso' : 'text-texto',
    },
    {
      t: 'Desde una red nueva (7 días)',
      v: redNueva7.length,
      s: redNueva7.length ? 'Revisa si las reconoces' : 'Todo desde redes conocidas',
      tono: redNueva7.length ? 'text-aviso' : 'text-texto',
    },
  ];

  return (
    <div className="pb-2">
      <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.t} className="rounded-lg border border-borde p-4">
            <p className="text-[12px] font-semibold text-texto-suave">{k.t}</p>
            <p className={`tabular mt-1 text-[28px] leading-none font-extrabold ${k.tono}`}>{k.v}</p>
            <p className="mt-1.5 truncate text-[12px] text-texto-suave" title={k.s}>
              {k.s}
            </p>
          </div>
        ))}
      </div>

      {racha && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-peligro/30 bg-peligro-suave px-4 py-3 text-[13px]">
          <Icon name="campana" size={18} className="mt-0.5 shrink-0 text-peligro" />
          <p>
            <b>{racha.intentos} intentos fallidos seguidos</b>{' '}
            {cuentaExiste
              ? `con la cuenta ${racha.correo}`
              : `con un correo que no está dado de alta (${racha.correo})`}
            , el {fechaHoraAuditoria(racha.desde)}
            {racha.desde !== racha.hasta && ` a ${fechaHoraAuditoria(racha.hasta).split(', ')[1]}`}.{' '}
            {cuentaExiste
              ? 'Si no fue esa persona, pídele cambiar su contraseña; la 2FA impide el acceso sin su celular.'
              : 'No se requiere acción: la cuenta no existe.'}
          </p>
        </div>
      )}

      <div className="mt-4 overflow-x-auto border-t border-borde">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-superficie-2 text-left text-[11.5px] tracking-wide text-texto-suave uppercase">
              <th className="px-6 py-2.5 font-bold">Fecha</th>
              <th className="px-2 py-2.5 font-bold">Cuenta</th>
              <th className="px-2 py-2.5 font-bold">Evento</th>
              <th className="px-2 py-2.5 font-bold">Desde</th>
              <th className="px-6 py-2.5 font-bold">Dispositivo</th>
            </tr>
          </thead>
          <tbody>
            {accesos.slice(0, MOSTRAR).map((a) => {
              const e = EVENTOS_ACCESO[a.evento] ?? { texto: a.evento, tono: 'neutro' as const };
              return (
                <tr key={a.id} className="border-b border-borde last:border-0">
                  <td className="tabular px-6 py-2.5 whitespace-nowrap text-texto-suave">
                    {fechaHoraAuditoria(a.en)}
                  </td>
                  <td className="px-2 py-2.5 font-medium">{cuenta(a)}</td>
                  <td className="px-2 py-2.5">
                    <Pill tono={e.tono}>
                      {e.texto}
                      {a.realizadoPor &&
                        a.realizadoPor !== a.usuarioId &&
                        ` · por ${nombres[a.realizadoPor]?.split(' ')[0] ?? 'otra persona'}`}
                    </Pill>
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap text-texto-suave">
                    {ipParcial(a.ip)}
                    {redNueva.has(a.id) && (
                      <span className="ml-2">
                        <Pill tono="aviso">Red nueva</Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-2.5 whitespace-nowrap text-texto-suave">
                    {dispositivoDeAgente(a.agente)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {accesos.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-texto-suave">
            Sin accesos en los últimos 60 días.
          </p>
        )}
      </div>
      <p className="px-6 pt-3 text-[12px] text-texto-suave">
        Últimos 60 días{accesos.length > MOSTRAR ? ` · se muestran los ${MOSTRAR} más recientes` : ''}. Las IP
        se muestran sólo en parte.
      </p>
    </div>
  );
}
