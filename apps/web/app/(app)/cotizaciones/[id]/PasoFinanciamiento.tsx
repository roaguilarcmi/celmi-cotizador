'use client';

import {
  aEscalado,
  ESCALA_DINERO,
  formatearMXN,
  ATAJOS_VIGENCIA_FINANCIERA,
  fechaValida,
  finDeMesHabil,
  MESES_POR_PAGO,
  numeroDePagos,
  tasaAnualNominal,
  valorResidual,
  vigenciaFinanciera,
  type Frecuencia,
} from '@celmi/core';
import { useState, useTransition, type ReactNode } from 'react';
import { CampoMoneda } from '@/components/CampoMoneda';
import { Icon } from '@/components/Icon';
import { Boton, Tarjeta, Titulo2 } from '@/components/ui';
import { presentacionAutorizada } from '@/lib/corrida';
import type { Financiera, FinanciamientoFila, RevisionDetalle } from '@/lib/datos';
import type { TipoOportunidad } from '@/lib/tipos-oportunidad';
import { guardarFinanciamiento } from '../acciones';

interface Opcion {
  clave: string;
  propuesta_id: string;
  financiera_id: string;
  aseguradora: string;
  folio_financiera: string;
  tipo_arrendamiento: 'vjm' | 'fpo' | '';
  plazo_meses: string;
  frecuencia: Frecuencia;
  residual_capturado: 'pct' | 'monto';
  residual_valor: string;
  gastos_iniciales: string;
  pago: string;
  pago_seguro: string;
  factor: string;
  vigencia_financiera: string;
  fecha_emision_financiera: string;
}

let n = 0;
const clave = () => `fin-${Date.now()}-${++n}`;
/** Los numeric llegan como número («1234.5»): texto sin ceros de más. */
const texto = (v: string | number | null) => (v == null ? '' : String(Number(v)));

const FRECUENCIAS: { id: Frecuencia; nombre: string }[] = [
  { id: 'mensual', nombre: 'Mensual' },
  { id: 'bimestral', nombre: 'Bimestral' },
  { id: 'trimestral', nombre: 'Trimestral' },
  { id: 'semestral', nombre: 'Semestral' },
  { id: 'anual', nombre: 'Anual' },
];
/** Plazos de arrendamiento que se ofrecen (decisión 2026-10-07). */
const PLAZOS = [24, 36, 48, 60];
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TIPOS = [
  { id: 'vjm' as const, nombre: 'Valor Justo de Mercado', detalle: 'Arrendamiento operativo' },
  { id: 'fpo' as const, nombre: 'Full PayOut', detalle: 'Arrendamiento financiero' },
];
/** «Mensualidad» o «Pago bimestral»… según la frecuencia. */
const nombrePago = (f: Frecuencia, de = '') => (f === 'mensual' ? `Mensualidad${de}` : `Pago ${f}${de}`);

const vacia = (propuesta: string): Opcion => ({
  clave: clave(),
  propuesta_id: propuesta,
  financiera_id: '',
  aseguradora: '',
  folio_financiera: '',
  tipo_arrendamiento: '',
  plazo_meses: '',
  frecuencia: 'mensual',
  residual_capturado: 'pct',
  residual_valor: '',
  gastos_iniciales: '',
  pago: '',
  pago_seguro: '',
  factor: '',
  vigencia_financiera: '',
  fecha_emision_financiera: '',
});

const control =
  'h-11 w-full rounded-md border border-texto/25 bg-superficie px-3 text-sm text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave disabled:bg-superficie-2 disabled:opacity-80';

/**
 * Opciones de financiamiento (decisiones 2026-10-07): después de autorizar precios, por cada propuesta se capturan una
 * o varias opciones con los datos de la financiera. El valor de los equipos sale de los precios autorizados; el
 * residual que falte (Full PayOut) y la tasa anual nominal se calculan. Todos los montos son sin IVA.
 */
export function PasoFinanciamiento({
  revision,
  cotizacionId,
  puedeEditar,
  financieras,
  filasIniciales,
  tipoOportunidad,
}: {
  revision: RevisionDetalle;
  cotizacionId: string;
  puedeEditar: boolean;
  financieras: Financiera[];
  filasIniciales: FinanciamientoFila[];
  tipoOportunidad: TipoOportunidad;
}) {
  const autorizada = revision.estado === 'autorizada';
  const editable = puedeEditar && autorizada;
  const esArrendamiento = tipoOportunidad === 'arrendamiento';
  const desdeServidor = (): Opcion[] =>
    filasIniciales.map((f) => ({
      clave: f.id,
      propuesta_id: f.propuesta_id,
      financiera_id: f.financiera_id ?? '',
      aseguradora: f.aseguradora ?? '',
      folio_financiera: f.folio_financiera ?? '',
      tipo_arrendamiento: f.tipo_arrendamiento ?? '',
      plazo_meses: String(f.plazo_meses),
      frecuencia: f.frecuencia ?? 'mensual',
      residual_capturado: f.residual_capturado ?? 'pct',
      residual_valor: f.residual_capturado === 'monto' ? texto(f.valor_residual) : texto(f.residual_pct),
      gastos_iniciales: texto(f.gastos_apertura),
      pago: texto(f.mensualidad),
      pago_seguro: texto(f.pago_seguro),
      factor: texto(f.factor),
      vigencia_financiera: f.vigencia_financiera ?? '',
      fecha_emision_financiera: f.fecha_emision_financiera ?? '',
    }));
  const [opciones, setOpciones] = useState<Opcion[]>(desdeServidor);
  const [base, setBase] = useState(() => JSON.stringify(desdeServidor()));
  const [previas, setPrevias] = useState(filasIniciales);
  if (filasIniciales !== previas) {
    setPrevias(filasIniciales);
    const nuevas = desdeServidor();
    setOpciones(nuevas);
    setBase(JSON.stringify(nuevas));
  }
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const sucio = editable && JSON.stringify(opciones) !== base;
  const principales = revision.propuestas.filter((p) => !p.es_adicional);
  const presentadas = autorizada ? presentacionAutorizada(revision) : null;
  const valorDe = (propuesta: string) => presentadas?.find((p) => p.id === propuesta)?.totales.subtotal;
  /** Propuesta cuya pestaña está abierta (2026-10-12): cada una con sus propias opciones. */
  const [activa, setActiva] = useState(() => principales[0]?.id ?? '');
  const actual = principales.find((p) => p.id === activa) ?? principales[0];

  const cambiar = (c: string, cambio: Partial<Opcion>) =>
    setOpciones((xs) => xs.map((f) => (f.clave === c ? { ...f, ...cambio } : f)));

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarFinanciamiento(
        revision.id,
        cotizacionId,
        opciones.map((f) => ({
          propuesta_id: f.propuesta_id,
          financiera_id: f.financiera_id,
          aseguradora: f.aseguradora,
          folio_financiera: f.folio_financiera,
          tipo_arrendamiento: esArrendamiento && f.tipo_arrendamiento ? f.tipo_arrendamiento : null,
          plazo_meses: Number(f.plazo_meses),
          frecuencia: f.frecuencia,
          residual_capturado: f.tipo_arrendamiento === 'fpo' ? f.residual_capturado : null,
          residual_valor: f.tipo_arrendamiento === 'fpo' ? f.residual_valor : '',
          gastos_iniciales: f.gastos_iniciales,
          pago: f.pago,
          pago_seguro: f.pago_seguro,
          factor: f.factor,
          vigencia_financiera: f.vigencia_financiera,
          fecha_emision_financiera: f.fecha_emision_financiera,
        })),
      );
      setMensaje(r.error ? { texto: r.error, error: true } : { texto: r.ok ?? '' });
      if (!r.error) setBase(JSON.stringify(opciones));
    });

  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Titulo2>Opciones de financiamiento</Titulo2>
          <span className="rounded-pill bg-info-suave px-3 py-1 text-xs font-bold text-info">
            Todos los montos son sin IVA
          </span>
        </div>
        <p className="mt-1 text-[13px] text-texto-suave">
          Por cada propuesta captura una o varias opciones con los datos que da la financiera. El valor de los
          equipos sale de los precios autorizados; la tasa de interés se calcula sola.
        </p>
        {!autorizada && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-superficie-2 px-4 py-3 text-[13px] text-texto-suave">
            <Icon name="candado" size={16} />
            Se captura cuando los precios estén autorizados (paso «Autorización»).
          </p>
        )}
        {tipoOportunidad === 'adquisicion' && (
          <p className="mt-3 rounded-md bg-info-suave px-4 py-2.5 text-[13px] text-info">
            La oportunidad es de adquisición: el financiamiento es opcional.
          </p>
        )}
        {financieras.length === 0 && editable && (
          <p className="mt-3 rounded-md bg-aviso-suave px-4 py-2.5 text-[13px] text-aviso">
            Aún no hay financieras en el catálogo. Un administrador las agrega en Catálogos → Financieras.
          </p>
        )}
      </Tarjeta>

      {actual && (
        <Tarjeta className="overflow-hidden">
          {/* Una pestaña por propuesta (2026-10-12): sus opciones no se mezclan con las de otra. */}
          {principales.length > 1 && (
            <div
              role="tablist"
              aria-label="Propuestas"
              className="flex flex-wrap gap-1 border-b border-borde bg-superficie-2/60 px-3 pt-2"
            >
              {principales.map((p) => {
                const elegida = p.id === actual.id;
                const n = opciones.filter((f) => f.propuesta_id === p.id).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={elegida}
                    onClick={() => setActiva(p.id)}
                    className={`-mb-px inline-flex h-10 cursor-pointer items-center gap-2 rounded-t-md border px-4 text-[13px] font-semibold transition-colors ${
                      elegida
                        ? 'border-borde border-b-superficie bg-superficie text-texto'
                        : 'border-transparent text-texto-suave hover:text-texto'
                    }`}
                  >
                    {p.nombre}
                    <span
                      className={`rounded-pill px-1.5 text-[11px] font-bold tabular ${
                        n ? 'bg-acento-suave text-acento-texto' : 'bg-superficie-2 text-texto-suave'
                      }`}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <PropuestaFinanciamiento
            key={actual.id}
            nombre={actual.nombre}
            valor={valorDe(actual.id)}
            opciones={opciones.filter((f) => f.propuesta_id === actual.id)}
            financieras={financieras}
            esArrendamiento={esArrendamiento}
            editable={editable}
            onCambiar={cambiar}
            onQuitar={(clave) => setOpciones((xs) => xs.filter((x) => x.clave !== clave))}
            onAgregar={() => setOpciones((xs) => [...xs, vacia(actual.id)])}
          />
        </Tarjeta>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="primario" icono="guardado" disabled={pendiente || !sucio} onClick={guardar}>
            {pendiente ? 'Guardando…' : 'Guardar financiamiento'}
          </Boton>
          {sucio && <span className="text-xs font-semibold text-aviso">Cambios sin guardar</span>}
          {mensaje && (
            <span className={`text-xs font-semibold ${mensaje.error ? 'text-peligro' : 'text-exito'}`}>
              {mensaje.texto}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Opciones de una propuesta, separadas con claridad una de otra (2026-10-12). */
function PropuestaFinanciamiento({
  nombre,
  valor,
  opciones,
  financieras,
  esArrendamiento,
  editable,
  onCambiar,
  onQuitar,
  onAgregar,
}: {
  nombre: string;
  valor: bigint | undefined;
  opciones: Opcion[];
  financieras: Financiera[];
  esArrendamiento: boolean;
  editable: boolean;
  onCambiar: (clave: string, cambio: Partial<Opcion>) => void;
  onQuitar: (clave: string) => void;
  onAgregar: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-borde px-6 py-3">
        <h3 className="mr-auto text-[15px] font-bold">{nombre}</h3>
        <span className="text-[13px] text-texto-suave">
          Valor de los equipos (sin IVA):{' '}
          <strong className="tabular text-texto">
            {valor !== undefined ? formatearMXN(valor) : 'pendiente de autorizar'}
          </strong>
        </span>
      </div>

      <div className="flex flex-col gap-6 bg-superficie-2/40 p-4">
        {opciones.length === 0 && (
          <p className="px-2 py-2 text-[13px] text-texto-suave">Sin opciones de financiamiento.</p>
        )}
        {opciones.map((f, i) => (
          <OpcionFinanciamiento
            key={f.clave}
            numero={i + 1}
            f={f}
            valor={valor}
            financieras={financieras}
            esArrendamiento={esArrendamiento}
            editable={editable}
            onCambiar={(cambio) => onCambiar(f.clave, cambio)}
            onQuitar={() => onQuitar(f.clave)}
          />
        ))}
        {editable && (
          <div>
            <Boton tamano="chico" icono="mas" onClick={onAgregar}>
              Agregar opción a {nombre}
            </Boton>
          </div>
        )}
      </div>
    </>
  );
}

function OpcionFinanciamiento({
  numero,
  f,
  valor,
  financieras,
  esArrendamiento,
  editable,
  onCambiar,
  onQuitar,
}: {
  numero: number;
  f: Opcion;
  valor: bigint | undefined;
  financieras: Financiera[];
  esArrendamiento: boolean;
  editable: boolean;
  onCambiar: (cambio: Partial<Opcion>) => void;
  onQuitar: () => void;
}) {
  const financiera = financieras.find((x) => x.id === f.financiera_id);
  const plazo = Number(f.plazo_meses);
  let pagos: number | null = null;
  let errorPlazo: string | null = null;
  if (f.plazo_meses) {
    try {
      pagos = numeroDePagos(plazo, f.frecuencia);
    } catch (e) {
      errorPlazo = (e as Error).message;
    }
  }
  const centavos = (v: string) => {
    try {
      return v ? aEscalado(v, ESCALA_DINERO) : 0n;
    } catch {
      return 0n;
    }
  };
  const pagoTotal = centavos(f.pago) + centavos(f.pago_seguro);
  const errorEmision = Boolean(f.fecha_emision_financiera) && !fechaValida(f.fecha_emision_financiera);
  const errorVigencia =
    f.vigencia_financiera && !fechaValida(f.vigencia_financiera)
      ? 'Fecha no válida (año entre 2000 y 2099)'
      : f.vigencia_financiera &&
          f.fecha_emision_financiera &&
          f.vigencia_financiera < f.fecha_emision_financiera
        ? 'La vigencia no puede ser anterior a la emisión'
        : null;
  const tasa =
    valor !== undefined && pagos
      ? tasaAnualNominal({ valor, pagoPorPeriodo: pagoTotal, pagos, frecuencia: f.frecuencia })
      : null;
  const esFpo = esArrendamiento && f.tipo_arrendamiento === 'fpo';
  let residual: { porcentaje: string; monto: bigint } | null = null;
  let errorResidual: string | null = null;
  if (esFpo && f.residual_valor && valor !== undefined) {
    try {
      residual = valorResidual(
        valor,
        f.residual_capturado === 'pct'
          ? { porcentaje: f.residual_valor }
          : { monto: aEscalado(f.residual_valor, ESCALA_DINERO) },
      );
    } catch (e) {
      errorResidual = (e as Error).message;
    }
  }

  const tasaNegativa = tasa !== null && Number(tasa) < 0;

  return (
    <section
      aria-label={`Opción ${numero}`}
      className="overflow-hidden rounded-lg border border-l-4 border-borde border-l-acento bg-superficie sombra"
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-borde bg-acento-suave/40 py-2 pr-1.5 pl-4">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-acento text-xs font-bold text-sobre-acento">
          {numero}
        </span>
        <span className="text-sm font-bold">Opción {numero}</span>
        <span className="text-[13px] text-texto-suave">
          {[
            financiera?.nombre,
            f.plazo_meses && `${f.plazo_meses} meses`,
            f.tipo_arrendamiento && esArrendamiento
              ? TIPOS.find((t) => t.id === f.tipo_arrendamiento)?.nombre
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {editable && (
          <Boton tamano="chico" variante="peligro" icono="cerrar" className="ml-auto" onClick={onQuitar}>
            Quitar
          </Boton>
        )}
      </div>

      {/* Sección 1 · La financiera y su cotización. */}
      <Seccion titulo="Financiera">
        <Campo etiqueta="Financiera">
          <select
            value={f.financiera_id}
            disabled={!editable}
            autoComplete="off"
            onChange={(e) => {
              const elegida = financieras.find((x) => x.id === e.target.value);
              // Si la financiera tiene una sola aseguradora, se elige sola (2026-10-07).
              onCambiar({
                financiera_id: e.target.value,
                aseguradora: elegida?.aseguradoras.length === 1 ? (elegida.aseguradoras[0] ?? '') : '',
              });
            }}
            className={control}
          >
            <option value="">Elige…</option>
            {financieras.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Aseguradora">
          <select
            value={f.aseguradora}
            disabled={!editable || !financiera}
            autoComplete="off"
            onChange={(e) => onCambiar({ aseguradora: e.target.value })}
            className={control}
          >
            <option value="">{financiera?.aseguradoras.length ? 'Elige…' : 'Sin aseguradoras'}</option>
            {financiera?.aseguradoras.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="# de cotización de la financiera">
          <input
            value={f.folio_financiera}
            disabled={!editable}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => onCambiar({ folio_financiera: e.target.value })}
            className={control}
          />
        </Campo>
        <Campo
          etiqueta="Fecha de emisión de su cotización"
          error={errorEmision ? 'Fecha no válida (año entre 2000 y 2099)' : null}
        >
          <div className="flex gap-2">
            <input
              type="date"
              value={f.fecha_emision_financiera}
              disabled={!editable}
              autoComplete="off"
              aria-invalid={errorEmision}
              onChange={(e) => onCambiar({ fecha_emision_financiera: e.target.value })}
              className={`${control} min-w-0 flex-1 ${errorEmision ? 'border-peligro' : ''}`}
            />
            {editable && (
              <Boton tamano="chico" onClick={() => onCambiar({ fecha_emision_financiera: hoy() })}>
                Hoy
              </Boton>
            )}
          </div>
        </Campo>
        <Campo
          etiqueta="Vigencia de su cotización"
          ayuda={`Desde ${f.fecha_emision_financiera ? 'la emisión' : 'hoy'}; en fin de semana, el viernes anterior.`}
          error={errorVigencia}
        >
          <input
            type="date"
            value={f.vigencia_financiera}
            disabled={!editable}
            autoComplete="off"
            aria-invalid={Boolean(errorVigencia)}
            onChange={(e) => onCambiar({ vigencia_financiera: e.target.value })}
            className={`${control} ${errorVigencia ? 'border-peligro' : ''}`}
          />
          {editable && (
            <div className="flex gap-1.5">
              {ATAJOS_VIGENCIA_FINANCIERA.map((atajo) => {
                // Con la emisión a medio escribir («0002-11-08») los atajos cuentan desde hoy (2026-10-12).
                const desde = fechaValida(f.fecha_emision_financiera) ? f.fecha_emision_financiera : hoy();
                const fecha =
                  atajo.dias === 'fin_de_mes' ? finDeMesHabil(desde) : vigenciaFinanciera(desde, atajo.dias);
                const activo = f.vigencia_financiera === fecha;
                return (
                  <button
                    key={atajo.etiqueta}
                    type="button"
                    aria-pressed={activo}
                    title={`Vence el ${fecha}`}
                    onClick={() => onCambiar({ vigencia_financiera: fecha })}
                    className={`h-8 flex-1 cursor-pointer rounded-pill border px-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                      activo
                        ? 'border-acento bg-acento-suave text-acento-texto'
                        : 'border-borde bg-superficie text-texto hover:bg-superficie-2'
                    }`}
                  >
                    {atajo.etiqueta}
                  </button>
                );
              })}
            </div>
          )}
        </Campo>
      </Seccion>

      {/* Sección 2 · Condiciones del financiamiento. */}
      <Seccion titulo="Condiciones">
        {esArrendamiento && (
          <Campo etiqueta="Tipo de arrendamiento" ancho>
            <div role="radiogroup" aria-label="Tipo de arrendamiento" className="grid grid-cols-2 gap-2">
              {TIPOS.map((t) => {
                const activo = f.tipo_arrendamiento === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    disabled={!editable}
                    onClick={() => onCambiar({ tipo_arrendamiento: t.id })}
                    className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-md border-2 px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${
                      activo ? 'border-acento bg-acento-suave/50' : 'border-borde hover:border-acento/40'
                    }`}
                  >
                    <span className="text-[13px] font-bold">{t.nombre}</span>
                    <span className="text-[11px] text-texto-suave">{t.detalle}</span>
                  </button>
                );
              })}
            </div>
          </Campo>
        )}
        <Campo etiqueta="Plazo" error={errorPlazo}>
          <select
            value={f.plazo_meses}
            disabled={!editable}
            autoComplete="off"
            aria-invalid={Boolean(errorPlazo)}
            onChange={(e) => onCambiar({ plazo_meses: e.target.value })}
            className={`${control} ${errorPlazo ? 'border-peligro' : ''}`}
          >
            <option value="">Elige…</option>
            {/* Una opción capturada antes con otro plazo se conserva. */}
            {[...new Set([...PLAZOS, ...(f.plazo_meses ? [Number(f.plazo_meses)] : [])])]
              .sort((x, y) => x - y)
              .map((p) => (
                <option key={p} value={p}>
                  {p} meses
                </option>
              ))}
          </select>
        </Campo>
        <Campo etiqueta="Frecuencia de pago">
          <select
            value={f.frecuencia}
            disabled={!editable}
            autoComplete="off"
            onChange={(e) => onCambiar({ frecuencia: e.target.value as Frecuencia })}
            className={control}
          >
            {FRECUENCIAS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </Campo>

        {esFpo && (
          <Campo etiqueta="Valor residual (Full PayOut)" ayuda="Captura uno; el otro se calcula." ancho>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-md border border-borde bg-superficie p-0.5" role="radiogroup">
                {(
                  [
                    ['pct', 'En %'],
                    ['monto', 'En monto'],
                  ] as const
                ).map(([id, nombre]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={f.residual_capturado === id}
                    disabled={!editable}
                    onClick={() => onCambiar({ residual_capturado: id, residual_valor: '' })}
                    className={`min-h-9 cursor-pointer rounded-sm px-3 text-[13px] font-semibold ${
                      f.residual_capturado === id ? 'bg-acento text-sobre-acento' : 'text-texto-suave'
                    }`}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
              <div className="w-44">
                <CampoMoneda
                  etiqueta={<span className="sr-only">Valor residual</span>}
                  valor={f.residual_valor}
                  onCambio={(v) => onCambiar({ residual_valor: v })}
                  disabled={!editable}
                  decimales={f.residual_capturado === 'pct' ? 4 : 2}
                  prefijo={f.residual_capturado === 'pct' ? '' : '$'}
                  sufijo={f.residual_capturado === 'pct' ? '%' : undefined}
                  invalido={Boolean(errorResidual)}
                />
              </div>
              <span className="text-[13px]">
                {errorResidual ? (
                  <span className="font-semibold text-peligro">{errorResidual}</span>
                ) : residual ? (
                  <>
                    ={' '}
                    <strong className="tabular">
                      {f.residual_capturado === 'pct'
                        ? formatearMXN(residual.monto)
                        : `${residual.porcentaje} % del valor`}
                    </strong>
                  </>
                ) : (
                  <span className="text-texto-suave">Captura el residual.</span>
                )}
              </span>
            </div>
          </Campo>
        )}
      </Seccion>

      {/* Sección 3 · Montos, todos sin IVA. */}
      <Seccion titulo="Montos sin IVA">
        <CampoMoneda
          etiqueta="Gastos iniciales (MXN)"
          valor={f.gastos_iniciales}
          onCambio={(v) => onCambiar({ gastos_iniciales: v })}
          disabled={!editable}
        />
        <CampoMoneda
          etiqueta={nombrePago(f.frecuencia, ' de los equipos')}
          valor={f.pago}
          onCambio={(v) => onCambiar({ pago: v })}
          disabled={!editable}
        />
        <CampoMoneda
          etiqueta={nombrePago(f.frecuencia, ' del seguro')}
          valor={f.pago_seguro}
          onCambio={(v) => onCambiar({ pago_seguro: v })}
          disabled={!editable}
        />
        <CampoMoneda
          etiqueta="Factor (opcional)"
          valor={f.factor}
          onCambio={(v) => onCambiar({ factor: v })}
          disabled={!editable}
          decimales={6}
          prefijo=""
        />
      </Seccion>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-borde bg-superficie-2/60 px-4 py-2.5 text-[13px]">
        <span className="text-texto-suave">
          {nombrePago(f.frecuencia)} total (equipos + seguro):{' '}
          <strong className="tabular text-texto">{formatearMXN(pagoTotal)}</strong>
        </span>
        <span className="text-texto-suave">
          Pagos:{' '}
          <strong className="tabular text-texto">
            {errorPlazo ? <span className="text-peligro">{errorPlazo}</span> : (pagos ?? '—')}
          </strong>
          {pagos && f.frecuencia !== 'mensual' && ` (cada ${MESES_POR_PAGO[f.frecuencia]} meses)`}
        </span>
        <span className="text-texto-suave">
          Tasa anual (calculada):{' '}
          <strong className={`tabular ${tasaNegativa ? 'text-peligro' : 'text-acento-texto'}`}>
            {tasa ? `${Number(tasa).toFixed(2)} %` : '—'}
          </strong>
        </span>
        {valor !== undefined && (
          <span className="ml-auto text-xs text-texto-suave">
            Sobre un valor de {formatearMXN(valor)} sin IVA
          </span>
        )}
        {tasaNegativa && valor !== undefined && pagos && (
          <p className="w-full text-xs font-semibold text-peligro">
            Los pagos ({pagos} × {formatearMXN(pagoTotal)} = {formatearMXN(pagoTotal * BigInt(pagos))}) no
            alcanzan el valor de los equipos ({formatearMXN(valor)}), por eso la tasa sale negativa. Revisa la
            mensualidad, el seguro o el plazo.
          </p>
        )}
      </div>
    </section>
  );
}

/** Grupo de campos con título y separador (opciones de financiamiento, 2026-10-07). */
function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border-b border-borde/70 px-4 pt-3 pb-4 last:border-b-0">
      <h4 className="mb-3 text-[11px] font-bold tracking-wide text-acento-texto uppercase">{titulo}</h4>
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

/** Etiqueta clara arriba del control; `ancho` ocupa dos columnas. */
function Campo({
  etiqueta,
  ayuda,
  error,
  ancho,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  ancho?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${ancho ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] font-semibold text-texto">{etiqueta}</span>
      {children}
      {error ? (
        <span className="text-xs font-semibold text-peligro">{error}</span>
      ) : (
        ayuda && <span className="text-xs text-texto-suave">{ayuda}</span>
      )}
    </div>
  );
}
