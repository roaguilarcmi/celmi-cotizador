import { formatearMXN } from '@celmi/core';
import { Document, Font, Page, Path, Polygon, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { ReactNode } from 'react';
import type { DatosPdf, LineaPdf, OpcionPdf, PropuestaPdf } from './datos-pdf';
import { LOGO_CELMI } from './logo';

/**
 * PDF de la cotización (Fase 4 · C; diseño B aprobado 2026-10-12). Todo es texto real (Helvetica, fuente estándar
 * de PDF: se puede seleccionar y buscar) y el logo es vector. Membrete del formato de CELMI: franjas índigo arriba y
 * abajo, triángulos azules en las esquinas y pie con los datos de la empresa en cada hoja.
 */

// Sin guiones de división de palabras («HÁ-BILES»): las palabras pasan completas a la siguiente línea.
Font.registerHyphenationCallback((palabra) => [palabra]);

const INDIGO = '#29235C';
const AZUL = '#0064EC';
const GRIS = '#6b6b75';
const LINEA = '#d9d9e3';
const SUAVE = '#f3f3f7';

const s = StyleSheet.create({
  pagina: {
    paddingTop: 118,
    paddingBottom: 92,
    paddingHorizontal: 46,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1d1d1f',
    lineHeight: 1.3,
  },
  derecha: { textAlign: 'right' },
  centro: { textAlign: 'center' },
  negrita: { fontWeight: 'bold' },
  th: {
    backgroundColor: INDIGO,
    color: 'white',
    fontWeight: 'bold',
    fontSize: 7,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  td: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 8, borderBottomWidth: 0.6, borderColor: LINEA },
  leyenda: { marginTop: 6, textAlign: 'center', fontSize: 8, fontWeight: 'bold' },
});

/** Ancho de cada columna de la tabla de bienes (suma 100 %). */
const COLS = ['40%', '9%', '11%', '7%', '8%', '12.5%', '12.5%'] as const;

export function CotizacionPdf({ d }: { d: DatosPdf }) {
  const principales = d.propuestas.filter((p) => !p.esAdicional);
  const adicionales = d.propuestas.filter((p) => p.esAdicional);
  return (
    <Document
      title={d.folio ? `Cotización ${d.folio}` : 'Vista previa de cotización'}
      author="CELMI Solutions"
      creator="Cotizador CELMI"
      producer="Cotizador CELMI"
      language="es-MX"
    >
      <Page size="LETTER" style={s.pagina}>
        <Membrete />
        {(d.vistaPrevia || d.cancelada) && <MarcaDeAgua texto={d.cancelada ? 'CANCELADA' : 'VISTA PREVIA'} />}

        <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
          <Text>{d.lugarFecha}</Text>
          <Text>
            COTIZACIÓN: <Text style={s.negrita}>{d.folio ?? 'se asigna al emitir'}</Text>
          </Text>
        </View>

        <View style={{ marginBottom: 10 }}>
          {[
            [d.destinatario.tratamiento, d.destinatario.nombre].filter(Boolean).join(' '),
            d.destinatario.puesto,
            d.destinatario.empresa,
          ]
            .filter((x) => x.trim().length > 0)
            .map((x) => (
              <Text key={x} style={s.negrita}>
                {x.toUpperCase()}
              </Text>
            ))}
          <Text style={[s.negrita, { letterSpacing: 2 }]}>PRESENTE</Text>
        </View>

        <Text style={{ marginBottom: 10 }}>
          Por medio de la presente, ponemos a su amable consideración la siguiente cotización
          {d.marcas.length ? (
            <>
              {' de los equipos de la marca '}
              <Text style={s.negrita}>{unir(d.marcas)}</Text>
            </>
          ) : null}
          , la cual ha sido elaborada conforme a sus requerimientos y necesidades.
        </Text>

        {principales.map((p, i) => (
          <Propuesta
            key={i}
            p={p}
            titulo={principales.length > 1 ? `Propuesta ${i + 1} · ${p.nombre}` : null}
          />
        ))}
        {adicionales.map((p, i) => (
          <Propuesta key={`a${i}`} p={p} titulo={p.nombre || 'Adicionales'} />
        ))}

        <Condiciones condiciones={d.condiciones} />
      </Page>
    </Document>
  );
}

const unir = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`;

/** Franjas, triángulos, logo y pie: fijos en cada hoja. */
function Membrete() {
  return (
    <>
      <View
        fixed
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16, backgroundColor: INDIGO }}
      />
      <Svg
        fixed
        style={{ position: 'absolute', top: 0, right: 0, width: 110, height: 66 }}
        viewBox="0 0 110 66"
      >
        <Polygon points="20,0 110,0 110,66" fill={AZUL} />
      </Svg>
      <View fixed style={{ position: 'absolute', top: 34, left: 46 }}>
        <Svg viewBox="0 0 168 30" style={{ width: 180, height: 32 }}>
          {LOGO_CELMI.map((p, i) => (
            <Path key={i} d={p.d} fill={p.fill} />
          ))}
        </Svg>
        <Text style={{ marginTop: 4, fontSize: 7.5, color: INDIGO }}>
          Integramos Soluciones, Transformamos Empresas y Entidades Gubernamentales.
        </Text>
      </View>
      <Svg
        fixed
        style={{ position: 'absolute', bottom: 0, left: 0, width: 110, height: 66 }}
        viewBox="0 0 110 66"
      >
        <Polygon points="0,0 90,66 0,66" fill={AZUL} />
      </Svg>
      <View
        fixed
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, backgroundColor: INDIGO }}
      />
      <View fixed style={{ position: 'absolute', bottom: 30, left: 0, right: 0 }}>
        <Text style={{ textAlign: 'center', fontSize: 7.5, color: GRIS, lineHeight: 1.35 }}>
          CELMILENIUM S.A. DE C.V.{'\n'}Plaza Juárez No. 116 Col. Centro, C.P. 42000, Pachuca, Hidalgo,
          México.
          {'\n'}RFC: CEL1812033U2 / Teléfono: (771) 717 45 00 · www.celmisolutions.com
        </Text>
      </View>
    </>
  );
}

function MarcaDeAgua({ texto }: { texto: string }) {
  return (
    <View fixed style={{ position: 'absolute', top: 330, left: 0, right: 0, alignItems: 'center' }}>
      <Text
        style={{
          fontSize: 64,
          fontWeight: 'bold',
          color: texto === 'CANCELADA' ? '#c0262d' : '#9aa0b4',
          opacity: 0.18,
          transform: 'rotate(-30deg)',
        }}
      >
        {texto}
      </Text>
    </View>
  );
}

function Propuesta({ p, titulo }: { p: PropuestaPdf; titulo: string | null }) {
  // Sin contenedor: cada pieza (tabla, totales, financiamiento) se corta de página por sí sola; dentro de un View
  // react-pdf llegaba a mover toda la propuesta a la hoja siguiente.
  return (
    <>
      {titulo && (
        <Text style={{ fontSize: 11, fontWeight: 'bold', color: INDIGO, marginBottom: 4 }}>{titulo}</Text>
      )}
      {!p.esAdicional && (
        <Text style={{ marginBottom: 4 }}>
          {[p.tipo && `Tipo: ${p.tipo}.`, p.modalidad && `Modalidad: ${p.modalidad}.`]
            .filter(Boolean)
            .join(' ')}
        </Text>
      )}
      <View style={{ flexDirection: 'row' }} wrap={false}>
        {[
          'DESCRIPCIÓN',
          'MARCA',
          'TIEMPO DE ENTREGA',
          'UNIDAD',
          'CANTIDAD',
          'PRECIO UNITARIO SIN IVA',
          'SUBTOTAL SIN IVA',
        ].map((h, i) => (
          <Text
            key={h}
            style={[s.th, { width: COLS[i], borderLeftWidth: i ? 0.6 : 0, borderColor: 'white' }]}
          >
            {h}
          </Text>
        ))}
      </View>
      {p.lineas.map((l, i) => (
        <FilaBien key={i} l={l} />
      ))}
      <View style={{ alignItems: 'flex-end', marginTop: 2 }} wrap={false}>
        {(
          [
            ['SUBTOTAL', p.subtotal],
            ['IVA', p.iva],
            ['TOTAL', p.total],
          ] as const
        ).map(([n, v]) => (
          <View key={n} style={{ flexDirection: 'row' }}>
            <Text style={[s.td, s.negrita, s.centro, { width: 70 }]}>{n}</Text>
            <Text style={[s.td, s.derecha, { width: 86 }, n === 'TOTAL' ? s.negrita : {}]}>
              {formatearMXN(v)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 8 }}>
        TOTAL CON LETRA: {p.totalConLetra}
      </Text>
      {p.financiamiento.length > 0 && <Financiamiento p={p} />}
      <View style={{ height: 14 }} />
    </>
  );
}

function FilaBien({ l }: { l: LineaPdf }) {
  const celda = (i: number, extra: Style = {}) => [s.td, { width: COLS[i] }, extra];
  return (
    <View style={{ flexDirection: 'row' }} wrap={false}>
      <View style={celda(0)}>
        <Enriquecido
          contenido={l.descripcion}
          respaldo={l.descripcionTexto}
          sufijo={l.sku ? ` [${l.sku}]` : ''}
          tamano={8}
        />
      </View>
      <Text style={celda(1, s.centro)}>{l.marca}</Text>
      <Text style={celda(2, s.centro)}>{l.entrega}</Text>
      <Text style={celda(3, s.centro)}>{l.unidad}</Text>
      <Text style={celda(4, s.centro)}>{l.cantidad}</Text>
      <Text style={celda(5, s.derecha)}>{formatearMXN(l.unitario)}</Text>
      <Text style={celda(6, s.derecha)}>{formatearMXN(l.importe)}</Text>
    </View>
  );
}

const montoOGuion = (v: bigint | null) => (v === null ? '—' : formatearMXN(v));

/** Diseño B: tabla comparativa con 2 o más opciones; diseño C (tarjeta) con una sola (2026-10-12). */
function Financiamiento({ p }: { p: PropuestaPdf }) {
  const ops = p.financiamiento;
  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      <Text style={{ fontSize: 10, fontWeight: 'bold', color: INDIGO, marginBottom: 5 }}>
        Opciones de financiamiento · valor de los equipos {formatearMXN(p.valorEquipos)} sin IVA
      </Text>
      {ops.length === 1 && ops[0] ? <Tarjeta o={ops[0]} /> : <Comparativo ops={ops} />}
      <Text style={s.leyenda}>**MONTOS DE ARRENDAMIENTO EXPRESADOS SIN IVA**</Text>
      <Text style={[s.leyenda, { marginTop: 1 }]}>
        **Los pagos de la presente son cantidades estimadas, pueden variar sin previo aviso**
      </Text>
    </View>
  );
}

const FILAS_FIN: [string, (o: OpcionPdf) => string][] = [
  ['Financiera', (o) => o.financiera || '—'],
  ['Gastos iniciales', (o) => montoOGuion(o.gastosIniciales)],
  ['Pago de los equipos', (o) => montoOGuion(o.pago)],
  ['Seguro', (o) => montoOGuion(o.seguro)],
  ['Factor', (o) => o.factor ?? '—'],
  [
    'Opción de compra',
    (o) =>
      o.opcionCompra
        ? `${formatearMXN(o.opcionCompra.monto)}${o.opcionCompra.pct ? ` (${o.opcionCompra.pct} %)` : ''}`
        : '—',
  ],
  ['Tasa anual', (o) => o.tasa ?? '—'],
];

function Comparativo({ ops }: { ops: OpcionPdf[] }) {
  const ancho = `${(100 - 24) / ops.length}%`;
  const tam = ops.length > 4 ? 7 : 8;
  return (
    <View wrap={false}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: '24%' }} />
        {ops.map((o, i) => (
          <View
            key={i}
            style={{
              width: ancho,
              backgroundColor: INDIGO,
              padding: 4,
              borderLeftWidth: 1.5,
              borderColor: 'white',
            }}
          >
            <Text style={{ color: 'white', fontSize: tam, textAlign: 'center' }}>{o.titulo}</Text>
            <Text style={{ color: 'white', fontSize: tam + 2, fontWeight: 'bold', textAlign: 'center' }}>
              {o.plazo}
            </Text>
          </View>
        ))}
      </View>
      {FILAS_FIN.map(([n, v]) => (
        <View key={n} style={{ flexDirection: 'row' }}>
          <Text style={[s.td, s.negrita, { width: '24%', fontSize: tam }]}>{n}</Text>
          {ops.map((o, i) => (
            <Text key={i} style={[s.td, s.centro, { width: ancho, fontSize: tam }]}>
              {v(o)}
            </Text>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: 'row' }}>
        <Text style={[s.td, s.negrita, { width: '24%', fontSize: tam, borderBottomWidth: 0 }]}>
          Pago {ops[0]?.frecuencia ?? 'mensual'} total
        </Text>
        {ops.map((o, i) => (
          <Text
            key={i}
            style={[
              s.td,
              s.centro,
              {
                width: ancho,
                fontSize: tam + 2,
                fontWeight: 'bold',
                color: AZUL,
                backgroundColor: '#E8F0FD',
                borderBottomWidth: 0,
              },
            ]}
          >
            {o.total === null ? '—' : `${formatearMXN(o.total)} + IVA`}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Tarjeta({ o }: { o: OpcionPdf }) {
  return (
    <View
      style={{
        borderWidth: 0.8,
        borderColor: LINEA,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 7, paddingBottom: 2 }}>
        <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{o.titulo}</Text>
        <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{o.plazo}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 7, paddingBottom: 6 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: AZUL }}>
          {o.total === null ? '—' : formatearMXN(o.total)}
        </Text>
        <Text style={{ color: GRIS, marginLeft: 4, marginBottom: 2 }}>
          + IVA de pago {o.frecuencia} (equipos + seguro)
        </Text>
      </View>
      {/* Detalle en renglones de anchos fijos (los renglones flexibles confunden el corte de página de react-pdf). */}
      <View style={{ borderTopWidth: 0.6, borderColor: LINEA, padding: 7, backgroundColor: SUAVE }}>
        {[0, 1, 2, 3].map((r) => (
          <View key={r} style={{ flexDirection: 'row', paddingVertical: 1.5 }}>
            {[FILAS_FIN[r], FILAS_FIN[r + 4]].map((fila, c) =>
              fila ? (
                <View
                  key={c}
                  style={{
                    width: '50%',
                    flexDirection: 'row',
                    paddingRight: c === 0 ? 14 : 0,
                    paddingLeft: c === 1 ? 14 : 0,
                  }}
                >
                  <Text style={{ width: '55%', fontSize: 8, color: GRIS }}>{fila[0]}</Text>
                  <Text style={{ width: '45%', fontSize: 8, textAlign: 'right' }}>{fila[1](o)}</Text>
                </View>
              ) : (
                <View key={c} style={{ width: '50%' }} />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function Condiciones({ condiciones }: { condiciones: unknown[] }) {
  return (
    <View style={{ marginTop: 6 }}>
      {condiciones.length > 0 && (
        <>
          <Text style={{ color: AZUL, fontSize: 10, marginBottom: 4 }} minPresenceAhead={40}>
            Términos y Condiciones
          </Text>
          {condiciones.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }} wrap={false}>
              <Text style={{ width: 10 }}>•</Text>
              <View style={{ flex: 1 }}>
                <Enriquecido contenido={c} respaldo="" tamano={8.5} />
              </View>
            </View>
          ))}
        </>
      )}
      <View style={{ marginTop: 28, alignItems: 'center' }} wrap={false}>
        <Text style={{ letterSpacing: 2 }}>ATENTAMENTE</Text>
        <View style={{ marginTop: 34, width: 200, borderTopWidth: 0.8, borderColor: '#000', paddingTop: 3 }}>
          <Text style={[s.negrita, s.centro]}>Alejandro Bonilla Becerril</Text>
          <Text style={[s.negrita, s.centro]}>GERENTE CELMISOLUTIONS</Text>
        </View>
      </View>
    </View>
  );
}

// ───────────── Texto con formato (Tiptap JSON validado) → react-pdf ─────────────

interface Nodo {
  type?: string;
  text?: string;
  content?: Nodo[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined);

function estiloDeMarcas(marks: Nodo['marks']): Style {
  const e: Style = {};
  const decoraciones: string[] = [];
  for (const m of marks ?? []) {
    if (m.type === 'bold') e.fontWeight = 'bold';
    else if (m.type === 'italic') e.fontStyle = 'italic';
    else if (m.type === 'underline') decoraciones.push('underline');
    else if (m.type === 'strike') decoraciones.push('line-through');
    else if (m.type === 'textStyle' && color(m.attrs?.color)) e.color = color(m.attrs?.color);
    else if (m.type === 'highlight') e.backgroundColor = color(m.attrs?.color) ?? '#fff3a3';
  }
  if (decoraciones.length) e.textDecoration = decoraciones.join(' ') as Style['textDecoration'];
  return e;
}

function enLinea(nodos: Nodo[] | undefined): ReactNode[] {
  return (nodos ?? []).map((n, i) =>
    n.type === 'text' ? (
      <Text key={i} style={estiloDeMarcas(n.marks)}>
        {n.text ?? ''}
      </Text>
    ) : n.type === 'hardBreak' ? (
      <Text key={i}>{'\n'}</Text>
    ) : null,
  );
}

/** El sufijo (el SKU en corchetes) se agrega en negritas al final del primer párrafo: el título. */
function Enriquecido({
  contenido,
  respaldo,
  sufijo = '',
  tamano,
}: {
  contenido: unknown;
  respaldo: string;
  sufijo?: string;
  tamano: number;
}) {
  const doc = contenido as Nodo | null;
  const bloques = doc?.type === 'doc' && Array.isArray(doc.content) ? doc.content : null;
  if (!bloques || bloques.length === 0)
    return (
      <Text style={{ fontSize: tamano }}>
        <Text style={s.negrita}>{respaldo}</Text>
        {sufijo && <Text style={s.negrita}>{sufijo}</Text>}
      </Text>
    );
  // El título es el primer párrafo de primer nivel.
  const titulo = bloques.find((b) => b.type === 'paragraph' || b.type === 'heading');
  const bloque = (n: Nodo, i: number, nivel = 0): ReactNode => {
    if (n.type === 'paragraph' || n.type === 'heading') {
      const conSufijo = n === titulo && sufijo;
      return (
        <Text key={i} style={{ fontSize: tamano }}>
          {enLinea(n.content)}
          {conSufijo && <Text style={s.negrita}>{sufijo}</Text>}
        </Text>
      );
    }
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      return (
        <View key={i} style={{ marginLeft: nivel ? 8 : 2 }}>
          {(n.content ?? []).map((item, j) => (
            <View key={j} style={{ flexDirection: 'row' }}>
              <Text style={{ width: 9, fontSize: tamano }}>
                {n.type === 'orderedList' ? `${j + 1}.` : '•'}
              </Text>
              <View style={{ flex: 1 }}>{(item.content ?? []).map((c, k) => bloque(c, k, nivel + 1))}</View>
            </View>
          ))}
        </View>
      );
    }
    return null;
  };
  return <View>{bloques.map((b, i) => bloque(b, i))}</View>;
}
