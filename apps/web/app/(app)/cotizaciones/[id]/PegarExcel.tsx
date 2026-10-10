'use client';

import { aEscalado, costoPartida, ESCALA_DINERO, formatearMXN } from '@celmi/core';
import {
  empatarCatalogo,
  estructurarPegado,
  leerPegado,
  normalizar,
  type FilaPegada,
} from '@celmi/validation';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Boton } from '@/components/ui';
import { useVentana, VentanaFlotante } from '@/components/VentanaFlotante';
import { leerTablaHtml } from '@/lib/pegado-html';
import { hoyLocal } from '@/lib/vigencia';
import { claveNueva, formatearCosto, type Catalogos, type FilaEditable } from './modelo';

/** Empata la unidad por nombre, clave o abreviatura («PIEZA», «pieza», «PZA»). */
function empatarUnidad(texto: string, unidades: Catalogos['unidades']) {
  const t = normalizar(texto);
  if (!t) return null;
  return (
    unidades.find(
      (u) => normalizar(u.nombre) === t || normalizar(u.id) === t || normalizar(u.abreviatura ?? '') === t,
    ) ?? null
  );
}

interface FilaRevisada {
  original: FilaPegada;
  mayorista: { id: string; nombre: string } | null;
  unidad: Catalogos['unidades'][number] | null;
  monedaValida: boolean;
  avisos: string[];
}

function revisar(f: FilaPegada, cat: Catalogos, errores: Map<number, string[]>): FilaRevisada {
  const mayorista = empatarCatalogo(f.mayorista, cat.mayoristas);
  const unidad = empatarUnidad(f.unidad, cat.unidades);
  const monedaValida = cat.monedas.some((m) => m.codigo === f.moneda);
  const avisos = [...(errores.get(f.fila) ?? [])];
  if (f.mayorista && !mayorista) avisos.push(`Mayorista «${f.mayorista}» no está en el catálogo`);
  if (f.unidad && !unidad) avisos.push(`Unidad «${f.unidad}» no está en el catálogo`);
  if (!monedaValida) avisos.push(`Moneda «${f.moneda}» no está en el catálogo`);
  if (f.vigencia && f.vigencia < hoyLocal()) avisos.push('Precio del mayorista vencido');
  return { original: f, mayorista, unidad, monedaValida, avisos };
}

function aFila(r: FilaRevisada, unidadPorOmision: string | null, contenido: unknown): FilaEditable {
  const f = r.original;
  return {
    clave: claveNueva('partida'),
    sku: f.sku,
    marca: f.marca.trim().slice(0, 80),
    descripcion: f.descripcion,
    // Formato de origen de la celda (negritas, cursivas…), si lo traía.
    descripcion_contenido: contenido ?? null,
    entrega: f.entrega,
    unidad_id: r.unidad?.id ?? unidadPorOmision,
    cantidad: f.cantidad != null ? String(f.cantidad) : '',
    se_suma: false,
    presentacion: 'linea',
    componentes: [],
    prorratear_entre: [],
    mayorista_id: r.mayorista?.id ?? null,
    moneda: r.monedaValida ? f.moneda : 'MXN',
    costo_unitario: f.costo ?? '',
    vigencia: f.vigencia,
    costo_anterior: null,
  };
}

/** Lo que se agrega: por propuesta (nombre null = a la propuesta elegida), partidas con sus adicionales. */
export interface GrupoPegado {
  nombre: string | null;
  filas: FilaEditable[];
}

/**
 * «Pegar desde Excel»: se copian las celdas de la Solicitud de precios (o cualquier hoja con encabezados reconocibles)
 * y se pegan aquí. Se muestra qué se reconoció antes de agregarlo; lo dudoso se marca, no se inventa.
 */
export function PegarExcel({
  textoInicial,
  htmlInicial = '',
  catalogos,
  propuestas,
  propuestaActual,
  onAgregar,
  onCerrar,
}: {
  textoInicial: string;
  /** Versión HTML de lo copiado (trae el formato de las celdas). */
  htmlInicial?: string;
  catalogos: Catalogos;
  propuestas: { clave: string; nombre: string }[];
  propuestaActual: string;
  /** `destino` sólo aplica si lo pegado no trae columna «Propuesta». */
  onAgregar: (grupos: GrupoPegado[], destino: string | 'nueva') => void;
  onCerrar: () => void;
}) {
  return (
    <VentanaFlotante
      titulo="Pegar desde Excel"
      detalle="Copia las filas de tu Solicitud de precios (con o sin encabezado) y pégalas aquí."
      onCerrar={onCerrar}
    >
      <Contenido
        textoInicial={textoInicial}
        htmlInicial={htmlInicial}
        catalogos={catalogos}
        propuestas={propuestas}
        propuestaActual={propuestaActual}
        onAgregar={onAgregar}
      />
    </VentanaFlotante>
  );
}

function Contenido({
  textoInicial,
  htmlInicial = '',
  catalogos,
  propuestas,
  propuestaActual,
  onAgregar,
}: Omit<Parameters<typeof PegarExcel>[0], 'onCerrar'>) {
  const ventana = useVentana();
  const [texto, setTexto] = useState(textoInicial);
  const [html, setHtml] = useState(htmlInicial);
  const [destino, setDestino] = useState<string>(propuestaActual);
  const unidadPorOmision = catalogos.unidades[0]?.id ?? null;

  const lectura = useMemo(() => {
    const r = leerPegado(texto);
    const errores = new Map<number, string[]>();
    for (const e of r.errores) errores.set(e.fila, [...(errores.get(e.fila) ?? []), e.mensaje]);
    // Formato de la descripción: misma celda en la tabla HTML (mismas filas, sin las vacías, y el mismo encabezado).
    const tabla = html ? leerTablaHtml(html) : [];
    const columna = r.columnas.indexOf('descripcion');
    const desde = r.conEncabezado ? 1 : 0;
    const formatos = r.filas.map((_, i) =>
      columna >= 0 ? (tabla[desde + i]?.[columna]?.contenido ?? null) : null,
    );
    // Adicionales («1.1» bajo «1») y propuestas (columna «Propuesta»), 2026-10-10.
    const estructura = estructurarPegado(r.filas, r.conPropuestas);
    for (const [fila, avisos] of estructura.avisos)
      errores.set(fila, [...(errores.get(fila) ?? []), ...avisos]);
    const revisadas = r.filas.map((f) => revisar(f, catalogos, errores));
    const porFila = new Map(
      revisadas.map((x, i) => [x.original.fila, { r: x, formato: formatos[i] ?? null }]),
    );
    const grupos: GrupoPegado[] = estructura.propuestas.map((p) => ({
      nombre: p.nombre,
      filas: p.partidas.flatMap(({ fila, adicionales }) => {
        const e = porFila.get(fila.fila);
        if (!e) return [];
        const partida = aFila(e.r, unidadPorOmision, e.formato);
        partida.componentes = adicionales.flatMap((a) => {
          const ea = porFila.get(a.fila);
          if (!ea) return [];
          const c = aFila(ea.r, unidadPorOmision, ea.formato);
          // Incluido en el precio si lleva la misma cantidad que su partida; si no, como línea visible.
          return [
            { ...c, presentacion: c.cantidad === partida.cantidad ? 'incluida' : 'linea' } as FilaEditable,
          ];
        });
        return [partida];
      }),
    }));
    const numAdicionales = estructura.propuestas.reduce(
      (s, p) => s + p.partidas.reduce((t, x) => t + x.adicionales.length, 0),
      0,
    );
    // Filas en el orden en que quedan: partida y debajo sus adicionales, agrupadas por propuesta.
    const vista = estructura.propuestas.flatMap((p) => [
      ...(p.nombre ? [{ tipo: 'propuesta' as const, nombre: p.nombre }] : []),
      ...p.partidas.flatMap((x) => [
        { tipo: 'partida' as const, r: porFila.get(x.fila.fila)!.r },
        ...x.adicionales.map((a) => ({ tipo: 'adicional' as const, r: porFila.get(a.fila)!.r })),
      ]),
    ]);
    return { ...r, formatos, revisadas, grupos, numAdicionales, vista };
  }, [texto, html, catalogos, unidadPorOmision]);
  const conFormato = lectura.formatos.filter(Boolean).length;
  const conAvisos = lectura.revisadas.filter((r) => r.avisos.length).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (lectura.revisadas.length) onAgregar(lectura.grupos, destino);
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave">
        Celdas copiadas
        <textarea
          name="pegado"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            // Si se edita a mano, el HTML pegado ya no corresponde.
            if (e.nativeEvent instanceof InputEvent && e.nativeEvent.inputType !== 'insertFromPaste')
              setHtml('');
          }}
          onPaste={(e) => setHtml(e.clipboardData.getData('text/html'))}
          rows={texto ? 4 : 6}
          autoFocus={!texto}
          spellCheck={false}
          placeholder="En Excel selecciona las filas (puedes incluir el encabezado), cópialas con Ctrl + C y pégalas aquí con Ctrl + V."
          className="w-full resize-y rounded-md border-2 border-texto/20 bg-superficie px-3 py-2.5 font-mono text-xs text-texto outline-none focus:border-acento focus:ring-4 focus:ring-acento-suave"
        />
      </label>

      {lectura.revisadas.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-exito-suave px-2.5 py-1 font-semibold text-exito">
              <Icon name="palomita" size={14} strokeWidth={2.6} />
              {lectura.revisadas.length - lectura.numAdicionales}{' '}
              {lectura.revisadas.length - lectura.numAdicionales === 1 ? 'partida' : 'partidas'}
              {lectura.numAdicionales > 0 &&
                ` + ${lectura.numAdicionales} ${lectura.numAdicionales === 1 ? 'adicional' : 'adicionales'}`}
            </span>
            {lectura.conPropuestas && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-acento-suave px-2.5 py-1 font-semibold text-acento-texto">
                {lectura.grupos.length} {lectura.grupos.length === 1 ? 'propuesta' : 'propuestas'}
              </span>
            )}
            {conFormato > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-acento-suave px-2.5 py-1 font-semibold text-acento-texto">
                <span className="font-bold">Aa</span>
                {conFormato} con formato de origen
              </span>
            )}
            {conAvisos > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-aviso-suave px-2.5 py-1 font-semibold text-aviso">
                {conAvisos} por revisar
              </span>
            )}
            <span className="text-xs text-texto-suave">
              {lectura.conEncabezado
                ? 'Columnas reconocidas por su encabezado.'
                : 'Sin encabezado: se asumió el orden de la Solicitud de precios.'}
              {lectura.ignoradas.length > 0 && ` No se usan: ${lectura.ignoradas.join(', ')}.`}
            </span>
          </div>

          <div className="max-h-[38vh] overflow-auto rounded-md border border-borde">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="sticky top-0 bg-superficie-2 text-texto-suave">
                <tr>
                  {[
                    '#',
                    'Partida',
                    'Descripción',
                    'Mayorista',
                    'Marca',
                    'Cant.',
                    'Costo unit.',
                    'Moneda',
                    'Vigencia',
                  ].map((t) => (
                    <th key={t} scope="col" className="px-2.5 py-2 font-semibold whitespace-nowrap">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lectura.vista.map((v) => {
                  if (v.tipo === 'propuesta')
                    return (
                      <tr key={`p-${v.nombre}`} className="border-t border-borde bg-acento-suave/50">
                        <td colSpan={9} className="px-2.5 py-1.5 text-xs font-bold text-acento-texto">
                          {v.nombre}
                        </td>
                      </tr>
                    );
                  const { r } = v;
                  const f = r.original;
                  let total = '';
                  try {
                    if (f.costo && f.cantidad)
                      total = formatearCosto(
                        costoPartida({ costoUnitario: f.costo, tipoCambio: '1', cantidad: f.cantidad })
                          .costoTotal,
                        f.moneda,
                      );
                  } catch {
                    total = '';
                  }
                  return (
                    <tr
                      key={f.fila}
                      className={`border-t border-borde ${r.avisos.length ? 'bg-aviso-suave/40' : ''}`}
                    >
                      <td className="px-2.5 py-2 text-texto-suave tabular">{f.fila}</td>
                      <td className="px-2.5 py-2 font-semibold whitespace-nowrap tabular">
                        {f.partida || '—'}
                      </td>
                      <td className={`max-w-[260px] px-2.5 py-2 ${v.tipo === 'adicional' ? 'pl-6' : ''}`}>
                        {v.tipo === 'adicional' && (
                          <span className="mb-0.5 block text-[10px] font-bold tracking-wide text-acento-texto uppercase">
                            ↳ Adicional
                          </span>
                        )}
                        <div className="truncate font-semibold" title={f.descripcion}>
                          {f.descripcion || <span className="text-peligro">Sin descripción</span>}
                        </div>
                        {r.avisos.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-aviso">{r.avisos.join(' · ')}</div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {r.mayorista ? (
                          <span
                            title={
                              f.mayorista !== r.mayorista.nombre ? `Pegado: «${f.mayorista}»` : undefined
                            }
                          >
                            {r.mayorista.nombre}
                          </span>
                        ) : (
                          <span className="text-texto-suave">{f.mayorista || '—'}</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        {f.marca || <span className="text-texto-suave">—</span>}
                      </td>
                      <td className="px-2.5 py-2 tabular">
                        {f.cantidad ?? <span className="text-peligro">?</span>}
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap tabular">
                        {f.costo ? (
                          formatearMXN(aEscalado(f.costo, ESCALA_DINERO))
                        ) : (
                          <span className="text-peligro">?</span>
                        )}
                        {total && <div className="text-[11px] text-texto-suave">total {total}</div>}
                      </td>
                      <td className="px-2.5 py-2">{f.moneda}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{f.vigencia || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {lectura.conPropuestas ? (
            <p className="text-xs text-texto-suave">
              Se agregan a{' '}
              <strong className="text-texto">{lectura.grupos.map((g) => g.nombre).join(', ')}</strong>: las
              que ya existen con ese nombre se completan; las demás se crean.
            </p>
          ) : (
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-texto-suave sm:flex-row sm:items-center sm:gap-3">
              Agregar a
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="h-10 rounded-md border-2 border-texto/20 bg-superficie px-3 text-sm text-texto outline-none focus:border-acento"
              >
                {propuestas.map((p) => (
                  <option key={p.clave} value={p.clave}>
                    {p.nombre}
                  </option>
                ))}
                <option value="nueva">Una propuesta nueva</option>
              </select>
            </label>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <Boton type="submit" variante="primario" icono="mas" disabled={!lectura.revisadas.length}>
          {lectura.revisadas.length ? `Agregar ${lectura.revisadas.length} renglones` : 'Agregar partidas'}
        </Boton>
        {ventana && (
          <Boton variante="fantasma" onClick={ventana.intentarCerrar}>
            Cancelar
          </Boton>
        )}
        {conAvisos > 0 && (
          <span className="text-xs text-texto-suave">
            Lo marcado se agrega igual y lo puedes corregir en la tabla.
          </span>
        )}
      </div>
    </form>
  );
}
