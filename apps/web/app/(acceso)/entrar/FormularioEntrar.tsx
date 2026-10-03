'use client';

import { useActionState } from 'react';
import { BotonEnviar, Campo, CampoContrasena, Mensaje } from '@/components/formulario';
import { iniciarSesion, type EstadoEntrar } from './acciones';

export function FormularioEntrar({ siguiente, aviso }: { siguiente: string; aviso: string | null }) {
  const [estado, accion] = useActionState<EstadoEntrar, FormData>(iniciarSesion, { error: null });
  return (
    <form action={accion} className="flex flex-col gap-4">
      {aviso && !estado.error && <Mensaje tono="info">{aviso}</Mensaje>}
      {estado.error && <Mensaje>{estado.error}</Mensaje>}
      <input type="hidden" name="siguiente" value={siguiente} />
      <Campo
        etiqueta="Correo corporativo"
        name="correo"
        type="email"
        autoComplete="username"
        required
        autoFocus
      />
      <CampoContrasena etiqueta="Contraseña" name="contrasena" autoComplete="current-password" required />
      <div className="mt-2">
        <BotonEnviar>Entrar</BotonEnviar>
      </div>
    </form>
  );
}
