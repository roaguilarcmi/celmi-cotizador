'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { BotonEnviar, CampoContrasena, Mensaje } from '@/components/formulario';
import { clienteNavegador } from '@/lib/supabase/navegador';

/** Longitud mínima de contraseña (configúrala igual en Supabase: Authentication → Providers → Email). */
const MINIMO = 12;

export function NuevaContrasena() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = clienteNavegador();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/entrar?error=enlace-vencido');
        return;
      }
      // Si ya tiene 2FA, primero debe verificarla (cambiar la contraseña exige sesión completa).
      const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (nivel?.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') {
        router.replace('/entrar/verificar?siguiente=/restablecer');
        return;
      }
      setListo(true);
    })();
  }, [router]);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const contrasena = String(datos.get('contrasena') ?? '');
    const confirmacion = String(datos.get('confirmacion') ?? '');
    if (contrasena.length < MINIMO) return setError(`Usa al menos ${MINIMO} caracteres.`);
    if (contrasena !== confirmacion) return setError('Las contraseñas no coinciden.');
    setOcupado(true);
    setError(null);
    const supabase = clienteNavegador();
    const { error: e2 } = await supabase.auth.updateUser({ password: contrasena });
    if (e2) {
      setOcupado(false);
      setError(
        e2.code === 'weak_password' || e2.code === 'same_password'
          ? 'Elige una contraseña distinta y más robusta.'
          : 'No pudimos guardar la contraseña. Pide un enlace nuevo a un administrador.',
      );
      return;
    }
    const { data: f } = await supabase.auth.mfa.listFactors();
    const con2fa = (f?.totp ?? []).some((x) => x.status === 'verified');
    router.replace(con2fa ? '/' : '/entrar/configurar-2fa');
    router.refresh();
  };

  if (!listo) return <p className="text-sm text-texto-suave">Verificando el enlace…</p>;

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {error && <Mensaje>{error}</Mensaje>}
      <CampoContrasena
        etiqueta="Contraseña nueva"
        name="contrasena"
        autoComplete="new-password"
        minLength={MINIMO}
        required
        ayuda={`Al menos ${MINIMO} caracteres. Una frase fácil de recordar funciona muy bien.`}
      />
      <CampoContrasena etiqueta="Confírmala" name="confirmacion" autoComplete="new-password" required />
      <div className="mt-2">
        <BotonEnviar ocupado={ocupado}>Guardar contraseña</BotonEnviar>
      </div>
    </form>
  );
}
