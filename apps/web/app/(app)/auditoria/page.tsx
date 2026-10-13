import { MODULOS_AUDITORIA, type ModuloAuditoria } from '@celmi/core';
import Link from 'next/link';
import { EnConstruccion } from '@/components/EnConstruccion';
import { Icon, type IconName } from '@/components/Icon';
import { clasesBoton, Tarjeta } from '@/components/ui';
import {
  consultarAccesos,
  consultarAuditoria,
  consultarExpedientes,
  haceDias,
  nombresAuditoria,
  type FiltrosAuditoria,
} from '@/lib/auditoria';
import { exigirPermiso, obtenerSesion } from '@/lib/sesion';
import { Accesos } from './Accesos';
import { Filtros } from './Filtros';
import { PERIODOS, type Periodo } from './periodos';
import { VistaExpedientes } from './VistaExpedientes';
import { VistaLinea } from './VistaLinea';
import { VistaTabla } from './VistaTabla';

export const metadata = { title: 'Auditoría' };
export const dynamic = 'force-dynamic';

type Vista = 'linea' | 'tabla' | 'expedientes';
const VISTAS: { id: Vista; texto: string; icono: IconName }[] = [
  { id: 'linea', texto: 'Línea de tiempo', icono: 'reloj' },
  { id: 'tabla', texto: 'Tabla', icono: 'columnas' },
  { id: 'expedientes', texto: 'Por expediente', icono: 'catalogos' },
];

const esUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sesion = await obtenerSesion();
  if (sesion.demo) return <EnConstruccion slug="auditoria" />;
  await exigirPermiso('auditoria.ver');

  const p = await searchParams;
  const pestana = uno(p.pestana) === 'accesos' ? 'accesos' : 'cambios';
  const vista: Vista =
    (['linea', 'tabla', 'expedientes'] as const).find((v) => v === uno(p.vista)) ?? 'linea';
  const texto = uno(p.q).trim().slice(0, 100);
  const quien = esUuid(uno(p.quien)) ? uno(p.quien) : '';
  const que = (Object.keys(MODULOS_AUDITORIA) as ModuloAuditoria[]).find((m) => m === uno(p.que)) ?? '';
  const cuando: Periodo = (Object.keys(PERIODOS) as Periodo[]).find((x) => x === uno(p.cuando)) ?? '30';
  const sensible = uno(p.sensible) === '1';
  const antes = uno(p.antes);
  const antesValido = antes && !Number.isNaN(new Date(antes).getTime()) ? antes : '';

  // Parámetros que se conservan al cambiar de vista o de pestaña.
  const comunes = new URLSearchParams();
  if (texto) comunes.set('q', texto);
  if (quien) comunes.set('quien', quien);
  if (que) comunes.set('que', que);
  if (cuando !== '30') comunes.set('cuando', cuando);
  if (sensible) comunes.set('sensible', '1');
  const enlace = (extra: Record<string, string>) => {
    const u = new URLSearchParams(comunes);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return `/auditoria?${u.toString()}`;
  };

  const nombres = await nombresAuditoria();
  const dias = PERIODOS[cuando].dias;
  const filtros: FiltrosAuditoria = {
    ...(dias ? { desde: haceDias(dias) } : {}),
    ...(antesValido ? { antes_de: antesValido } : {}),
    ...(quien ? { usuario: quien } : {}),
    ...(que ? { tablas: MODULOS_AUDITORIA[que].tablas } : {}),
    ...(texto ? { texto } : {}),
    ...(sensible ? { sensible: true } : {}),
  };

  let cuerpo: React.ReactNode;
  if (pestana === 'accesos') {
    cuerpo = <Accesos accesos={await consultarAccesos(60)} nombres={nombres.perfiles ?? {}} />;
  } else if (vista === 'expedientes') {
    const buscar = uno(p.buscar).trim().slice(0, 100);
    const [tipo, id] = uno(p.exp).split(':');
    const tipoValido = (['cotizacion', 'oportunidad', 'cliente', 'usuario'] as const).find((t) => t === tipo);
    const seleccion = tipoValido && esUuid(id ?? '') ? { tipo: tipoValido, id: id! } : null;
    const [expedientes, eventos] = await Promise.all([
      consultarExpedientes(buscar || null),
      seleccion
        ? consultarAuditoria(
            { [seleccion.tipo === 'usuario' ? 'perfil' : seleccion.tipo]: seleccion.id },
            nombres,
            200,
          )
        : null,
    ]);
    cuerpo = (
      <VistaExpedientes
        expedientes={expedientes}
        seleccion={seleccion}
        acciones={eventos?.acciones ?? []}
        buscar={buscar}
      />
    );
  } else {
    const { acciones, siguiente } = await consultarAuditoria(filtros, nombres);
    const paginas = (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde px-6 py-3 text-[13px] text-texto-suave">
        <span>
          {acciones.length === 0
            ? 'Sin registros con estos filtros.'
            : `${acciones.length} ${acciones.length === 1 ? 'acción' : 'acciones'}${antesValido ? ' anteriores' : ''}`}
        </span>
        <span className="flex gap-2">
          {antesValido && (
            <Link href={enlace({ vista })} className={clasesBoton('fantasma', 'chico')}>
              <Icon name="arriba" size={16} />
              Lo más reciente
            </Link>
          )}
          {siguiente && (
            <Link href={enlace({ vista, antes: siguiente })} className={clasesBoton('fantasma', 'chico')}>
              Más antiguas
              <Icon name="abajo" size={16} />
            </Link>
          )}
        </span>
      </div>
    );
    cuerpo = (
      <>
        <Filtros
          personas={nombres.lista}
          valores={{ q: texto, quien, que, cuando, sensible }}
          vista={vista}
        />
        {vista === 'tabla' ? <VistaTabla acciones={acciones} /> : <VistaLinea acciones={acciones} />}
        {paginas}
      </>
    );
  }

  return (
    <div className="animar-entrada mx-auto max-w-[1240px]">
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde px-6 pt-5">
          <div className="mr-auto pb-4">
            <h1 className="text-[22px] font-bold tracking-tight">Auditoría</h1>
            <p className="text-[13px] text-texto-suave">
              Todo lo que pasa en el cotizador queda registrado y nadie lo puede alterar ni borrar.
            </p>
          </div>
          <nav aria-label="Secciones de la auditoría" className="flex gap-1">
            {[
              { id: 'cambios', texto: 'Cambios', icono: 'auditoria' as IconName, href: enlace({ vista }) },
              {
                id: 'accesos',
                texto: 'Accesos',
                icono: 'llave' as IconName,
                href: '/auditoria?pestana=accesos',
              },
            ].map((x) => (
              <Link
                key={x.id}
                href={x.href}
                aria-current={pestana === x.id ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${
                  pestana === x.id
                    ? 'border-acento text-texto'
                    : 'border-transparent text-texto-suave hover:text-texto'
                }`}
              >
                <Icon name={x.icono} size={16} />
                {x.texto}
              </Link>
            ))}
          </nav>
        </div>

        {pestana === 'cambios' && (
          <div className="flex flex-wrap items-center gap-2 border-b border-borde px-6 py-3">
            <span className="mr-1 text-[12px] font-bold tracking-wide text-texto-suave uppercase">
              Ver como
            </span>
            <div role="tablist" className="inline-flex rounded-md border border-borde bg-superficie-2 p-0.5">
              {VISTAS.map((v) => (
                <Link
                  key={v.id}
                  role="tab"
                  aria-selected={vista === v.id}
                  href={v.id === 'expedientes' ? '/auditoria?vista=expedientes' : enlace({ vista: v.id })}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-[5px] px-3.5 text-[13px] font-semibold ${
                    vista === v.id ? 'bg-superficie text-texto sombra' : 'text-texto-suave hover:text-texto'
                  }`}
                >
                  <Icon name={v.icono} size={15} />
                  {v.texto}
                </Link>
              ))}
            </div>
          </div>
        )}
        {cuerpo}
      </Tarjeta>
    </div>
  );
}
