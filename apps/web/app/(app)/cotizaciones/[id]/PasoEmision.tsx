'use client';

import { etiquetaRevision, formatearMXN, sufijoRevision } from '@celmi/core';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, Pill, Tarjeta, Titulo2, clasesBoton } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import { presentacionAutorizada } from '@/lib/corrida';
import type { CotizacionFila, FinanciamientoFila, RevisionDetalle, SolicitudCancelacion } from '@/lib/datos';
import { textoVigencia } from '@/lib/vigencia';
import { emitirRevision, solicitarCancelacion } from '../acciones';

const fechaHora = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Mexico_City',
});
const cuando = (iso: string) => `${fechaHora.format(new Date(iso))} h`;

/**
 * Folio que llevará la revisión al emitirse (reglas 0031/0032): original o «nuevo folio» → folio nuevo; visible →
 * mismo número + « Rev X»; interna → exactamente el folio de la emisión anterior. Sólo es un aviso: lo asigna la base.
 */
function folioPrevisto(revision: RevisionDetalle, revisiones: CotizacionFila['revisiones']) {
  const anterior = revisiones.find((r) => r.folio && r.numero < revision.numero);
  const letra = sufijoRevision(revision.numero);
  if (revision.numero === 0 || revision.visibilidad === 'nuevo_folio' || !anterior?.folio_base) {
    return {
      folio:
        revision.numero > 0 && revision.visibilidad === 'visible'
          ? `Folio nuevo + « Rev ${letra}»`
          : 'Folio nuevo',
      explicacion:
        revision.numero === 0
          ? 'Original: el consecutivo se toma al emitir.'
          : revision.visibilidad === 'nuevo_folio'
            ? `${etiquetaRevision(revision.numero)} · nuevo folio: el consecutivo se toma al emitir.`
            : 'Aún no hay un folio anterior: se asigna uno al emitir.',
      exacto: false,
    };
  }
  if (revision.visibilidad === 'interna')
    return {
      folio: anterior.folio ?? anterior.folio_base,
      explicacion: `${etiquetaRevision(revision.numero)} · interna: conserva el folio de la emisión anterior.`,
      exacto: true,
    };
  return {
    folio: `${anterior.folio_base} Rev ${letra}`,
    explicacion: `${etiquetaRevision(revision.numero)} · visible: mismo número con su letra.`,
    exacto: true,
  };
}

/** Paso 5 · Vista previa: el PDF tal como saldrá (con marca de agua si aún no se emite). */
export function PasoVistaPrevia({
  revision,
  cotizacionId,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
}) {
  const listo = revision.estado === 'autorizada' || revision.estado === 'emitida';
  const url = `/cotizaciones/${cotizacionId}/pdf?revision=${revision.id}`;
  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-borde px-6 py-3">
        <Titulo2>Vista previa</Titulo2>
        {revision.estado === 'emitida' && <Pill tono="exito">Emitida</Pill>}
      </div>
      {listo ? (
        <div className="flex flex-wrap items-center gap-4 px-6 py-6">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-acento-suave text-acento-texto">
            <Icon name="ojo" size={22} />
          </span>
          <div className="mr-auto min-w-0">
            <p className="text-[15px] font-bold">El PDF de la cotización, tal como lo recibirá el cliente</p>
            <p className="text-[13px] text-texto-suave">
              {revision.estado === 'emitida'
                ? `Es la copia emitida con el folio ${revision.folio}.`
                : 'Lleva la marca «VISTA PREVIA» y sin folio hasta que se emita. Se abre en otra pestaña.'}
            </p>
          </div>
          <a href={url} target="_blank" rel="noopener" className={clasesBoton('primario')}>
            <Icon name="abrir" size={18} strokeWidth={2.2} /> Abrir vista previa
          </a>
        </div>
      ) : (
        <p className="flex items-center gap-2 px-6 py-6 text-[13px] text-texto-suave">
          <Icon name="candado" size={16} /> La vista previa existe cuando los precios están autorizados.
        </p>
      )}
    </Tarjeta>
  );
}

/** Paso 6 · Emisión (mockups aprobados 2026-10-12). */
export function PasoEmision({
  cotizacion,
  revision,
  financiamiento,
  condiciones,
  solicitudes,
  puedeAutorizar,
}: {
  cotizacion: CotizacionFila;
  revision: RevisionDetalle;
  financiamiento: FinanciamientoFila[];
  condiciones: number;
  solicitudes: SolicitudCancelacion[];
  puedeAutorizar: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const urlPdf = `/cotizaciones/${cotizacion.id}/pdf?revision=${revision.id}`;
  const vigente = cotizacion.revisiones[0]?.id === revision.id;
  const emitida = revision.estado === 'emitida';
  const cancelada = Boolean(revision.cancelada_en);
  const pendienteCancelar = solicitudes.find((s) => s.estado === 'pendiente');

  const emitir = () =>
    iniciar(async () => {
      const r = await emitirRevision(revision.id, cotizacion.id);
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
    });

  if (revision.estado !== 'autorizada' && !emitida)
    return (
      <Tarjeta className="px-6 py-6">
        <p className="flex items-center gap-2 text-[13px] text-texto-suave">
          <Icon name="candado" size={16} /> Se emite cuando los precios están autorizados.
        </p>
      </Tarjeta>
    );

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-borde px-6 py-3">
        <Titulo2>Emisión</Titulo2>
        {cancelada ? (
          <Pill tono="peligro">Cancelada</Pill>
        ) : pendienteCancelar ? (
          <Pill tono="aviso">Cancelación pendiente</Pill>
        ) : emitida ? (
          <Pill tono="exito">Emitida</Pill>
        ) : (
          <Pill tono="info">Autorizada</Pill>
        )}
      </div>

      {cancelada && (
        <Franja tono="peligro" icono="cerrar">
          <b>Cotización cancelada</b> por {revision.cancelador?.nombre ?? 'quien autoriza'}
          {revision.cancelada_en ? ` el ${cuando(revision.cancelada_en)}` : ''}: «
          {revision.motivo_cancelacion}».
        </Franja>
      )}
      {!cancelada && pendienteCancelar && (
        <Franja tono="aviso" icono="reloj">
          <b>Cancelación solicitada</b> por {pendienteCancelar.solicitante?.nombre ?? 'alguien'} el{' '}
          {cuando(pendienteCancelar.solicitada_en)}: «{pendienteCancelar.motivo}». Espera a quien autoriza.
        </Franja>
      )}

      {emitida ? (
        <div className="flex flex-wrap items-center gap-4 px-6 py-5">
          <span
            className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full ${
              cancelada ? 'bg-peligro-suave text-peligro' : 'bg-exito-suave text-exito'
            }`}
          >
            <Icon name={cancelada ? 'cerrar' : 'palomita'} size={24} strokeWidth={3} />
          </span>
          <div className="mr-auto min-w-0">
            <p className={`text-2xl font-bold tabular ${cancelada ? 'text-texto-suave line-through' : ''}`}>
              {revision.folio}
            </p>
            <p className="text-[13px] text-texto-suave">
              Emitida por {revision.emisor?.nombre ?? '—'}
              {revision.emitida_en ? ` · ${cuando(revision.emitida_en)}` : ''}
              {cancelada && vigente && (
                <>
                  {' '}
                  · Para reactivar este folio, crea una <b>Rev interna</b> y emítela.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {!cancelada && !pendienteCancelar && vigente && (
              <Boton variante="fantasma" icono="cerrar" onClick={() => setCancelando(true)}>
                {puedeAutorizar ? 'Cancelar cotización' : 'Solicitar cancelación'}
              </Boton>
            )}
            <a href={`${urlPdf}&descargar=1`} className={clasesBoton(cancelada ? 'secundario' : 'primario')}>
              <Icon name="guardado" size={18} strokeWidth={2.2} /> Descargar PDF
            </a>
          </div>
        </div>
      ) : (
        <ListaParaEmitir
          cotizacion={cotizacion}
          revision={revision}
          financiamiento={financiamiento}
          condiciones={condiciones}
          vigente={vigente}
        />
      )}

      {!emitida && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-borde bg-superficie-2/40 px-6 py-3">
          <a href={urlPdf} target="_blank" rel="noopener" className={clasesBoton('secundario')}>
            <Icon name="ojo" size={18} /> Ver vista previa del PDF
          </a>
          <span className="ml-auto text-xs text-texto-suave">
            Al emitir ya no se modifica; los cambios van en otra Rev.
          </span>
          <Boton variante="primario" icono="palomita" disabled={pendiente || !vigente} onClick={emitir}>
            {pendiente ? 'Emitiendo…' : 'Emitir cotización'}
          </Boton>
        </div>
      )}
      {mensaje && (
        <p
          role="status"
          className={`border-t border-borde px-6 py-2.5 text-[13px] font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}
        >
          {mensaje.texto}
        </p>
      )}

      <Historial cotizacion={cotizacion} />

      {cancelando && (
        <VentanaFlotante
          titulo={puedeAutorizar ? 'Cancelar cotización' : 'Solicitar cancelación'}
          detalle={`${revision.folio} · ${cotizacion.oportunidad?.cliente?.razon_social ?? ''}`}
          onCerrar={() => setCancelando(false)}
        >
          <FormularioCancelacion
            puedeAutorizar={puedeAutorizar}
            onEnviar={async (motivo) => {
              const r = await solicitarCancelacion(revision.id, cotizacion.id, motivo);
              if (!r.error) {
                setCancelando(false);
                setMensaje({ texto: r.ok ?? '' });
              }
              return r;
            }}
          />
        </VentanaFlotante>
      )}
    </Tarjeta>
  );
}

function ListaParaEmitir({
  cotizacion,
  revision,
  financiamiento,
  condiciones,
  vigente,
}: {
  cotizacion: CotizacionFila;
  revision: RevisionDetalle;
  financiamiento: FinanciamientoFila[];
  condiciones: number;
  vigente: boolean;
}) {
  const previsto = folioPrevisto(revision, cotizacion.revisiones);
  const presentadas = presentacionAutorizada(revision) ?? [];
  const principales = presentadas.filter((p) => !p.esAdicional);
  const vigencia = revision.vigencia_hasta ? revision.vigencia_hasta.slice(0, 10) : null;
  const vencenAntes = financiamiento.filter(
    (f) => vigencia && f.vigencia_financiera && f.vigencia_financiera < vigencia,
  );
  const sinFinanciamiento = revision.esquema !== 'adquisicion' && financiamiento.length === 0;
  return (
    <div className="grid gap-6 px-6 py-5 md:grid-cols-[1.1fr_1fr]">
      <div>
        <p className="text-[12px] font-bold tracking-wide text-texto-suave uppercase">Folio que llevará</p>
        <p className="mt-1 text-2xl font-bold tabular">{previsto.folio}</p>
        <p className="mt-1 text-[13px] text-texto-suave">
          {previsto.explicacion} El folio se asigna al emitir.
        </p>
        <div className="mt-4">
          <Fila etiqueta="Cliente">{cotizacion.oportunidad?.cliente?.razon_social ?? '—'}</Fila>
          <Fila etiqueta="Propuestas">
            {principales.length} · {principales.map((p) => formatearMXN(p.totales.total)).join(' / ')} con IVA
          </Fila>
          <Fila etiqueta="Financiamiento">
            {financiamiento.length ? `${financiamiento.length} opciones` : 'Sin opciones'}
          </Fila>
          <Fila etiqueta="Vigencia">{textoVigencia(revision.vigencia_hasta)}</Fila>
        </div>
      </div>
      <div className="rounded-md bg-superficie-2/60 p-4">
        <p className="mb-2 text-[13px] font-bold">Antes de emitir</p>
        <ul className="space-y-2">
          <Revisado>
            Precios autorizados{revision.autorizada_en ? ` el ${cuando(revision.autorizada_en)}` : ''}
          </Revisado>
          <Revisado ok={condiciones > 0}>
            {condiciones > 0
              ? `${condiciones} condiciones comerciales; la vigencia se escribe sola`
              : 'Sin condiciones comerciales'}
          </Revisado>
          <Revisado ok={!sinFinanciamiento}>
            {sinFinanciamiento
              ? 'No hay opciones de financiamiento capturadas'
              : financiamiento.length
                ? `Financiamiento capturado en ${financiamiento.length} opciones`
                : 'Adquisición: el financiamiento es opcional'}
          </Revisado>
          {vencenAntes.length > 0 && (
            <Revisado ok={false}>
              {vencenAntes.length === 1
                ? 'Una cotización de financiera vence'
                : `${vencenAntes.length} cotizaciones de financiera vencen`}{' '}
              antes que esta
            </Revisado>
          )}
          {!vigente && <Revisado ok={false}>Hay una revisión más reciente: emite la vigente</Revisado>}
        </ul>
      </div>
    </div>
  );
}

function Historial({ cotizacion }: { cotizacion: CotizacionFila }) {
  const emitidas = cotizacion.revisiones.filter((r) => r.folio);
  if (!emitidas.length) return null;
  return (
    <div className="border-t border-borde px-6 py-4">
      <h3 className="mb-2 text-[12px] font-bold tracking-wide text-texto-suave uppercase">
        Folios de esta cotización
      </h3>
      <ul className="text-[13px]">
        {emitidas.map((r, i) => {
          // Sustituida: una emisión posterior con otro folio (la misma interna la conserva).
          const posterior = emitidas.slice(0, i).find((x) => x.folio !== r.folio);
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde py-2 last:border-0"
            >
              <span
                className={`font-semibold tabular ${r.cancelada_en ? 'text-texto-suave line-through' : ''}`}
              >
                {r.folio}
              </span>
              <span className="text-texto-suave">{etiquetaRevision(r.numero)}</span>
              {r.emitida_en && <span className="text-texto-suave">· emitida el {cuando(r.emitida_en)}</span>}
              <span className="ml-auto">
                {r.cancelada_en ? (
                  <Pill tono="peligro">Cancelada</Pill>
                ) : posterior ? (
                  <Pill tono="neutro">Sustituida por {etiquetaRevision(posterior.numero)}</Pill>
                ) : (
                  <Pill tono="exito">Vigente</Pill>
                )}
              </span>
              <a
                href={`/cotizaciones/${cotizacion.id}/pdf?revision=${r.id}`}
                target="_blank"
                rel="noopener"
                className={clasesBoton('fantasma', 'chico')}
              >
                <Icon name="abrir" size={16} /> PDF
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FormularioCancelacion({
  puedeAutorizar,
  onEnviar,
}: {
  puedeAutorizar: boolean;
  onEnviar: (motivo: string) => Promise<{ error?: string }>;
}) {
  const ventana = useVentana();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '').trim();
    if (motivo.length < 5) return setError('Explica por qué se cancela.');
    iniciar(async () => {
      const r = await onEnviar(motivo);
      if (r.error) setError(r.error);
    });
  };
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <label htmlFor="motivo-cancelacion" className="text-[13px] font-semibold">
        ¿Por qué se cancela?
      </label>
      <textarea
        id="motivo-cancelacion"
        name="motivo"
        required
        minLength={5}
        maxLength={2000}
        rows={4}
        autoComplete="off"
        className="w-full rounded-md border-2 border-texto/20 bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
      />
      <p className="flex items-center gap-1.5 text-xs text-texto-suave">
        <Icon name="campana" size={13} />
        {puedeAutorizar
          ? 'El folio quedará cancelado. Sólo una Rev interna (que conserva el mismo folio) lo vuelve a usar.'
          : 'Se avisará a quien autoriza; el folio sigue vigente hasta que la apruebe.'}
      </p>
      {error && <p className="text-xs font-semibold text-peligro">{error}</p>}
      <div className="flex gap-2.5">
        <Boton
          type="submit"
          variante={puedeAutorizar ? 'peligroFuerte' : 'peligro'}
          icono="cerrar"
          disabled={pendiente}
        >
          {pendiente ? 'Enviando…' : puedeAutorizar ? 'Cancelar cotización' : 'Enviar solicitud'}
        </Boton>
        {ventana && (
          <Boton variante="fantasma" onClick={ventana.intentarCerrar}>
            Volver
          </Boton>
        )}
      </div>
    </form>
  );
}

const Fila = ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-borde py-2 text-[13px] last:border-0">
    <span className="text-texto-suave">{etiqueta}</span>
    <span className="text-right font-semibold">{children}</span>
  </div>
);

const Revisado = ({ ok = true, children }: { ok?: boolean; children: ReactNode }) => (
  <li className="flex items-start gap-2 text-[13px]">
    <span
      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${
        ok ? 'bg-exito-suave text-exito' : 'bg-aviso-suave text-aviso'
      }`}
    >
      <Icon name={ok ? 'palomita' : 'campana'} size={12} strokeWidth={3} />
    </span>
    {children}
  </li>
);

function Franja({
  tono,
  icono,
  children,
}: {
  tono: 'aviso' | 'peligro';
  icono: 'reloj' | 'cerrar';
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-b px-6 py-3 text-[13px] ${
        tono === 'peligro'
          ? 'border-peligro/30 bg-peligro-suave text-peligro'
          : 'border-aviso/40 bg-aviso-suave text-aviso'
      }`}
    >
      <Icon name={icono} size={16} strokeWidth={icono === 'cerrar' ? 3 : undefined} />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
