'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CampoCodigo, Mensaje } from '@/components/formulario';
import { cerrarSesion } from '@/lib/acciones-sesion';
import { clienteNavegador } from '@/lib/supabase/navegador';

export function Verificar({ siguiente }: { siguiente: string }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    void (async () => {
      const supabase = clienteNavegador();
      const { data, error: e } = await supabase.auth.mfa.listFactors();
      if (e) {
        router.replace('/entrar');
        return;
      }
      const totp = data.totp.find((f) => f.status === 'verified');
      if (!totp) router.replace(`/entrar/configurar-2fa?siguiente=${encodeURIComponent(siguiente)}`);
      else setFactorId(totp.id);
    })();
  }, [router, siguiente]);

  const verificar = async (codigo: string) => {
    if (!factorId) return;
    setOcupado(true);
    setError(null);
    const { error: e } = await clienteNavegador().auth.mfa.challengeAndVerify({ factorId, code: codigo });
    if (e) {
      setOcupado(false);
      setError('El código no es correcto o ya cambió. Escribe el que aparece ahora en tu app.');
      setIntento((n) => n + 1);
      return;
    }
    router.replace(siguiente);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Mensaje>{error}</Mensaje>}
      <CampoCodigo key={intento} onCompleto={verificar} deshabilitado={!factorId || ocupado} />
      <p className="text-[13px] text-texto-suave">
        {ocupado ? 'Verificando…' : 'Se verifica al escribir el sexto dígito.'}
      </p>
      <form action={() => cerrarSesion()}>
        <button
          type="submit"
          className="cursor-pointer text-[13px] font-semibold text-acento-texto hover:underline"
        >
          Entrar con otra cuenta
        </button>
      </form>
    </div>
  );
}
