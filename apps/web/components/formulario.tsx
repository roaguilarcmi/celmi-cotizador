'use client';

import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from './Icon';

export function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <header className="mb-7">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight">{titulo}</h1>
      {children && <p className="mt-2 text-sm leading-relaxed text-texto-suave">{children}</p>}
    </header>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        {...props}
        className="h-12 rounded-md border border-borde bg-superficie px-3.5 text-[15px] text-texto outline-none transition-colors placeholder:text-texto-suave focus:border-acento focus:ring-4 focus:ring-acento-suave"
      />
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-xs text-texto-suave">
          {ayuda}
        </p>
      )}
    </div>
  );
}

/** Contraseña con botón para mostrarla u ocultarla. */
export function CampoContrasena({
  etiqueta,
  ayuda,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          {...props}
          className="h-12 w-full rounded-md border border-borde bg-superficie pr-12 pl-3.5 text-[15px] text-texto outline-none transition-colors focus:border-acento focus:ring-4 focus:ring-acento-suave"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="absolute top-1 right-1 inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-texto-suave hover:bg-superficie-2 hover:text-texto"
        >
          <Icon name="ojo" />
        </button>
      </div>
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-xs text-texto-suave">
          {ayuda}
        </p>
      )}
    </div>
  );
}

/** Código de 6 dígitos de la app autenticadora; se envía solo al completarlo. */
export function CampoCodigo({
  onCompleto,
  deshabilitado,
}: {
  onCompleto: (codigo: string) => void;
  deshabilitado?: boolean;
}) {
  const id = useId();
  const [valor, setValor] = useState('');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        Código de 6 dígitos
      </label>
      <input
        id={id}
        value={valor}
        disabled={deshabilitado}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="\d{6}"
        placeholder="000000"
        onChange={(e) => {
          const limpio = e.target.value.replace(/\D/g, '').slice(0, 6);
          setValor(limpio);
          if (limpio.length === 6) onCompleto(limpio);
        }}
        className="tabular h-16 rounded-md border border-borde bg-superficie text-center text-[30px] font-bold tracking-[0.5em] text-texto outline-none transition-colors placeholder:text-borde focus:border-acento focus:ring-4 focus:ring-acento-suave disabled:opacity-60"
      />
    </div>
  );
}

export function Mensaje({
  tono = 'peligro',
  children,
}: {
  tono?: 'peligro' | 'exito' | 'info' | 'aviso';
  children: ReactNode;
}) {
  const clases = {
    peligro: 'bg-peligro-suave text-peligro',
    exito: 'bg-exito-suave text-exito',
    info: 'bg-info-suave text-info',
    aviso: 'bg-aviso-suave text-aviso',
  }[tono];
  return (
    <p
      role={tono === 'peligro' ? 'alert' : 'status'}
      className={`rounded-md px-3.5 py-3 text-[13px] leading-relaxed ${clases}`}
    >
      {children}
    </p>
  );
}

/** Botón principal que muestra «Un momento…» mientras el formulario se envía. */
export function BotonEnviar({ children, ocupado }: { children: ReactNode; ocupado?: boolean }) {
  const { pending } = useFormStatus();
  const enProceso = pending || ocupado;
  return (
    <button
      type="submit"
      disabled={enProceso}
      className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-acento text-[15px] font-semibold text-sobre-acento transition-[filter,transform] hover:brightness-110 active:scale-[.99] disabled:cursor-wait disabled:opacity-70"
    >
      {enProceso ? 'Un momento…' : children}
    </button>
  );
}
