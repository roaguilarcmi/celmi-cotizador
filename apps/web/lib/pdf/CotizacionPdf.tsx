import { formatearMXN } from '@celmi/core';
import {
  Circle,
  Defs,
  Document,
  Font,
  LinearGradient,
  Link,
  Page,
  Path,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { ReactNode } from 'react';
import type { DatosPdf, LineaPdf, OpcionPdf, PropuestaPdf } from './datos-pdf';
import { LOGO_CELMI } from './logo';

/**
 * PDF de la cotización (Fase 4 · C). Diseño C elegido por Rodrigo (2026-10-13): encabezado con degradado índigo → azul
 * con el logo en blanco, el isotipo translúcido y el destinatario; el contenido en tarjetas blancas sobre fondo gris
 * claro; la gigantografía del isotipo como marca de agua; la tarjeta del ejecutivo, centrada, al final; el pie con los
 * datos de la empresa y el número de hoja en cada hoja. Todo es texto real (Helvetica) y el logo es vector.
 */

// Sin guiones de división de palabras («HÁ-BILES»): las palabras pasan completas a la siguiente línea.
Font.registerHyphenationCallback((palabra) => [palabra]);

const INDIGO = '#29235C';
const INDIGO_MEDIO = '#3E3880';
const AZUL = '#0064EC';
const GRIS = '#6b6b75';
const LINEA = '#dcdce6';
const CEBRA = '#f7f7fb';
const RESALTE = '#EAF1FE';
const RADIO = 4;

const s = StyleSheet.create({
  pagina: {
    paddingTop: 34,
    paddingBottom: 70,
    paddingHorizontal: 0,
    backgroundColor: '#f4f5fa',
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1d1d1f',
    // Sin lineHeight aquí: heredado de la hoja, react-pdf deja de dibujar el número de página (texto dinámico).
    // Se aplica en las tarjetas, el encabezado y la tarjeta del ejecutivo.
  },
  derecha: { textAlign: 'right' },
  centro: { textAlign: 'center' },
  negrita: { fontWeight: 'bold' },
  leyenda: { marginTop: 6, textAlign: 'center', fontSize: 8, fontWeight: 'bold' },
  tituloSeccion: { fontSize: 10, fontWeight: 'bold', color: INDIGO, marginBottom: 5 },
});

// ───────────── Tabla con el mismo estilo en precios, totales y financiamiento (2026-10-13) ─────────────

/** Celda de encabezado: índigo, texto blanco centrado en ambos sentidos. */
function Th({
  children,
  ancho,
  primera,
  ultima,
  fondo = INDIGO,
  tam = 7,
  radio = true,
}: {
  children: ReactNode;
  ancho: string | number;
  primera?: boolean;
  ultima?: boolean;
  fondo?: string;
  tam?: number;
  /** Esquinas superiores redondeadas (sólo el primer renglón de encabezado). */
  radio?: boolean;
}) {
  return (
    <View
      style={{
        width: ancho,
        backgroundColor: fondo,
        justifyContent: 'center',
        paddingVertical: 4,
        paddingHorizontal: 3,
        borderRightWidth: ultima ? 0 : 0.6,
        borderColor: '#ffffff55',
        borderTopLeftRadius: radio && primera ? RADIO : 0,
        borderTopRightRadius: radio && ultima ? RADIO : 0,
      }}
    >
      <Text style={{ color: 'white', fontWeight: 'bold', fontSize: tam, textAlign: 'center' }}>
        {children}
      </Text>
    </View>
  );
}

/** Renglón del cuerpo: bordes sutiles a los lados y abajo; cebra opcional; esquinas redondeadas en el último. */
const renglon = (cebra: boolean, ultimo: boolean): Style => ({
  flexDirection: 'row',
  borderLeftWidth: 0.6,
  borderRightWidth: 0.6,
  borderBottomWidth: 0.6,
  borderColor: LINEA,
  backgroundColor: cebra ? CEBRA : 'white',
  borderBottomLeftRadius: ultimo ? RADIO : 0,
  borderBottomRightRadius: ultimo ? RADIO : 0,
});

/** Celda del cuerpo con separador vertical sutil. */
const td = (ancho: string | number, ultima = false, extra: Style = {}): Style => ({
  width: ancho,
  paddingVertical: 4,
  paddingHorizontal: 5,
  fontSize: 8,
  borderRightWidth: ultima ? 0 : 0.6,
  borderColor: LINEA,
  justifyContent: 'center',
  ...extra,
});

/** Ancho de cada columna de la tabla de bienes (suma 100 %). */
const COLS = ['40%', '9%', '11%', '7%', '8%', '12.5%', '12.5%'] as const;
const ENCABEZADOS = [
  'DESCRIPCIÓN',
  'MARCA',
  'TIEMPO DE ENTREGA',
  'UNIDAD',
  'CANTIDAD',
  'PRECIO UNITARIO SIN IVA',
  'SUBTOTAL SIN IVA',
];

// ───────────── Tarjetas (diseño C) ─────────────

/** Margen lateral de las tarjetas y relleno interior. */
const M = 34;
const PAD = 14;
const RADIO_CAJA = 8;
const ISOTIPO = LOGO_CELMI.slice(-2);

/**
 * Tramo de una tarjeta blanca. Cada tramo se corta de página por sí solo (react-pdf movía los contenedores grandes
 * completos a la hoja siguiente): el primero lleva el borde y las esquinas de arriba, el último los de abajo.
 */
function Caja({
  children,
  inicio,
  fin,
  separar = 12,
  arriba,
}: {
  children: ReactNode;
  inicio?: boolean;
  fin?: boolean;
  /** Espacio antes de la tarjeta (sólo en su primer tramo). */
  separar?: number;
  /** Margen superior propio (la primera tarjeta se monta sobre el encabezado). */
  arriba?: number;
}) {
  return (
    <View
      wrap={false}
      style={{
        marginHorizontal: M,
        paddingHorizontal: PAD,
        backgroundColor: 'white',
        // El interlineado se calcula con el tamaño de letra del contenedor: se declaran juntos.
        fontSize: 9,
        lineHeight: 1.3,
        borderLeftWidth: 0.6,
        borderRightWidth: 0.6,
        borderColor: LINEA,
        ...(inicio && {
          marginTop: arriba ?? separar,
          paddingTop: 12,
          borderTopWidth: 0.6,
          borderTopLeftRadius: RADIO_CAJA,
          borderTopRightRadius: RADIO_CAJA,
        }),
        ...(fin && {
          paddingBottom: 12,
          borderBottomWidth: 0.6,
          borderBottomLeftRadius: RADIO_CAJA,
          borderBottomRightRadius: RADIO_CAJA,
        }),
      }}
    >
      {children}
    </View>
  );
}

const Etiqueta = ({ children, color = GRIS }: { children: ReactNode; color?: string }) => (
  <Text style={{ fontSize: 7, letterSpacing: 1.4, color, fontWeight: 'bold' }}>{children}</Text>
);

export function CotizacionPdf({ d }: { d: DatosPdf }) {
  const principales = d.propuestas.filter((p) => !p.esAdicional);
  const adicionales = d.propuestas.filter((p) => p.esAdicional);
  const todas = [
    ...principales.map((p, i) => ({
      p,
      titulo: principales.length > 1 ? `PROPUESTA ${i + 1} · ${p.nombre.toUpperCase()}` : null,
    })),
    ...adicionales.map((p) => ({ p, titulo: (p.nombre || 'Adicionales').toUpperCase() })),
  ];
  return (
    <Document
      title={d.folio ? `Cotización ${d.folio}` : 'Vista previa de cotización'}
      author="CELMI Solutions"
      creator="Cotizador CELMI"
      producer="Cotizador CELMI"
      language="es-MX"
    >
      <Page size="LETTER" style={s.pagina}>
        <LineaSuperior />
        {/* Gigantografía del isotipo (2026-10-13): detrás, en color sólido claro, para que se vea en cualquier visor. */}
        <Svg
          fixed
          style={{ position: 'absolute', top: 250, right: -150, width: 560, height: 290 }}
          viewBox="-2 0 58 30"
        >
          {ISOTIPO.map((t, i) => (
            <Path key={i} d={t.d} fill="#e2e5f1" />
          ))}
        </Svg>
        <Encabezado d={d} />

        {todas.map(({ p, titulo }, i) => (
          <Propuesta key={i} p={p} titulo={titulo} d={d} primera={i === 0} />
        ))}

        <Condiciones condiciones={d.condiciones} />
        <TarjetaEjecutivo firma={d.firma} />

        <Pie />
        {/* Número de hoja (2026-10-13): hijo directo de la hoja; dentro de un componente react-pdf no lo dibuja. */}
        <View
          fixed
          style={{
            position: 'absolute',
            bottom: 13,
            right: M,
            width: 66,
            paddingVertical: 3,
            backgroundColor: '#f4f5fa',
            borderWidth: 0.6,
            borderColor: LINEA,
            borderRadius: 9,
          }}
        >
          <Text
            style={{ textAlign: 'center', fontSize: 7, color: GRIS }}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
        {/* …y encima, muy tenue (opacidad por trazo: la del Svg no la respeta react-pdf), para que también se aprecie sobre las tarjetas blancas. */}
        <Svg
          fixed
          style={{ position: 'absolute', top: 250, right: -150, width: 560, height: 290 }}
          viewBox="-2 0 58 30"
        >
          {ISOTIPO.map((t, i) => (
            <Path key={i} d={t.d} fill={INDIGO} fillOpacity={0.06} />
          ))}
        </Svg>
        {(d.vistaPrevia || d.cancelada) && <MarcaDeAgua texto={d.cancelada ? 'CANCELADA' : 'VISTA PREVIA'} />}
      </Page>
    </Document>
  );
}

const unir = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`;

/** Línea con degradado en el borde superior de cada hoja (en la primera la cubre el encabezado). */
function LineaSuperior() {
  return (
    <Svg fixed style={{ position: 'absolute', top: 0, left: 0, width: 612, height: 5 }} viewBox="0 0 612 5">
      <Defs>
        <LinearGradient id="linea" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={INDIGO} />
          <Stop offset="1" stopColor={AZUL} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="612" height="5" fill="url(#linea)" />
    </Svg>
  );
}

/** Encabezado de la primera hoja: degradado índigo → azul, logo en blanco, isotipo translúcido y destinatario. */
function Encabezado({ d }: { d: DatosPdf }) {
  const persona = [d.destinatario.tratamiento, d.destinatario.nombre].filter(Boolean).join(' ');
  const cargo = [d.destinatario.puesto, d.destinatario.empresa].filter((x) => x.trim()).join(' · ');
  return (
    <View style={{ marginTop: -34, height: 198, position: 'relative', fontSize: 9, lineHeight: 1.3 }}>
      {/* Sangrado: el fondo rebasa 4 pt cada borde para que ningún visor deje una línea blanca (2026-10-13). */}
      <Svg style={{ position: 'absolute', top: -4, left: -4, width: 620, height: 202 }} viewBox="0 0 620 202">
        <Defs>
          <LinearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={INDIGO} />
            <Stop offset="0.55" stopColor="#2b2f8f" />
            <Stop offset="1" stopColor={AZUL} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="620" height="202" fill="url(#fondo)" />
      </Svg>
      <Svg
        style={{ position: 'absolute', top: -26, right: -48, width: 330, height: 172 }}
        viewBox="-2 0 58 30"
      >
        {ISOTIPO.map((t, i) => (
          <Path key={i} d={t.d} fill="white" fillOpacity={0.13} />
        ))}
      </Svg>
      <View style={{ paddingHorizontal: M + 4, paddingTop: 28 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Svg viewBox="0 0 168 30" style={{ width: 170, height: 30 }}>
            {LOGO_CELMI.map((t, i) => (
              <Path key={i} d={t.d} fill="white" />
            ))}
          </Svg>
          <Text style={{ fontSize: 8.5, color: 'white', opacity: 0.85 }}>{d.lugarFecha}</Text>
        </View>
        <Text style={{ fontSize: 7.5, color: 'white', opacity: 0.75, marginTop: 4 }}>
          Integramos Soluciones, Transformamos Empresas y Entidades Gubernamentales.
        </Text>
        <Text style={{ marginTop: 22, fontSize: 8, letterSpacing: 1.6, color: 'white', opacity: 0.75 }}>
          COTIZACIÓN{' '}
          <Text style={{ fontWeight: 'bold', opacity: 1 }}>{d.folio ?? 'SE ASIGNA AL EMITIR'}</Text>
        </Text>
        <Text style={{ marginTop: 6, fontSize: 18, lineHeight: 1.25, fontWeight: 'bold', color: 'white' }}>
          {persona || d.destinatario.empresa}
        </Text>
        {cargo && (
          <Text style={{ marginTop: 2, fontSize: 10.5, lineHeight: 1.3, color: 'white', opacity: 0.9 }}>
            {cargo}
          </Text>
        )}
        <Text
          style={{
            marginTop: 7,
            fontSize: 7.5,
            letterSpacing: 3,
            color: 'white',
            opacity: 0.7,
            fontWeight: 'bold',
          }}
        >
          PRESENTE
        </Text>
      </View>
    </View>
  );
}

/** Pie fijo: franja blanca con los datos de la empresa. */
function Pie() {
  return (
    <View
      fixed
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 44,
        backgroundColor: 'white',
        borderTopWidth: 0.6,
        borderColor: LINEA,
        justifyContent: 'center',
      }}
    >
      {/* Detalle sutil (2026-10-13): línea degradada en el borde e isotipo pequeño y tenue a la izquierda. */}
      <Svg
        style={{ position: 'absolute', top: -0.6, left: 0, width: 612, height: 1.6 }}
        viewBox="0 0 612 1.6"
      >
        <Defs>
          <LinearGradient id="pie" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={INDIGO} stopOpacity={0.5} />
            <Stop offset="0.5" stopColor={AZUL} stopOpacity={0.35} />
            <Stop offset="1" stopColor={AZUL} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="612" height="1.6" fill="url(#pie)" />
      </Svg>
      <Svg style={{ position: 'absolute', top: 13, left: M, width: 36, height: 19 }} viewBox="-2 0 58 30">
        {ISOTIPO.map((t, i) => (
          <Path key={i} d={t.d} fill="#c9cde0" />
        ))}
      </Svg>
      <Text style={{ textAlign: 'center', fontSize: 7.5, color: GRIS, lineHeight: 1.4 }}>
        CELMILENIUM S.A. DE C.V. · Plaza Juárez No. 116 Col. Centro, C.P. 42000, Pachuca, Hidalgo, México.
        {'\n'}RFC: CEL1812033U2 · Teléfono: (771) 717 45 00 · www.celmisolutions.com
      </Text>
    </View>
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

/** Tarjeta de una propuesta: datos, párrafo, tabla, totales y total con letra; luego su financiamiento. */
function Propuesta({
  p,
  titulo,
  d,
  primera,
}: {
  p: PropuestaPdf;
  titulo: string | null;
  d: DatosPdf;
  primera: boolean;
}) {
  const tipoModalidad = [
    p.tipo && `TIPO: ${p.tipo.toUpperCase()}`,
    p.modalidad && `MODALIDAD: ${p.modalidad.toUpperCase()}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <Caja inicio arriba={primera ? -26 : 16}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Etiqueta color={titulo ? INDIGO : GRIS}>{titulo ?? tipoModalidad}</Etiqueta>
          <Etiqueta>VIGENCIA {d.vigencia.toUpperCase()}</Etiqueta>
        </View>
        {titulo && !p.esAdicional && tipoModalidad && (
          <View style={{ marginTop: 2 }}>
            <Etiqueta>{tipoModalidad}</Etiqueta>
          </View>
        )}
        {primera && (
          <Text style={{ marginTop: 8, fontSize: 9, lineHeight: 1.45 }}>
            Por medio de la presente, ponemos a su amable consideración la siguiente cotización
            {d.marcas.length ? (
              <>
                {' de los equipos de la marca '}
                <Text style={s.negrita}>{unir(d.marcas)}</Text>
              </>
            ) : null}
            , la cual ha sido elaborada conforme a sus requerimientos y necesidades.
          </Text>
        )}
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          {ENCABEZADOS.map((h, i) => (
            <Th key={h} ancho={COLS[i] ?? 0} primera={i === 0} ultima={i === ENCABEZADOS.length - 1}>
              {h}
            </Th>
          ))}
        </View>
      </Caja>
      {p.lineas.map((l, i) => (
        <Caja key={i}>
          <FilaBien l={l} cebra={i % 2 === 1} ultima={i === p.lineas.length - 1} />
        </Caja>
      ))}
      <Caja fin>
        <Totales p={p} />
        <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 8 }}>
          TOTAL CON LETRA: {p.totalConLetra}
        </Text>
      </Caja>
      {p.financiamiento.length > 0 && (
        <Caja inicio fin>
          <Financiamiento p={p} />
        </Caja>
      )}
    </>
  );
}

function FilaBien({ l, cebra, ultima }: { l: LineaPdf; cebra: boolean; ultima: boolean }) {
  const ultimaCol = COLS.length - 1;
  const celda = (i: number, extra: Style = {}) => td(COLS[i] ?? 0, i === ultimaCol, extra);
  return (
    <View style={renglon(cebra, ultima)} wrap={false}>
      <View style={celda(0, { justifyContent: 'flex-start' })}>
        <Enriquecido
          contenido={l.descripcion}
          respaldo={l.descripcionTexto}
          sufijo={l.sku ? ` [${l.sku}]` : ''}
          tamano={8}
        />
      </View>
      <View style={celda(1)}>
        <Text style={s.centro}>{l.marca}</Text>
      </View>
      <View style={celda(2)}>
        <Text style={s.centro}>{l.entrega}</Text>
      </View>
      <View style={celda(3)}>
        <Text style={s.centro}>{l.unidad}</Text>
      </View>
      <View style={celda(4)}>
        <Text style={s.centro}>{l.cantidad}</Text>
      </View>
      <View style={celda(5)}>
        <Text style={s.derecha}>{formatearMXN(l.unitario)}</Text>
      </View>
      <View style={celda(6)}>
        <Text style={s.derecha}>{formatearMXN(l.importe)}</Text>
      </View>
    </View>
  );
}

/** Subtotal, IVA y total: mismo estilo que la tabla, alineados con las dos últimas columnas. */
function Totales({ p }: { p: PropuestaPdf }) {
  const filas = [
    ['SUBTOTAL', p.subtotal],
    ['IVA', p.iva],
    ['TOTAL', p.total],
  ] as const;
  return (
    <View style={{ alignItems: 'flex-end', marginTop: 6 }} wrap={false}>
      <View style={{ width: '25%', borderWidth: 0.6, borderColor: LINEA, borderRadius: RADIO }}>
        {filas.map(([n, v], i) => {
          const total = n === 'TOTAL';
          return (
            <View
              key={n}
              style={{
                flexDirection: 'row',
                borderBottomWidth: i < filas.length - 1 ? 0.6 : 0,
                borderColor: LINEA,
                backgroundColor: total ? INDIGO : i % 2 ? CEBRA : 'white',
                borderBottomLeftRadius: total ? RADIO : 0,
                borderBottomRightRadius: total ? RADIO : 0,
                borderTopLeftRadius: i === 0 ? RADIO : 0,
                borderTopRightRadius: i === 0 ? RADIO : 0,
              }}
            >
              <Text
                style={{
                  width: '50%',
                  paddingVertical: 4,
                  paddingHorizontal: 5,
                  fontSize: 8,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  color: total ? 'white' : '#1d1d1f',
                  borderRightWidth: 0.6,
                  borderColor: total ? '#ffffff55' : LINEA,
                }}
              >
                {n}
              </Text>
              <Text
                style={{
                  width: '50%',
                  paddingVertical: 4,
                  paddingHorizontal: 5,
                  fontSize: 8,
                  textAlign: 'right',
                  fontWeight: total ? 'bold' : 'normal',
                  color: total ? 'white' : '#1d1d1f',
                }}
              >
                {formatearMXN(v)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ───────────── Financiamiento ─────────────

const NADA = '—';
const montoOGuion = (v: bigint | null) => (v === null ? NADA : formatearMXN(v));

type FilaFin = [string, (o: OpcionPdf) => string];

/** «Mensualidad» o «Pago bimestral»… según la frecuencia. */
const nombrePago = (frecuencia: string) => (frecuencia === 'mensual' ? 'Mensualidad' : `Pago ${frecuencia}`);

/**
 * Conceptos en tres bloques (2026-10-13), para que el cliente no confunda los pagos únicos con las mensualidades:
 * datos generales, mensualidades (con su total) y pagos únicos al final.
 */
const secciones = (frecuencia: string): { titulo: string; filas: FilaFin[] }[] => [
  {
    titulo: 'DATOS GENERALES',
    filas: [
      ['Financiera', (o) => o.financiera || NADA],
      ['Tasa anual', (o) => o.tasa ?? NADA],
      ['Factor', (o) => o.factor ?? NADA],
    ],
  },
  {
    titulo: frecuencia === 'mensual' ? 'MENSUALIDADES' : 'PAGOS PERIÓDICOS',
    filas: [
      [`${nombrePago(frecuencia)} de los equipos`, (o) => montoOGuion(o.pago)],
      [`${nombrePago(frecuencia)} de seguro`, (o) => montoOGuion(o.seguro)],
    ],
  },
  {
    titulo: 'PAGOS ÚNICOS',
    filas: [
      ['Gastos iniciales', (o) => montoOGuion(o.gastosIniciales)],
      [
        'Opción de compra',
        (o) =>
          o.opcionCompra
            ? `${formatearMXN(o.opcionCompra.monto)}${o.opcionCompra.pct ? ` (${o.opcionCompra.pct} %)` : ''}`
            : NADA,
      ],
    ],
  },
];

/** Sólo los conceptos (y bloques) que aparecen en al menos una opción (2026-10-13). */
const conDatos = (ops: OpcionPdf[]) =>
  secciones(ops[0]?.frecuencia ?? 'mensual')
    .map((sec) => ({ ...sec, filas: sec.filas.filter(([, v]) => ops.some((o) => v(o) !== NADA)) }))
    .filter((sec) => sec.filas.length > 0);

/** Notas bajo la comparativa: cuándo se pagan los gastos iniciales y las mensualidades (2026-10-13). */
function NotasFinanciamiento({ ops }: { ops: OpcionPdf[] }) {
  const mensual = ops.every((o) => o.frecuencia === 'mensual');
  const conGastos = ops.some((o) => o.gastosIniciales !== null);
  const conOpcion = ops.some((o) => o.opcionCompra !== null);
  const notas = [
    conGastos && 'Los gastos iniciales se pagan por única ocasión, junto con la primera mensualidad.',
    mensual
      ? 'Las mensualidades se pagan a mes vencido.'
      : 'Los pagos se realizan al vencimiento de cada periodo.',
    conOpcion && 'La opción de compra se ejerce al término del plazo (arrendamiento financiero).',
  ].filter((x): x is string => Boolean(x));
  return (
    <View style={{ marginTop: 5 }}>
      {notas.map((n) => (
        <View key={n} style={{ flexDirection: 'row' }}>
          <Text style={{ width: 8, fontSize: 7.5, color: GRIS }}>•</Text>
          <Text style={{ flex: 1, fontSize: 7.5, color: GRIS }}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

/** Diseño B: tabla comparativa con 2 o más opciones; diseño C (tarjeta) con una sola (2026-10-12). */
function Financiamiento({ p }: { p: PropuestaPdf }) {
  const ops = p.financiamiento;
  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      <Text style={s.tituloSeccion}>
        Opciones de financiamiento · valor de los equipos {formatearMXN(p.valorEquipos)} sin IVA
      </Text>
      {ops.length === 1 && ops[0] ? <Tarjeta o={ops[0]} /> : <Comparativo ops={ops} />}
      <NotasFinanciamiento ops={ops} />
      <Text style={s.leyenda}>**MONTOS DE ARRENDAMIENTO EXPRESADOS SIN IVA**</Text>
      <Text style={[s.leyenda, { marginTop: 1 }]}>
        **Los pagos de la presente son cantidades estimadas, pueden variar sin previo aviso**
      </Text>
    </View>
  );
}

const TIPO_CORTO: Record<string, string> = { vjm: 'Puro (VJM)', fpo: 'Financiero (FPO)' };
/** Dentro de cada plazo, primero el puro y luego el financiero (como el formato actual). */
const ORDEN_TIPO = (t: string | null) => (t === 'vjm' ? 0 : t === 'fpo' ? 1 : 2);

/** Renglón que titula un bloque de conceptos (datos generales, mensualidades, pagos únicos). */
function TituloBloque({ children }: { children: string }) {
  return (
    <View
      style={{
        borderLeftWidth: 0.6,
        borderRightWidth: 0.6,
        borderBottomWidth: 0.6,
        borderColor: LINEA,
        backgroundColor: '#e9eaf3',
        paddingVertical: 2.5,
        paddingHorizontal: 5,
      }}
    >
      <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: INDIGO, letterSpacing: 0.8 }}>{children}</Text>
    </View>
  );
}

/**
 * Comparativa con el estilo de la tabla de precios, **agrupada por plazo** (2026-10-13): un encabezado por plazo que
 * abarca sus opciones, un separador más marcado entre plazos y un tinte alterno por grupo, para comparar peras con
 * peras. Los conceptos van en bloques; la mensualidad total cierra el bloque de mensualidades y los pagos únicos van
 * al final, separados.
 */
function Comparativo({ ops: originales }: { ops: OpcionPdf[] }) {
  const ops = [...originales].sort(
    (a, b) => a.plazoMeses - b.plazoMeses || ORDEN_TIPO(a.tipo) - ORDEN_TIPO(b.tipo),
  );
  const grupos = [...new Set(ops.map((o) => o.plazoMeses))].map((plazo) => ({
    plazo,
    ops: ops.filter((o) => o.plazoMeses === plazo),
  }));
  const bloques = conDatos(ops);
  const frecuencia = ops[0]?.frecuencia ?? 'mensual';
  const etiqueta = 24;
  const ancho = (100 - etiqueta) / ops.length;
  const tam = ops.length > 4 ? 7 : 8;
  // Por cada opción: si empieza un grupo (separador) y si su grupo va tintado.
  const meta = grupos.flatMap((g, gi) =>
    g.ops.map((o, j) => ({ o, inicio: j === 0 && gi > 0, tinte: gi % 2 === 1 })),
  );
  const separador = (inicio: boolean): Style =>
    inicio ? { borderLeftWidth: 1.6, borderLeftColor: '#b9b9cc' } : {};
  const ultimoBloque = bloques.at(-1);

  const renglonDatos = ([n, v]: FilaFin, r: number, ultimo: boolean) => (
    <View key={n} style={renglon(r % 2 === 1, ultimo)}>
      <View style={td(`${etiqueta}%`, false, { backgroundColor: CEBRA })}>
        <Text style={[s.negrita, { fontSize: tam }]}>{n}</Text>
      </View>
      {meta.map(({ o, inicio, tinte }, i) => (
        <View
          key={i}
          style={[
            td(`${ancho}%`, i === meta.length - 1, { backgroundColor: tinte ? '#f2f5fc' : undefined }),
            separador(inicio),
          ]}
        >
          <Text style={[s.centro, { fontSize: tam }]}>{v(o)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View>
      {/* Encabezado por plazo. */}
      <View style={{ flexDirection: 'row' }}>
        <Th ancho={`${etiqueta}%`} primera fondo={INDIGO}>
          PLAZO
        </Th>
        {grupos.map((g, gi) => (
          <Th key={g.plazo} ancho={`${ancho * g.ops.length}%`} ultima={gi === grupos.length - 1} tam={9}>
            {`${g.plazo} MESES`}
          </Th>
        ))}
      </View>
      {/* Encabezado por opción (esquema). */}
      <View style={{ flexDirection: 'row' }}>
        <Th ancho={`${etiqueta}%`} fondo={INDIGO_MEDIO} radio={false}>
          ESQUEMA
        </Th>
        {meta.map(({ o, inicio }, i) => (
          <View key={i} style={[{ width: `${ancho}%` }, separador(inicio)]}>
            <Th ancho="100%" ultima={i === meta.length - 1} fondo={INDIGO_MEDIO} radio={false}>
              {(o.tipo && TIPO_CORTO[o.tipo]) || o.titulo}
            </Th>
          </View>
        ))}
      </View>
      {bloques.map((b) => {
        const mensual = b.titulo === 'MENSUALIDADES' || b.titulo === 'PAGOS PERIÓDICOS';
        return (
          <View key={b.titulo}>
            <TituloBloque>{b.titulo}</TituloBloque>
            {b.filas.map((f, r) =>
              renglonDatos(f, r, !mensual && b === ultimoBloque && r === b.filas.length - 1),
            )}
            {mensual && (
              <View style={renglon(false, b === ultimoBloque)}>
                <View style={td(`${etiqueta}%`, false, { backgroundColor: CEBRA })}>
                  <Text style={[s.negrita, { fontSize: tam }]}>{nombrePago(frecuencia)} total</Text>
                </View>
                {meta.map(({ o, inicio }, i) => (
                  <View
                    key={i}
                    style={[
                      td(`${ancho}%`, i === meta.length - 1, { backgroundColor: RESALTE }),
                      separador(inicio),
                    ]}
                  >
                    <Text style={[s.centro, { fontSize: tam + 1.5, fontWeight: 'bold', color: AZUL }]}>
                      {o.total === null ? NADA : formatearMXN(o.total)}
                    </Text>
                    {o.total !== null && (
                      <Text style={[s.centro, { fontSize: tam - 1, color: GRIS }]}>+ IVA</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Una sola opción: tarjeta con la mensualidad en grande y su detalle, en los mismos bloques (mismos bordes). */
function Tarjeta({ o }: { o: OpcionPdf }) {
  const bloques = conDatos([o]);
  return (
    <View style={{ borderWidth: 0.6, borderColor: LINEA, borderRadius: RADIO }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: INDIGO,
          paddingVertical: 5,
          paddingHorizontal: 8,
          borderTopLeftRadius: RADIO,
          borderTopRightRadius: RADIO,
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: 'bold', color: 'white' }}>{o.titulo}</Text>
        <Text style={{ fontSize: 9, fontWeight: 'bold', color: 'white' }}>{o.plazo}</Text>
      </View>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 6 }}
      >
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: AZUL }}>
          {o.total === null ? NADA : formatearMXN(o.total)}
        </Text>
        <Text style={{ color: GRIS, marginLeft: 4, marginBottom: 2 }}>
          + IVA · {nombrePago(o.frecuencia).toLowerCase()} total (equipos + seguro)
        </Text>
      </View>
      {/* Un bloque por columna, en renglones de anchos fijos (los flexibles confunden el corte de página). */}
      <View style={{ flexDirection: 'row', borderTopWidth: 0.6, borderColor: LINEA, backgroundColor: CEBRA }}>
        {bloques.map((b, bi) => (
          <View
            key={b.titulo}
            style={{
              width: `${100 / bloques.length}%`,
              paddingVertical: 5,
              paddingHorizontal: 8,
              borderLeftWidth: bi ? 0.6 : 0,
              borderColor: LINEA,
            }}
          >
            <Text
              style={{
                fontSize: 6.5,
                fontWeight: 'bold',
                color: INDIGO,
                letterSpacing: 0.8,
                marginBottom: 2,
              }}
            >
              {b.titulo}
            </Text>
            {b.filas.map(([n, v]) => (
              <View key={n} style={{ flexDirection: 'row', paddingVertical: 1.5 }}>
                <Text style={{ width: '58%', fontSize: 8, color: GRIS }}>{n}</Text>
                <Text style={{ width: '42%', fontSize: 8, textAlign: 'right' }}>{v(o)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ───────────── Condiciones y ejecutivo ─────────────

function Condicion({ c }: { c: unknown }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 2 }}>
      <Text style={{ width: 10 }}>•</Text>
      <View style={{ flex: 1 }}>
        <Enriquecido contenido={c} respaldo="" tamano={8.5} />
      </View>
    </View>
  );
}

/** Tarjeta de términos y condiciones: el título viaja con la primera condición. */
function Condiciones({ condiciones }: { condiciones: unknown[] }) {
  if (!condiciones.length) return null;
  return (
    <>
      <Caja inicio fin={condiciones.length === 1}>
        <Text style={[s.tituloSeccion, { color: AZUL }]}>Términos y Condiciones</Text>
        <Condicion c={condiciones[0]} />
      </Caja>
      {condiciones.slice(1).map((c, i) => (
        <Caja key={i} fin={i === condiciones.length - 2}>
          <Condicion c={c} />
        </Caja>
      ))}
    </>
  );
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('');

/**
 * Enlace a la conversación de WhatsApp del teléfono (2026-10-13): sólo dígitos; un número de 10 dígitos se toma como
 * mexicano (+52). Si no parece un teléfono, no hay enlace.
 */
export function enlaceWhatsapp(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, '');
  const numero = digitos.length === 10 ? `52${digitos}` : digitos;
  return numero.length >= 11 && numero.length <= 15 ? `https://wa.me/${numero}` : null;
}

/** Al final: «ATENTAMENTE» y la tarjeta del ejecutivo de la cuenta (2026-10-13). */
function TarjetaEjecutivo({ firma }: { firma: DatosPdf['firma'] }) {
  if (!firma.nombre) return null;
  const whatsapp = enlaceWhatsapp(firma.telefono);
  return (
    <View wrap={false} style={{ marginTop: 22, alignItems: 'center', fontSize: 9, lineHeight: 1.3 }}>
      <Text style={{ letterSpacing: 3, fontSize: 8.5, color: GRIS }}>ATENTAMENTE</Text>
      <View
        style={{
          marginTop: 10,
          width: 330,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'white',
          borderWidth: 0.6,
          borderColor: LINEA,
          borderRadius: RADIO_CAJA,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        {/* Iniciales en un círculo dibujado como vector: perfectamente redondo en cualquier visor (2026-10-13). */}
        <View style={{ width: 42, height: 42, position: 'relative' }}>
          <Svg style={{ position: 'absolute', top: 0, left: 0, width: 42, height: 42 }} viewBox="0 0 42 42">
            <Defs>
              <LinearGradient id="avatar" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={INDIGO} />
                <Stop offset="1" stopColor={AZUL} />
              </LinearGradient>
            </Defs>
            <Circle cx="21" cy="21" r="21" fill="url(#avatar)" />
          </Svg>
          <View
            style={{ position: 'absolute', top: 0, left: 0, width: 42, height: 42, justifyContent: 'center' }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 13, textAlign: 'center' }}>
              {iniciales(firma.nombre)}
            </Text>
          </View>
        </View>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Etiqueta>SU EJECUTIVO DE CUENTA</Etiqueta>
          <Text style={{ fontSize: 12, lineHeight: 1.3, fontWeight: 'bold', color: INDIGO, marginTop: 2 }}>
            {firma.nombre}
          </Text>
          {firma.puesto && <Text style={{ fontSize: 8.5, color: '#3a3a44' }}>{firma.puesto}</Text>}
          {(firma.correo || firma.telefono) && (
            <Text style={{ fontSize: 8.5, color: AZUL, marginTop: 3 }}>
              {firma.correo && (
                <Link src={`mailto:${firma.correo}`} style={{ color: AZUL, textDecoration: 'none' }}>
                  {firma.correo}
                </Link>
              )}
              {firma.correo && firma.telefono && '   ·   '}
              {firma.telefono &&
                (whatsapp ? (
                  <Link src={whatsapp} style={{ color: AZUL, textDecoration: 'none' }}>
                    {`WhatsApp ${firma.telefono}`}
                  </Link>
                ) : (
                  `Tel. ${firma.telefono}`
                ))}
            </Text>
          )}
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

/** Viñeta escrita a mano al inicio del párrafo (pegada de Excel o Word: «▪ », «• », «- »…). */
const VINETA = /^\s*[•·\-–]\s+/;

/**
 * Un párrafo que empieza con una viñeta escrita se presenta como elemento de lista, con la misma sangría que las
 * viñetas del editor (2026-10-13: antes la viñeta pegada movía el texto).
 */
function sinVineta(n: Nodo): Nodo | null {
  const primero = n.content?.[0];
  if (primero?.type !== 'text' || !VINETA.test(primero.text ?? '')) return null;
  return {
    ...n,
    content: [{ ...primero, text: (primero.text ?? '').replace(VINETA, '') }, ...(n.content ?? []).slice(1)],
  };
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
  const vineta = (contenido: ReactNode, clave: number | string, marca = '•') => (
    <View key={clave} style={{ flexDirection: 'row', marginLeft: 2 }}>
      <Text style={{ width: 9, fontSize: tamano }}>{marca}</Text>
      <View style={{ flex: 1 }}>{contenido}</View>
    </View>
  );
  const bloque = (n: Nodo, i: number, nivel = 0): ReactNode => {
    if (n.type === 'paragraph' || n.type === 'heading') {
      const conSufijo = n === titulo && sufijo;
      const limpio = n === titulo ? null : sinVineta(n);
      const parrafo = (
        <Text key={i} style={{ fontSize: tamano }}>
          {enLinea((limpio ?? n).content)}
          {conSufijo && <Text style={s.negrita}>{sufijo}</Text>}
        </Text>
      );
      return limpio ? vineta(parrafo, i) : parrafo;
    }
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      return (
        <View key={i} style={{ marginLeft: nivel ? 8 : 0 }}>
          {(n.content ?? []).map((item, j) =>
            vineta(
              (item.content ?? []).map((c, k) => bloque(c, k, nivel + 1)),
              j,
              n.type === 'orderedList' ? `${j + 1}.` : '•',
            ),
          )}
        </View>
      );
    }
    return null;
  };
  return <View>{bloques.map((b, i) => bloque(b, i))}</View>;
}
