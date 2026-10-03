'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CampoCodigo, Mensaje } from '@/components/formulario';
import { Icon } from '@/components/Icon';
import { clienteNavegador } from '@/lib/supabase/navegador';
import { registrarInscripcion2fa } from '../acciones-2fa';

interface Inscripcion {
  factorId: string;
  qr: string;
  secreto: string;
}

export function Configurar2fa({ siguiente }: { siguiente: string }) {
  const router = useRouter();
  const [inscripcion, setInscripcion] = useState<Inscripcion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = clienteNavegador();
      const { data, error: e } = await supabase.auth.mfa.listFactors();
      if (e) {
        router.replace('/entrar');
        return;
      }
      if (data.totp.some((f) => f.status === 'verified')) {
        router.replace(`/entrar/verificar?siguiente=${encodeURIComponent(siguiente)}`);
        return;
      }
      // Inscripciones que quedaron a medias (se cerró la página antes de confirmar el código).
      for (const f of data.all.filter((x) => x.factor_type === 'totp' && x.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: nueva, error: e2 } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Cotizador CELMI ${new Date().toISOString().slice(0, 10)}`,
        issuer: 'Cotizador CELMI',
      });
      if (e2 || !nueva) {
        setError('No pudimos preparar la verificación. Recarga la página e inténtalo de nuevo.');
        return;
      }
      setInscripcion({ factorId: nueva.id, qr: nueva.totp.qr_code, secreto: nueva.totp.secret });
    })();
  }, [router, siguiente]);

  const confirmar = async (codigo: string) => {
    if (!inscripcion) return;
    setOcupado(true);
    setError(null);
    const { error: e } = await clienteNavegador().auth.mfa.challengeAndVerify({
      factorId: inscripcion.factorId,
      code: codigo,
    });
    if (e) {
      setOcupado(false);
      setError(
        'El código no coincide. Revisa que escaneaste el código de esta pantalla y escribe el actual.',
      );
      setIntento((n) => n + 1);
      return;
    }
    await registrarInscripcion2fa();
    router.replace(siguiente);
    router.refresh();
  };

  const secretoLegible = inscripcion?.secreto.match(/.{1,4}/g)?.join(' ') ?? '';

  return (
    <ol className="flex flex-col gap-6">
      <Paso numero={1} titulo="Instala una app autenticadora">
        Microsoft Authenticator o Google Authenticator, en tu celular.
      </Paso>
      <Paso numero={2} titulo="Escanea este código">
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex size-44 items-center justify-center rounded-lg border border-borde bg-white p-2">
            {inscripcion ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={inscripcion.qr} alt="Código QR para tu app autenticadora" className="size-full" />
            ) : (
              <span className="text-xs text-texto-suave">Preparando…</span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-[13px] text-texto-suave">
            ¿No puedes escanear? Escribe esta clave en la app:
            <div className="mt-2 flex items-center gap-2">
              <code className="tabular rounded-sm bg-superficie-2 px-2 py-1.5 text-[13px] font-semibold break-all text-texto">
                {secretoLegible || '…'}
              </code>
              <button
                type="button"
                disabled={!inscripcion}
                onClick={async () => {
                  if (!inscripcion) return;
                  await navigator.clipboard.writeText(inscripcion.secreto);
                  setCopiado(true);
                }}
                aria-label="Copiar clave"
                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-borde text-texto hover:bg-superficie-2"
              >
                <Icon name={copiado ? 'palomita' : 'copiar'} size={16} />
              </button>
            </div>
          </div>
        </div>
      </Paso>
      <Paso numero={3} titulo="Escribe el código que muestra la app">
        <div className="mt-3 flex flex-col gap-3">
          {error && <Mensaje>{error}</Mensaje>}
          <CampoCodigo key={intento} onCompleto={confirmar} deshabilitado={!inscripcion || ocupado} />
        </div>
      </Paso>
    </ol>
  );
}

function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-paso text-[13px] font-bold text-white">
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">{titulo}</div>
        <div className="mt-0.5 text-[13px] text-texto-suave">{children}</div>
      </div>
    </li>
  );
}
