'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { BotonEnviar, Campo, Mensaje } from '@/components/formulario';
import { Icon, type IconName } from '@/components/Icon';
import { Avatar, Boton, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import {
  cambiarEstado,
  cambiarRol,
  darDeAlta,
  enlaceRecuperacion,
  restablecer2fa,
  type Resultado,
} from './acciones';

export interface FilaUsuario {
  id: string;
  nombre: string;
  correo: string;
  puesto: string;
  rolId: string;
  activo: boolean;
  con2fa: boolean;
  ultimoAcceso: string | null;
}

export interface OpcionRol {
  id: string;
  nombre: string;
}

const COLORES = ['#7C3AED', '#0E7490', '#BE185D', '#B45309', '#1D5BD8', '#047857'];
const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export function UsuariosAdmin({
  usuarios,
  roles,
  yo,
  demo,
}: {
  usuarios: FilaUsuario[];
  roles: OpcionRol[];
  yo: string;
  demo: boolean;
}) {
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [resultado, setResultado] = useState<Resultado>({});
  const [pendiente, iniciar] = useTransition();

  // Todas las acciones (alta incluida) muestran su resultado en el mismo lugar.
  const ejecutar = (accion: () => Promise<Resultado>) =>
    iniciar(async () => {
      setResultado(await accion());
    });

  const enviarAlta = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    ejecutar(async () => {
      const r = await darDeAlta({}, datos);
      if (r.enlace) setAltaAbierta(false);
      return r;
    });
  };

  const activos = usuarios.filter((u) => u.activo).length;
  const sin2fa = usuarios.filter((u) => u.activo && !u.con2fa).length;

  return (
    <div className="animar-entrada mx-auto max-w-[1440px]">
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Usuarios</h1>
          <p className="mt-1.5 text-sm text-texto-suave">
            Da de alta al equipo, entrega enlaces de acceso y restablece la verificación en dos pasos.
          </p>
        </div>
        <Boton
          variante="primario"
          icono="mas"
          onClick={() => setAltaAbierta((v) => !v)}
          aria-expanded={altaAbierta}
        >
          Nuevo usuario
        </Boton>
      </header>

      {resultado.enlace && <PanelEnlace enlace={resultado.enlace} onCerrar={() => setResultado({})} />}
      {!resultado.enlace && (resultado.error || resultado.ok) && (
        <div className="mb-4">
          <Mensaje tono={resultado.error ? 'peligro' : 'exito'}>{resultado.error ?? resultado.ok}</Mensaje>
        </div>
      )}

      {altaAbierta && (
        <Tarjeta className="animar-entrada mb-5 p-5.5">
          <Titulo2>Nuevo usuario</Titulo2>
          <p className="mt-1 mb-4 text-[13px] text-texto-suave">
            Se crea la cuenta sin enviar correos y obtienes un enlace para que la persona cree su contraseña y
            configure su 2FA.
          </p>
          <form onSubmit={enviarAlta} className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre completo" name="nombre" required autoComplete="off" />
            <Campo etiqueta="Correo corporativo" name="correo" type="email" required autoComplete="off" />
            <Campo etiqueta="Puesto" name="puesto" autoComplete="off" />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rol-alta" className="text-[13px] font-semibold">
                Rol
              </label>
              <select
                id="rol-alta"
                name="rol"
                required
                defaultValue="ejecutivo"
                className="h-12 rounded-md border border-borde bg-superficie px-3 text-[15px] text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <div className="w-full sm:w-64">
                <BotonEnviar ocupado={pendiente}>Crear y generar enlace</BotonEnviar>
              </div>
              <Boton onClick={() => setAltaAbierta(false)}>Cancelar</Boton>
            </div>
          </form>
        </Tarjeta>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Pill tono="neutro" punto={false}>
          {usuarios.length} usuarios
        </Pill>
        <Pill tono="exito" punto={false}>
          {activos} activos
        </Pill>
        {sin2fa > 0 && (
          <Pill tono="aviso" punto={false}>
            {sin2fa} sin 2FA configurada
          </Pill>
        )}
        {demo && (
          <Pill tono="neutro" punto={false}>
            Datos de muestra
          </Pill>
        )}
      </div>

      <Tarjeta className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="bg-superficie-2 text-left text-xs font-semibold text-texto-suave">
                {['Usuario', 'Rol', 'Verificación 2FA', 'Estado', 'Último acceso', 'Acciones'].map((t) => (
                  <th
                    key={t}
                    scope="col"
                    className={`border-b border-borde px-4 py-2.5 ${t === 'Acciones' ? 'text-right' : ''}`}
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => {
                const soyYo = u.id === yo;
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-borde last:border-0 ${u.activo ? '' : 'opacity-60'}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar
                          iniciales={iniciales(u.nombre)}
                          color={COLORES[i % COLORES.length]!}
                          tamano={36}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold">
                            {u.nombre}
                            {soyYo && (
                              <span className="ml-2 text-xs font-semibold text-acento-texto">Tú</span>
                            )}
                          </div>
                          <div className="truncate text-[13px] text-texto-suave">
                            {u.correo}
                            {u.puesto && ` · ${u.puesto}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <label className="sr-only" htmlFor={`rol-${u.id}`}>
                        Rol de {u.nombre}
                      </label>
                      <select
                        id={`rol-${u.id}`}
                        value={u.rolId}
                        disabled={soyYo || pendiente || demo}
                        onChange={(e) => ejecutar(() => cambiarRol(u.id, e.target.value))}
                        className="h-10 rounded-sm border border-borde bg-superficie px-2.5 text-[13px] font-medium text-texto outline-none focus:border-acento disabled:opacity-70"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3.5">
                      {u.con2fa ? <Pill tono="exito">Configurada</Pill> : <Pill tono="aviso">Pendiente</Pill>}
                    </td>
                    <td className="px-4 py-3.5">
                      {u.activo ? <Pill tono="exito">Activo</Pill> : <Pill tono="neutro">Desactivado</Pill>}
                    </td>
                    <td className="px-4 py-3.5 text-[13px] whitespace-nowrap text-texto-suave">
                      {u.ultimoAcceso ?? 'Nunca'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        {!soyYo && (
                          <>
                            <BotonIcono
                              icono="llave"
                              etiqueta={`Generar enlace de recuperación para ${u.nombre}`}
                              deshabilitado={pendiente || !u.activo || demo}
                              onClick={() => ejecutar(() => enlaceRecuperacion(u.id))}
                            />
                            <BotonIcono
                              icono="telefono"
                              etiqueta={`Restablecer la verificación en dos pasos de ${u.nombre}`}
                              confirmar
                              deshabilitado={pendiente || !u.con2fa || demo}
                              onClick={() => ejecutar(() => restablecer2fa(u.id))}
                            />
                            <BotonIcono
                              icono={u.activo ? 'candado' : 'palomita'}
                              etiqueta={u.activo ? `Desactivar a ${u.nombre}` : `Reactivar a ${u.nombre}`}
                              confirmar={u.activo}
                              peligro={u.activo}
                              deshabilitado={pendiente || demo}
                              onClick={() => ejecutar(() => cambiarEstado(u.id, !u.activo))}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      <p className="mt-3 text-xs text-texto-suave">
        Cada alta, enlace, restablecimiento y cambio de estado queda registrado con quién lo hizo.
      </p>
    </div>
  );
}

/** Botón de ícono; con `confirmar` pide un segundo clic antes de ejecutar. */
function BotonIcono({
  icono,
  etiqueta,
  onClick,
  deshabilitado,
  confirmar,
  peligro,
}: {
  icono: IconName;
  etiqueta: string;
  onClick: () => void;
  deshabilitado?: boolean;
  confirmar?: boolean;
  peligro?: boolean;
}) {
  const [esperando, setEsperando] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = window.setTimeout(() => setEsperando(false), 4000);
    return () => window.clearTimeout(t);
  }, [esperando]);

  if (esperando) {
    return (
      <button
        type="button"
        onClick={() => {
          setEsperando(false);
          onClick();
        }}
        className="inline-flex h-10 cursor-pointer items-center rounded-md bg-peligro px-3 text-[13px] font-semibold text-white"
      >
        ¿Confirmar?
      </button>
    );
  }
  return (
    <button
      type="button"
      title={etiqueta}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => (confirmar ? setEsperando(true) : onClick())}
      className={`inline-flex size-10 cursor-pointer items-center justify-center rounded-md border border-borde bg-superficie transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        peligro ? 'text-peligro hover:bg-peligro-suave' : 'text-texto hover:bg-superficie-2'
      }`}
    >
      <Icon name={icono} size={17} />
    </button>
  );
}

function PanelEnlace({
  enlace,
  onCerrar,
}: {
  enlace: NonNullable<Resultado['enlace']>;
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  return (
    <section
      aria-live="polite"
      className="animar-entrada mb-5 rounded-lg border-2 border-acento/40 bg-acento-suave/50 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-acento text-sobre-acento">
          <Icon name="enlace" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            {enlace.tipo === 'invite' ? 'Enlace de alta' : 'Enlace de recuperación'} para {enlace.para}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="enlace-generado">
              Enlace
            </label>
            <input
              id="enlace-generado"
              readOnly
              value={enlace.url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 min-w-0 flex-1 rounded-md border border-borde bg-superficie px-3 text-[13px] text-texto"
            />
            <Boton
              variante="primario"
              icono={copiado ? 'palomita' : 'copiar'}
              onClick={async () => {
                await navigator.clipboard.writeText(enlace.url);
                setCopiado(true);
              }}
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </Boton>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-texto-suave">
            Funciona <strong>una sola vez</strong> y vence en el tiempo configurado en Supabase (1 hora por
            omisión). Entrégalo por un canal interno y privado (mensaje directo de Teams o en persona); no lo
            publiques en grupos.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie"
        >
          <Icon name="cerrar" size={18} />
        </button>
      </div>
    </section>
  );
}
