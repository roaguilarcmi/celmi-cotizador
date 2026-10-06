'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, Tarjeta, Titulo2 } from '@/components/ui';
import type { RevisionDetalle } from '@/lib/datos';
import { cambiarEstadoRevision } from '../acciones';
import { erroresDeFila, resumenPropuesta, todasLasFilas, type PropuestaEditable } from './modelo';

const fechaHora = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

/**
 * Paso «Margen y autorización», lado de quien prepara la cotización: revisa que esté completa y la envía. La utilidad
 * y los precios los define quien autoriza (Fase 3C). Mientras espera, se puede retirar para corregir.
 */
export function PasoAutorizacion({
  revision,
  cotizacionId,
  puedeEditar,
  propuestas,
  onIrA,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  puedeEditar: boolean;
  propuestas: PropuestaEditable[];
  onIrA: (paso: 1 | 2 | 4) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);

  const partidas = propuestas.flatMap(todasLasFilas);
  const sinCosto = propuestas.reduce((s, p) => s + resumenPropuesta(p).sinCosto, 0);
  const conErrores = partidas.filter((f) => Object.keys(erroresDeFila(f)).length).length;
  const checklist: { ok: boolean; texto: string; paso?: 1 | 2; aviso?: boolean }[] = [
    {
      ok: partidas.length > 0,
      texto: `${partidas.length} partidas en ${propuestas.length} propuestas`,
      paso: 1,
    },
    {
      ok: conErrores === 0,
      texto: conErrores ? `${conErrores} partidas con datos por corregir` : 'Datos de las partidas completos',
      paso: 1,
    },
    {
      ok: sinCosto === 0,
      texto: sinCosto ? `${sinCosto} partidas sin costo` : 'Todas las partidas tienen costo',
      paso: 1,
    },
    {
      ok: Boolean(revision.vigencia_hasta),
      aviso: true,
      texto: revision.vigencia_hasta ? 'Vigencia definida' : 'Sin vigencia (recomendada)',
      paso: 2,
    },
  ];
  const lista = checklist.every((c) => c.ok || c.aviso);

  const cambiar = (estado: 'pendiente_autorizacion' | 'borrador') =>
    iniciar(async () => {
      const r = await cambiarEstadoRevision(revision.id, cotizacionId, estado);
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
    });

  return (
    <Tarjeta className="p-6">
      <Titulo2>Margen y autorización</Titulo2>

      {revision.estado === 'pendiente_autorizacion' && (
        <Estado icono="reloj" tono="aviso" titulo="En espera de autorización">
          Enviada el {revision.enviada_en ? fechaHora.format(new Date(revision.enviada_en)) : '—'}. Quien
          autoriza define la utilidad y los precios.
          {puedeEditar && (
            <Boton
              tamano="chico"
              icono="izquierda"
              disabled={pendiente}
              onClick={() => cambiar('borrador')}
              className="mt-3"
            >
              Retirar para corregir
            </Boton>
          )}
        </Estado>
      )}

      {revision.estado === 'autorizada' && (
        <Estado icono="palomita" tono="exito" titulo="Autorizada">
          {revision.autorizada_en ? `El ${fechaHora.format(new Date(revision.autorizada_en))}. ` : ''}La vista
          previa y la emisión con folio llegan en la siguiente fase.
        </Estado>
      )}

      {revision.estado === 'rechazada' && (
        <Estado icono="cerrar" tono="peligro" titulo="Rechazada">
          <span className="block">Motivo: «{revision.comentario_autorizacion}»</span>
          Corrige lo necesario y vuelve a enviarla.
        </Estado>
      )}

      {(revision.estado === 'borrador' || revision.estado === 'rechazada') && (
        <>
          <p className="mt-2 text-[13px] text-texto-suave">
            Revisa que esté completa. Al enviarla, ya no podrás modificar partidas ni costos mientras se
            autoriza.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {checklist.map((c) => (
              <li key={c.texto} className="flex items-center gap-3 text-sm">
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ${
                    c.ok
                      ? 'bg-exito text-white'
                      : c.aviso
                        ? 'bg-aviso-suave text-aviso'
                        : 'bg-peligro-suave text-peligro'
                  }`}
                >
                  <Icon name={c.ok ? 'palomita' : 'cerrar'} size={13} strokeWidth={2.8} />
                </span>
                <span className={c.ok ? '' : 'font-semibold'}>{c.texto}</span>
                {!c.ok && c.paso && (
                  <button
                    type="button"
                    onClick={() => onIrA(c.paso!)}
                    className="cursor-pointer text-[13px] font-semibold text-acento-texto hover:underline"
                  >
                    Ir a corregir
                  </button>
                )}
              </li>
            ))}
          </ul>
          {puedeEditar && (
            <Boton
              variante="primario"
              icono="autorizaciones"
              disabled={pendiente || !lista}
              onClick={() => cambiar('pendiente_autorizacion')}
              className="mt-6"
            >
              {pendiente ? 'Enviando…' : 'Enviar a autorización'}
            </Boton>
          )}
        </>
      )}

      {mensaje && (
        <p className={`mt-4 text-[13px] font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}>
          {mensaje.texto}
        </p>
      )}
    </Tarjeta>
  );
}

function Estado({
  icono,
  tono,
  titulo,
  children,
}: {
  icono: 'reloj' | 'palomita' | 'cerrar';
  tono: 'aviso' | 'exito' | 'peligro';
  titulo: string;
  children: ReactNode;
}) {
  const clases = {
    aviso: 'bg-aviso-suave text-aviso',
    exito: 'bg-exito-suave text-exito',
    peligro: 'bg-peligro-suave text-peligro',
  };
  return (
    <div className={`mt-4 flex gap-3 rounded-md px-4 py-3.5 ${clases[tono]}`}>
      <Icon name={icono} size={20} />
      <div className="text-[13px]">
        <p className="text-sm font-bold">{titulo}</p>
        <div className="mt-0.5 text-texto">{children}</div>
      </div>
    </div>
  );
}
