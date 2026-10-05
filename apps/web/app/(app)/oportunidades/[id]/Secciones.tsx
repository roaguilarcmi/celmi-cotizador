'use client';

import type { JSONContent } from '@tiptap/core';
import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { BotonEnviar } from '@/components/formulario';
import { Icon, type IconName } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { BotonActivarAvisos } from '@/components/tareas/BotonActivarAvisos';
import { FormularioTarea } from '@/components/tareas/FormularioTarea';
import { ListaTareas } from '@/components/tareas/ListaTareas';
import { Avatar, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import { descartarBorrador, guardarBorrador, type TipoBorrador } from '@/lib/acciones-borradores';
import type { BorradorNota, BorradorTarea, Estado, SeguimientoFila, TareaFila } from '@/lib/datos';
import { colorAvatar, fechaHora, iniciales, tonoEstado } from '@/lib/presentacion';
import { agregarNota, editarNota, type EstadoFormulario } from '../acciones';

type TipoNota = 'nota' | 'llamada' | 'visita' | 'correo';

const TIPOS: { id: TipoNota; nombre: string; icono: IconName }[] = [
  { id: 'nota', nombre: 'Nota', icono: 'cotizaciones' },
  { id: 'llamada', nombre: 'Llamada', icono: 'telefono' },
  { id: 'visita', nombre: 'Visita', icono: 'clientes' },
  { id: 'correo', nombre: 'Correo', icono: 'mensaje' },
];

/** Registros visibles de la bitácora antes de «Ver anteriores». */
const VISIBLES = 4;

// ───────────── Piezas comunes ─────────────

const TONOS = {
  tareas: { banda: 'bg-aviso-suave border-aviso/25', icono: 'bg-aviso text-white' },
  seguimiento: { banda: 'bg-acento-suave border-acento/25', icono: 'bg-paso text-white' },
};

/** Banda con color propio para distinguir cada sección de un vistazo, con su botón para abrir la ventana de captura. */
function EncabezadoSeccion({
  icono,
  titulo,
  detalle,
  tono,
  cuenta,
  extra,
  accion,
}: {
  icono: IconName;
  titulo: string;
  detalle: string;
  tono: keyof typeof TONOS;
  cuenta?: number;
  extra?: ReactNode;
  accion?: { nombre: string; conBorrador: boolean; abrir: () => void };
}) {
  const c = TONOS[tono];
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-3 ${c.banda}`}>
      <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md ${c.icono}`}>
        <Icon name={icono} size={18} />
      </span>
      <div className="mr-auto min-w-0">
        <div className="flex items-center gap-2">
          <Titulo2>{titulo}</Titulo2>
          {cuenta != null && cuenta > 0 && (
            <span className="tabular rounded-pill bg-superficie px-2 py-px text-xs font-bold text-texto-suave">
              {cuenta}
            </span>
          )}
        </div>
        <p className="text-xs text-texto-suave">{detalle}</p>
      </div>
      {extra}
      {accion && (
        <button
          type="button"
          onClick={accion.abrir}
          aria-haspopup="dialog"
          title={accion.conBorrador ? 'Tienes un borrador guardado' : undefined}
          className="relative inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md bg-acento px-3.5 text-[13px] font-semibold text-sobre-acento transition-[filter] hover:brightness-110"
        >
          <Icon name={accion.conBorrador ? 'guardado' : 'mas'} size={16} strokeWidth={2.2} />
          {accion.conBorrador ? 'Continuar borrador' : accion.nombre}
          {accion.conBorrador && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-superficie bg-aviso"
            />
          )}
        </button>
      )}
    </div>
  );
}

/** Franja de confirmación tras guardar desde la ventana flotante. */
function Exito({ texto, onCerrar, children }: { texto: string; onCerrar: () => void; children?: ReactNode }) {
  return (
    <div
      role="status"
      className="animar-entrada flex flex-wrap items-center gap-2 border-b border-borde bg-exito-suave px-5 py-1.5 text-[13px] font-semibold text-exito"
    >
      <Icon name="palomita" size={16} strokeWidth={2.6} />
      <span className="mr-auto">{texto}</span>
      {children}
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Ocultar mensaje"
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-superficie/60"
      >
        <Icon name="cerrar" size={14} />
      </button>
    </div>
  );
}

/** Aviso dentro de la ventana cuando se continúa un borrador. */
function AvisoBorrador({ en, onDescartar }: { en: string; onDescartar: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-aviso/30 bg-aviso-suave px-3.5 py-2 text-[13px] text-aviso">
      <Icon name="guardado" size={16} />
      <span className="mr-auto">Continúas un borrador guardado el {fechaHora(en)}.</span>
      <button
        type="button"
        onClick={onDescartar}
        className="min-h-8 cursor-pointer font-semibold underline-offset-2 hover:underline"
      >
        Empezar de cero
      </button>
    </div>
  );
}

/** Estado común: abrir la ventana de captura, continuar o descartar el borrador y mostrar el resultado. */
function useCaptura(oportunidadId: string, tipo: TipoBorrador) {
  const [abierta, setAbierta] = useState(false);
  const [usarBorrador, setUsarBorrador] = useState(true);
  const [version, setVersion] = useState(0);
  const [exito, setExito] = useState<string | null>(null);
  return {
    abierta,
    usarBorrador,
    version,
    exito,
    ocultarExito: () => setExito(null),
    abrir: () => {
      setUsarBorrador(true);
      setExito(null);
      setAbierta(true);
    },
    cerrar: () => setAbierta(false),
    listo: (ok: string) => {
      setAbierta(false);
      setExito(ok);
    },
    guardarBorrador: async (datos: FormData) => {
      const r = await guardarBorrador(oportunidadId, tipo, datos);
      if (r.ok) setExito(r.ok);
      return r;
    },
    empezarDeCero: () => {
      setUsarBorrador(false);
      setVersion((v) => v + 1);
      void descartarBorrador(oportunidadId, tipo);
    },
  };
}

// ───────────── Mis tareas ─────────────

export function SeccionTareas({
  oportunidadId,
  tareas,
  borrador,
}: {
  oportunidadId: string;
  tareas: TareaFila[];
  borrador?: BorradorTarea;
}) {
  const c = useCaptura(oportunidadId, 'tarea');
  const pendientes = tareas.filter((t) => t.estado === 'pendiente').length;
  const conBorrador = c.usarBorrador ? borrador : undefined;
  return (
    <Tarjeta className="overflow-hidden">
      <EncabezadoSeccion
        icono="reloj"
        titulo="Mis tareas"
        detalle="Personales: sólo tú las ves"
        tono="tareas"
        cuenta={pendientes}
        extra={
          <Link
            href="/tareas"
            className="inline-flex min-h-10 items-center px-1 text-[13px] font-semibold text-acento-texto hover:underline"
          >
            Ver tablero
          </Link>
        }
        accion={{ nombre: 'Nueva tarea', conBorrador: Boolean(borrador), abrir: c.abrir }}
      />
      {c.exito && (
        <Exito texto={c.exito} onCerrar={c.ocultarExito}>
          {c.exito.startsWith('Tarea') && <BotonActivarAvisos compacto />}
        </Exito>
      )}
      {c.abierta && (
        <VentanaFlotante
          titulo="Nueva tarea"
          detalle="Personal: sólo tú la verás. Elige cuándo vence y cuándo avisarte."
          version={c.version}
          onCerrar={c.cerrar}
          onBorrador={c.guardarBorrador}
        >
          {conBorrador && <AvisoBorrador en={conBorrador.actualizado_en} onDescartar={c.empezarDeCero} />}
          <FormularioTarea
            key={c.version}
            oportunidadId={oportunidadId}
            borrador={conBorrador}
            onListo={c.listo}
          />
        </VentanaFlotante>
      )}
      <div className="px-5 py-1">
        <ListaTareas
          tareas={tareas}
          compacta
          vacio="Sin tareas pendientes. Usa «Nueva tarea» para programar una."
        />
      </div>
    </Tarjeta>
  );
}

// ───────────── Seguimiento ─────────────

export function SeccionSeguimiento({
  oportunidadId,
  seguimiento,
  estados,
  usuarioId,
  puedeRegistrar,
  borrador,
}: {
  oportunidadId: string;
  seguimiento: SeguimientoFila[];
  estados: Estado[];
  usuarioId: string;
  puedeRegistrar: boolean;
  borrador?: BorradorNota;
}) {
  const c = useCaptura(oportunidadId, 'nota');
  const [todos, setTodos] = useState(false);
  const nombreEstado = new Map(estados.map((e) => [e.id, e.nombre]));
  const visibles = todos ? seguimiento : seguimiento.slice(0, VISIBLES);
  const ocultos = seguimiento.length - visibles.length;
  const conBorrador = c.usarBorrador ? borrador : undefined;

  return (
    <Tarjeta className="overflow-hidden">
      <EncabezadoSeccion
        icono="mensaje"
        titulo="Seguimiento"
        detalle="Bitácora compartida: notas, llamadas, visitas y cambios de estado"
        tono="seguimiento"
        cuenta={seguimiento.length}
        accion={
          puedeRegistrar ? { nombre: 'Registrar', conBorrador: Boolean(borrador), abrir: c.abrir } : undefined
        }
      />
      {c.exito && <Exito texto={c.exito} onCerrar={c.ocultarExito} />}
      {c.abierta && (
        <VentanaFlotante
          titulo="Registrar seguimiento"
          detalle="Lo verán todos los que participan en esta oportunidad."
          version={c.version}
          onCerrar={c.cerrar}
          onBorrador={c.guardarBorrador}
        >
          {conBorrador && <AvisoBorrador en={conBorrador.actualizado_en} onDescartar={c.empezarDeCero} />}
          <FormularioNota
            key={c.version}
            oportunidadId={oportunidadId}
            borrador={conBorrador}
            onListo={c.listo}
          />
        </VentanaFlotante>
      )}
      <ol className="flex flex-col px-5 pt-4">
        {seguimiento.length === 0 && (
          <li className="pb-4 text-center text-[13px] text-texto-suave">
            Aún no hay movimientos registrados.
          </li>
        )}
        {visibles.map((s, i) => (
          <Registro
            key={s.id}
            s={s}
            ultimo={i === visibles.length - 1}
            nombreEstado={nombreEstado}
            propio={puedeRegistrar && s.tipo !== 'cambio_estado' && s.autor_id === usuarioId}
            oportunidadId={oportunidadId}
          />
        ))}
      </ol>
      {(ocultos > 0 || todos) && seguimiento.length > VISIBLES && (
        <div className="border-t border-borde px-5 py-1.5">
          <button
            type="button"
            onClick={() => setTodos((t) => !t)}
            aria-expanded={todos}
            className="min-h-9 cursor-pointer text-[13px] font-semibold text-acento-texto hover:underline"
          >
            {todos
              ? 'Mostrar sólo los recientes'
              : `Ver ${ocultos} ${ocultos === 1 ? 'registro anterior' : 'registros anteriores'}`}
          </button>
        </div>
      )}
    </Tarjeta>
  );
}

function Registro({
  s,
  ultimo,
  nombreEstado,
  propio,
  oportunidadId,
}: {
  s: SeguimientoFila;
  ultimo: boolean;
  nombreEstado: Map<string, string>;
  propio: boolean;
  oportunidadId: string;
}) {
  const [editando, setEditando] = useState(false);
  return (
    <li className="group relative flex gap-3 pb-4">
      {!ultimo && <span aria-hidden="true" className="absolute top-8 bottom-0 left-[15px] w-px bg-borde" />}
      {s.tipo === 'cambio_estado' ? (
        <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-acento-suave text-acento-texto">
          <Icon name="derecha" size={15} />
        </span>
      ) : (
        <Avatar
          iniciales={iniciales(s.autor?.nombre ?? '?')}
          color={colorAvatar(s.autor?.nombre ?? '?')}
          tamano={32}
        />
      )}
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-[13px]">
            <strong>{s.autor?.nombre ?? 'Sistema'}</strong>{' '}
            {s.tipo === 'cambio_estado' ? (
              <span className="text-texto-suave">
                cambió el estado{' '}
                {s.estado_anterior && (
                  <>
                    de{' '}
                    <Pill tono={tonoEstado(s.estado_anterior)} punto={false}>
                      {nombreEstado.get(s.estado_anterior) ?? s.estado_anterior}
                    </Pill>{' '}
                  </>
                )}
                a{' '}
                <Pill tono={tonoEstado(s.estado_nuevo ?? '')} punto={false}>
                  {nombreEstado.get(s.estado_nuevo ?? '') ?? s.estado_nuevo}
                </Pill>
              </span>
            ) : (
              <span className="text-texto-suave">
                registró {TIPOS.find((t) => t.id === s.tipo)?.nombre.toLowerCase()}
              </span>
            )}
            <span className="text-texto-suave">
              {' '}
              · {fechaHora(s.en)}
              {s.editado_en && <span title={`Editado el ${fechaHora(s.editado_en)}`}> · editado</span>}
            </span>
          </div>
          {propio && !editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label="Editar este registro"
              title="Editar"
              className="-mt-1.5 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-texto-suave opacity-70 group-hover:opacity-100 hover:bg-superficie-2 hover:text-texto focus-visible:opacity-100"
            >
              <Icon name="herramienta" size={15} />
            </button>
          )}
        </div>
        {editando ? (
          <div className="mt-2">
            <FormularioNota oportunidadId={oportunidadId} registro={s} onListo={() => setEditando(false)} />
          </div>
        ) : s.contenido != null ? (
          <div className="mt-1">
            <TextoEnriquecido contenido={s.contenido} respaldo={s.texto} />
          </div>
        ) : (
          s.texto && <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{s.texto}</p>
        )}
      </div>
    </li>
  );
}

/** Registros anteriores al formato: su texto plano se abre en el editor como párrafos. */
function comoDocumento(s: SeguimientoFila): JSONContent {
  if (s.contenido && typeof s.contenido === 'object') return s.contenido as JSONContent;
  return {
    type: 'doc',
    content: s.texto
      .split('\n')
      .map((linea) =>
        linea ? { type: 'paragraph', content: [{ type: 'text', text: linea }] } : { type: 'paragraph' },
      ),
  };
}

/** Registrar (sin `registro`, en ventana flotante) o editar una nota propia (con `registro`, en línea). */
function FormularioNota({
  oportunidadId,
  registro,
  borrador,
  onListo,
}: {
  oportunidadId: string;
  registro?: SeguimientoFila;
  borrador?: BorradorNota;
  onListo: (ok: string) => void;
}) {
  const ventana = useVentana();
  const [tipo, setTipo] = useState<TipoNota>(
    registro && registro.tipo !== 'cambio_estado' ? registro.tipo : (borrador?.tipo ?? 'nota'),
  );
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    async (previo: EstadoFormulario, datos: FormData) => {
      const r = registro
        ? await editarNota(registro.id, oportunidadId, previo, datos)
        : await agregarNota(oportunidadId, previo, datos);
      if (r.ok) onListo(r.ok);
      return r;
    },
    {},
  );
  const inicial = registro
    ? comoDocumento(registro)
    : ((borrador?.contenido as JSONContent | null | undefined) ?? null);
  const cancelar = ventana ? ventana.intentarCerrar : registro ? () => onListo('') : null;

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="tipo" value={tipo} />
      <div role="radiogroup" aria-label="Tipo de registro" className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tipo === t.id}
            onClick={() => setTipo(t.id)}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-[13px] font-semibold transition-colors ${
              tipo === t.id
                ? 'border-paso bg-paso text-white'
                : 'border-borde bg-superficie text-texto-suave hover:text-texto'
            }`}
          >
            <Icon name={t.icono} size={15} />
            {t.nombre}
          </button>
        ))}
      </div>
      <EditorEnriquecido
        nombre="contenido"
        inicial={inicial}
        etiqueta="Texto del registro"
        placeholder="¿Qué pasó? Ej. «El cliente pidió cotizar también 2 docking stations»"
        minAlto={ventana ? 140 : 72}
      />
      {estado.error && <p className="text-xs text-peligro">{estado.error}</p>}
      <div className="flex items-center justify-end gap-2">
        {cancelar && (
          <button
            type="button"
            onClick={cancelar}
            className="min-h-11 cursor-pointer rounded-md px-4 text-sm font-semibold text-texto-suave hover:bg-superficie-2"
          >
            Cancelar
          </button>
        )}
        <div className="w-44">
          <BotonEnviar>{registro ? 'Guardar cambios' : 'Registrar'}</BotonEnviar>
        </div>
      </div>
    </form>
  );
}
