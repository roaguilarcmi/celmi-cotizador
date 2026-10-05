'use client';

import type { JSONContent } from '@tiptap/core';
import Link from 'next/link';
import { useActionState, useId, useState, type ReactNode } from 'react';
import { EditorEnriquecido } from '@/components/EditorEnriquecido';
import { BotonEnviar } from '@/components/formulario';
import { Icon, type IconName } from '@/components/Icon';
import { TextoEnriquecido } from '@/components/TextoEnriquecido';
import { FormularioTarea } from '@/components/tareas/FormularioTarea';
import { ListaTareas } from '@/components/tareas/ListaTareas';
import { Avatar, Pill, Tarjeta, Titulo2 } from '@/components/ui';
import type { Estado, SeguimientoFila, TareaFila } from '@/lib/datos';
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

// ───────────── Encabezado de sección ─────────────

const TONOS = {
  tareas: { banda: 'bg-aviso-suave border-aviso/25', icono: 'bg-aviso text-white' },
  seguimiento: { banda: 'bg-acento-suave border-acento/25', icono: 'bg-paso text-white' },
};

/** Banda con color propio para distinguir cada sección de un vistazo, con su botón para desplegar el formulario. */
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
  accion?: { nombre: string; abierto: boolean; panel: string; alternar: () => void };
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
          onClick={accion.alternar}
          aria-expanded={accion.abierto}
          aria-controls={accion.panel}
          className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold transition-colors ${
            accion.abierto
              ? 'bg-superficie text-texto-suave hover:text-texto'
              : 'bg-acento text-sobre-acento hover:brightness-110'
          }`}
        >
          <Icon name={accion.abierto ? 'cerrar' : 'mas'} size={16} strokeWidth={2.2} />
          {accion.abierto ? 'Cerrar' : accion.nombre}
        </button>
      )}
    </div>
  );
}

/** Panel que se despliega bajo el encabezado. */
function Desplegable({ id, abierto, children }: { id: string; abierto: boolean; children: ReactNode }) {
  if (!abierto) return null;
  return (
    <div id={id} className="animar-entrada border-b border-borde bg-superficie-2/60 px-5 py-4">
      {children}
    </div>
  );
}

// ───────────── Mis tareas ─────────────

export function SeccionTareas({ oportunidadId, tareas }: { oportunidadId: string; tareas: TareaFila[] }) {
  const panel = useId();
  const [abierto, setAbierto] = useState(false);
  const pendientes = tareas.filter((t) => t.estado === 'pendiente').length;
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
        accion={{ nombre: 'Nueva tarea', abierto, panel, alternar: () => setAbierto((a) => !a) }}
      />
      <Desplegable id={panel} abierto={abierto}>
        <FormularioTarea oportunidadId={oportunidadId} />
      </Desplegable>
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
}: {
  oportunidadId: string;
  seguimiento: SeguimientoFila[];
  estados: Estado[];
  usuarioId: string;
  puedeRegistrar: boolean;
}) {
  const panel = useId();
  const [abierto, setAbierto] = useState(false);
  const [todos, setTodos] = useState(false);
  const nombreEstado = new Map(estados.map((e) => [e.id, e.nombre]));
  const visibles = todos ? seguimiento : seguimiento.slice(0, VISIBLES);
  const ocultos = seguimiento.length - visibles.length;

  return (
    <Tarjeta className="overflow-hidden">
      <EncabezadoSeccion
        icono="mensaje"
        titulo="Seguimiento"
        detalle="Bitácora compartida: notas, llamadas, visitas y cambios de estado"
        tono="seguimiento"
        cuenta={seguimiento.length}
        accion={
          puedeRegistrar
            ? { nombre: 'Registrar', abierto, panel, alternar: () => setAbierto((a) => !a) }
            : undefined
        }
      />
      <Desplegable id={panel} abierto={abierto}>
        <FormularioNota oportunidadId={oportunidadId} onListo={() => setAbierto(false)} />
      </Desplegable>
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

/** Registrar (sin `registro`) o editar una nota propia (con `registro`). */
function FormularioNota({
  oportunidadId,
  registro,
  onListo,
}: {
  oportunidadId: string;
  registro?: SeguimientoFila;
  onListo: () => void;
}) {
  const [version, setVersion] = useState(0);
  const [tipo, setTipo] = useState<TipoNota>(
    registro && registro.tipo !== 'cambio_estado' ? registro.tipo : 'nota',
  );
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    async (previo: EstadoFormulario, datos: FormData) => {
      const r = registro
        ? await editarNota(registro.id, oportunidadId, previo, datos)
        : await agregarNota(oportunidadId, previo, datos);
      if (r.ok) {
        setVersion((v) => v + 1); // vacía el editor
        onListo();
      }
      return r;
    },
    {},
  );
  return (
    <form action={accion} className="flex flex-col gap-2.5">
      <input type="hidden" name="tipo" value={tipo} />
      <div role="radiogroup" aria-label="Tipo de registro" className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tipo === t.id}
            onClick={() => setTipo(t.id)}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill px-3 text-[13px] font-semibold transition-colors ${
              tipo === t.id ? 'bg-paso text-white' : 'bg-superficie text-texto-suave hover:text-texto'
            }`}
          >
            <Icon name={t.icono} size={15} />
            {t.nombre}
          </button>
        ))}
      </div>
      <EditorEnriquecido
        key={version}
        nombre="contenido"
        inicial={registro ? comoDocumento(registro) : null}
        etiqueta="Texto del registro"
        placeholder="¿Qué pasó? Ej. «El cliente pidió cotizar también 2 docking stations»"
        minAlto={72}
      />
      {estado.error && <p className="text-xs text-peligro">{estado.error}</p>}
      <div className="flex items-center justify-end gap-2">
        {registro && (
          <button
            type="button"
            onClick={onListo}
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
