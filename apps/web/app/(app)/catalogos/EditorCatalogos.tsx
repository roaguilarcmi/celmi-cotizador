'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Boton, Pill, Tarjeta } from '@/components/ui';
import type { CampoCatalogo, DefinicionCatalogo } from '@/lib/catalogos';
import { cambiarActivo, guardarRegistro, type Resultado } from './acciones';

export type Registro = Record<string, string | number | boolean | number[] | string[] | null>;

export function EditorCatalogos({
  catalogos,
  datos,
  puedeEditar,
  extra,
}: {
  catalogos: DefinicionCatalogo[];
  datos: Record<string, Registro[]>;
  puedeEditar: boolean;
  /** Pestaña con contenido propio (p. ej. condiciones comerciales, que se editan con texto con formato). */
  extra?: { clave: string; titulo: string; cuenta: number; contenido: ReactNode };
}) {
  const [activo, setActivo] = useState<string>(catalogos[0]!.tabla);
  const enExtra = extra?.clave === activo;
  const def = catalogos.find((c) => c.tabla === activo) ?? catalogos[0]!;
  const filas = datos[def.tabla] ?? [];

  return (
    <div className="animar-entrada mx-auto max-w-[1100px]">
      <header className="mb-6">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Catálogos</h1>
        <p className="mt-1.5 text-sm text-texto-suave">
          {puedeEditar
            ? 'Los registros no se borran: se desactivan para no afectar oportunidades y cotizaciones que ya los usan.'
            : 'Consulta los catálogos vigentes. Sólo un administrador puede modificarlos.'}
        </p>
      </header>

      <div role="tablist" aria-label="Catálogos" className="mb-4 flex flex-wrap gap-1.5">
        {catalogos.map((c) => (
          <button
            key={c.tabla}
            type="button"
            role="tab"
            aria-selected={c.tabla === activo}
            onClick={() => setActivo(c.tabla)}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-pill px-4 text-[13px] font-semibold transition-colors ${
              c.tabla === activo ? 'bg-paso text-white' : 'bg-superficie text-texto-suave hover:text-texto'
            }`}
          >
            {c.titulo}
            <span className={`tabular text-xs ${c.tabla === activo ? 'text-white/80' : ''}`}>
              {datos[c.tabla]?.length ?? 0}
            </span>
          </button>
        ))}
        {extra && (
          <button
            type="button"
            role="tab"
            aria-selected={enExtra}
            onClick={() => setActivo(extra.clave)}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-pill px-4 text-[13px] font-semibold transition-colors ${
              enExtra ? 'bg-paso text-white' : 'bg-superficie text-texto-suave hover:text-texto'
            }`}
          >
            {extra.titulo}
            <span className={`tabular text-xs ${enExtra ? 'text-white/80' : ''}`}>{extra.cuenta}</span>
          </button>
        )}
      </div>

      {enExtra ? (
        extra.contenido
      ) : (
        <Tarjeta key={def.tabla} className="animar-entrada overflow-hidden">
          <div className="border-b border-borde px-5 py-4">
            <h2 className="text-[17px] font-bold tracking-tight">{def.titulo}</h2>
            <p className="mt-0.5 text-[13px] text-texto-suave">{def.descripcion}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-superficie-2 text-left text-xs font-semibold text-texto-suave">
                  {def.campos.map((c) => (
                    <th
                      key={c.id}
                      scope="col"
                      className={`border-b border-borde px-4 py-2.5 ${c.tipo === 'si_no' ? 'w-36 text-center' : ''}`}
                    >
                      {c.etiqueta}
                    </th>
                  ))}
                  <th scope="col" className="border-b border-borde px-4 py-2.5">
                    Estado
                  </th>
                  {puedeEditar && (
                    <th scope="col" className="border-b border-borde px-4 py-2.5 text-right">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <FilaRegistro
                    key={String(f[def.clave.campo])}
                    def={def}
                    fila={f}
                    puedeEditar={puedeEditar}
                  />
                ))}
                {puedeEditar && <FilaRegistro def={def} puedeEditar nueva />}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

function valorInicial(c: CampoCatalogo, fila?: Registro): string | boolean {
  const v = fila?.[c.id];
  if (c.tipo === 'si_no') return v === true;
  if (Array.isArray(v)) return v.join(', ');
  return v === null || v === undefined ? '' : String(v);
}

function FilaRegistro({
  def,
  fila,
  puedeEditar,
  nueva,
}: {
  def: DefinicionCatalogo;
  fila?: Registro;
  puedeEditar: boolean;
  nueva?: boolean;
}) {
  const [editando, setEditando] = useState(Boolean(nueva));
  const [valores, setValores] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(def.campos.map((c) => [c.id, valorInicial(c, fila)])),
  );
  const [resultado, setResultado] = useState<Resultado>({});
  const [pendiente, iniciar] = useTransition();
  const clave = fila ? String(fila[def.clave.campo]) : null;
  const activo = fila ? fila[def.campoActivo] === true : true;

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarRegistro(def.tabla, clave, valores);
      setResultado(r);
      if (r.ok) {
        if (nueva) setValores(Object.fromEntries(def.campos.map((c) => [c.id, valorInicial(c)])));
        else setEditando(false);
      }
    });

  const celdas = def.campos.map((c) => {
    const v = valores[c.id];
    if (!editando) {
      return (
        <td
          key={c.id}
          className={`px-4 py-3 ${c.tipo === 'si_no' ? 'text-center' : ''} ${c.id === 'nombre' ? 'font-semibold' : ''} ${activo ? '' : 'text-texto-suave'}`}
        >
          {c.tipo === 'si_no' ? (
            v ? (
              <Pill tono="info" punto={false}>
                Sí
              </Pill>
            ) : (
              // Misma forma que «Sí» para que queden alineados (2026-10-08).
              <Pill tono="neutro" punto={false}>
                No
              </Pill>
            )
          ) : c.tipo === 'opcion' ? (
            ((c.opciones ?? []).find((o) => o.valor === String(v))?.texto ?? '—')
          ) : (
            String(v) || '—'
          )}
        </td>
      );
    }
    const bloqueada = c.id === 'codigo' && !nueva;
    return (
      <td key={c.id} className={`px-4 py-2 ${c.tipo === 'si_no' ? 'text-center' : ''}`}>
        <label className="sr-only" htmlFor={`${def.tabla}-${clave ?? 'nuevo'}-${c.id}`}>
          {c.etiqueta}
        </label>
        {c.tipo === 'si_no' ? (
          <input
            id={`${def.tabla}-${clave ?? 'nuevo'}-${c.id}`}
            type="checkbox"
            checked={v === true}
            onChange={(e) => setValores((s) => ({ ...s, [c.id]: e.target.checked }))}
            className="size-5 align-middle accent-[var(--c-acento)]"
          />
        ) : c.tipo === 'opcion' ? (
          <select
            id={`${def.tabla}-${clave ?? 'nuevo'}-${c.id}`}
            value={String(v)}
            onChange={(e) => setValores((s) => ({ ...s, [c.id]: e.target.value }))}
            className={`h-10 rounded-sm border border-borde bg-superficie px-2.5 text-sm text-texto outline-none focus:border-acento ${c.ancho ?? 'w-full min-w-40'}`}
          >
            {(c.opciones ?? []).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${def.tabla}-${clave ?? 'nuevo'}-${c.id}`}
            value={String(v)}
            disabled={bloqueada}
            placeholder={nueva ? (c.ayuda ?? c.etiqueta) : c.ayuda}
            inputMode={c.tipo === 'entero' ? 'numeric' : undefined}
            onChange={(e) => setValores((s) => ({ ...s, [c.id]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardar();
              if (e.key === 'Escape' && !nueva) setEditando(false);
            }}
            className={`h-10 rounded-sm border border-borde bg-superficie px-2.5 text-sm text-texto outline-none focus:border-acento disabled:opacity-60 ${c.ancho ?? 'w-full min-w-40'}`}
          />
        )}
      </td>
    );
  });

  return (
    <>
      <tr className={`border-b border-borde last:border-0 ${nueva ? 'bg-acento-suave/30' : ''}`}>
        {celdas}
        <td className="px-4 py-3">
          {nueva ? (
            <span className="text-xs font-semibold text-acento-texto">Nuevo</span>
          ) : activo ? (
            <Pill tono="exito">Activo</Pill>
          ) : (
            <Pill tono="neutro">Inactivo</Pill>
          )}
        </td>
        {puedeEditar && (
          <td className="px-4 py-2">
            <div className="flex justify-end gap-1.5">
              {editando ? (
                <>
                  <Boton
                    variante="primario"
                    icono={nueva ? 'mas' : 'palomita'}
                    disabled={pendiente}
                    onClick={guardar}
                  >
                    {nueva ? 'Agregar' : 'Guardar'}
                  </Boton>
                  {!nueva && <Boton onClick={() => setEditando(false)}>Cancelar</Boton>}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    aria-label={`Editar ${String(valores.nombre ?? clave)}`}
                    className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md border border-borde text-texto hover:bg-superficie-2"
                  >
                    <Icon name="herramienta" size={16} />
                  </button>
                  <Boton
                    disabled={pendiente}
                    onClick={() =>
                      iniciar(async () => setResultado(await cambiarActivo(def.tabla, clave!, !activo)))
                    }
                  >
                    {activo ? 'Desactivar' : 'Activar'}
                  </Boton>
                </>
              )}
            </div>
          </td>
        )}
      </tr>
      {(resultado.error || (resultado.ok && nueva)) && (
        <tr>
          <td colSpan={def.campos.length + 2} className="px-4 pb-3">
            <span className={`text-xs ${resultado.error ? 'text-peligro' : 'text-exito'}`}>
              {resultado.error ?? resultado.ok}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}
