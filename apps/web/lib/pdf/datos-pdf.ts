import { aEscalado, ESCALA_DINERO, importeConLetra, type Centavos } from '@celmi/core';
import { CONSULTAS } from '@/lib/consultas';
import { presentacionAutorizada } from '@/lib/corrida';
import {
  listarCatalogosCotizacion,
  listarCondicionesDeRevision,
  listarFinanciamiento,
  obtenerRevision,
  type RevisionDetalle,
} from '@/lib/datos';
import { clienteServidor } from '@/lib/supabase/servidor';
import { TIPOS_OPORTUNIDAD } from '@/lib/tipos-oportunidad';
import { conVigencia } from '@/lib/vigencia';

/**
 * Todo lo que lleva el PDF de la cotización (Fase 4 · C), ya calculado y en texto. Se lee con la sesión de quien lo
 * pide (RLS): si no puede ver la cotización, no hay datos.
 */
export interface DatosPdf {
  folio: string | null;
  /** «Pachuca de Soto, Hidalgo, a 09 de octubre de 2026». */
  lugarFecha: string;
  destinatario: { tratamiento: string; nombre: string; puesto: string; empresa: string };
  marcas: string[];
  propuestas: PropuestaPdf[];
  condiciones: unknown[];
  vistaPrevia: boolean;
  cancelada: boolean;
}

export interface LineaPdf {
  descripcion: unknown;
  descripcionTexto: string;
  sku: string;
  marca: string;
  entrega: string;
  unidad: string;
  cantidad: number;
  unitario: Centavos;
  importe: Centavos;
}

export interface OpcionPdf {
  titulo: string;
  plazo: string;
  financiera: string;
  gastosIniciales: Centavos | null;
  pago: Centavos | null;
  seguro: Centavos | null;
  factor: string | null;
  opcionCompra: { monto: Centavos; pct: string | null } | null;
  tasa: string | null;
  total: Centavos | null;
  frecuencia: string;
}

export interface PropuestaPdf {
  nombre: string;
  esAdicional: boolean;
  tipo: string;
  modalidad: string;
  lineas: LineaPdf[];
  subtotal: Centavos;
  iva: Centavos;
  total: Centavos;
  totalConLetra: string;
  valorEquipos: Centavos;
  financiamiento: OpcionPdf[];
}

const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Mexico_City',
});

const centavos = (v: string | number | null | undefined): Centavos | null => {
  if (v === null || v === undefined || v === '') return null;
  return aEscalado(Number(v).toFixed(2), ESCALA_DINERO);
};

/** «2 días» → «2 DÍAS HÁBILES» (como en el PDF de EPOXEMEX). */
export function entregaPdf(entrega: string): string {
  const t = entrega.trim().toUpperCase();
  return /^\d+\s*D[IÍ]AS?$/.test(t) ? `${t.replace(/DIAS?$/, 'DÍAS')} HÁBILES` : t;
}

const TIPOS_ARRENDAMIENTO: Record<string, string> = {
  vjm: 'Arrendamiento puro (VJM)',
  fpo: 'Arrendamiento financiero (FPO)',
};
const FRECUENCIAS: Record<string, string> = {
  mensual: 'mensual',
  bimestral: 'bimestral',
  trimestral: 'trimestral',
  semestral: 'semestral',
  anual: 'anual',
};

export async function armarDatosPdf(
  cotizacionId: string,
  revisionId: string,
): Promise<{ datos: DatosPdf; revision: RevisionDetalle } | null> {
  const supabase = await clienteServidor();
  const { data: cot } = await supabase
    .from('cotizaciones')
    .select(CONSULTAS.cotizacionPdf)
    .eq('id', cotizacionId)
    .maybeSingle();
  const revision = await obtenerRevision(revisionId);
  if (!cot || !revision || revision.cotizacion_id !== cotizacionId) return null;
  const presentadas = presentacionAutorizada(revision);
  if (!presentadas) return null;

  const op = (
    cot as unknown as {
      oportunidad: {
        cliente: { razon_social: string } | null;
        contacto: { tratamiento: string; nombre: string; puesto: string } | null;
      } | null;
    }
  ).oportunidad;
  const [catalogos, condiciones, financiamiento, financieras] = await Promise.all([
    listarCatalogosCotizacion(),
    listarCondicionesDeRevision(revision.id),
    listarFinanciamiento(revision.propuestas.filter((p) => !p.es_adicional).map((p) => p.id)),
    supabase.from('financieras').select('id, nombre'),
  ]);
  const nombreFinanciera = new Map(
    ((financieras.data ?? []) as { id: string; nombre: string }[]).map((f) => [f.id, f.nombre]),
  );
  const unidad = new Map(catalogos.unidades.map((u) => [u.id, u.abreviatura || u.nombre]));
  const partidaDe = new Map(revision.propuestas.flatMap((p) => p.partidas).map((pa) => [pa.id, pa]));
  const modalidad = TIPOS_OPORTUNIDAD[revision.esquema]?.nombre ?? '';

  const propuestas: PropuestaPdf[] = revision.propuestas.flatMap((p) => {
    const pres = presentadas.find((x) => x.id === p.id);
    if (!pres) return [];
    const lineas: LineaPdf[] = pres.lineas.map((l) => {
      const pa = partidaDe.get(l.partidaId);
      return {
        descripcion: pa?.descripcion_contenido ?? null,
        descripcionTexto: pa?.descripcion ?? '',
        sku: pa?.sku ?? '',
        marca: (pa?.marca ?? '').toUpperCase(),
        entrega: entregaPdf(pa?.entrega ?? ''),
        unidad: (pa?.unidad_id && unidad.get(pa.unidad_id)) || '',
        cantidad: l.cantidad,
        unitario: l.precioUnitario,
        importe: l.importe,
      };
    });
    const opciones: OpcionPdf[] = financiamiento
      .filter((f) => f.propuesta_id === p.id)
      .sort((a, b) => a.orden - b.orden)
      .map((f) => {
        const pago = centavos(f.mensualidad);
        const seguro = centavos(f.pago_seguro);
        const residual = centavos(f.valor_residual);
        return {
          titulo: f.tipo_arrendamiento ? (TIPOS_ARRENDAMIENTO[f.tipo_arrendamiento] ?? '') : modalidad,
          plazo: `${f.plazo_meses} meses`,
          financiera: (f.financiera_id && nombreFinanciera.get(f.financiera_id)) || '',
          gastosIniciales: centavos(f.gastos_apertura),
          pago,
          seguro,
          factor: f.factor != null ? String(Number(f.factor)) : null,
          opcionCompra:
            f.tipo_arrendamiento === 'fpo' && residual !== null
              ? { monto: residual, pct: f.residual_pct != null ? String(Number(f.residual_pct)) : null }
              : null,
          tasa: f.tasa_financiera != null ? `${Number(f.tasa_financiera).toFixed(2)} %` : null,
          total: pago !== null || seguro !== null ? (pago ?? 0n) + (seguro ?? 0n) : null,
          frecuencia: FRECUENCIAS[f.frecuencia] ?? 'mensual',
        };
      });
    const t = pres.totales;
    return [
      {
        nombre: p.nombre,
        esAdicional: p.es_adicional,
        tipo: p.tipo,
        modalidad,
        lineas,
        subtotal: t.subtotal,
        iva: t.iva,
        total: t.total,
        totalConLetra: importeConLetra(t.total),
        valorEquipos: t.subtotal,
        financiamiento: opciones,
      },
    ];
  });

  const marcas = [
    ...new Set(propuestas.flatMap((p) => p.lineas.map((l) => l.marca)).filter((m) => m.length > 0)),
  ];
  const fecha = revision.emitida_en ? new Date(revision.emitida_en) : new Date();
  const contacto = op?.contacto;
  return {
    revision,
    datos: {
      folio: revision.folio,
      lugarFecha: `Pachuca de Soto, Hidalgo, a ${fechaLarga.format(fecha)}`,
      destinatario: {
        tratamiento: contacto?.tratamiento ?? '',
        nombre: contacto?.nombre ?? '',
        puesto: contacto?.puesto ?? '',
        empresa: op?.cliente?.razon_social ?? '',
      },
      marcas,
      propuestas,
      condiciones: condiciones.map((c) => conVigencia(c.contenido, revision.vigencia_hasta)),
      vistaPrevia: revision.estado !== 'emitida',
      cancelada: Boolean(revision.cancelada_en),
    },
  };
}
