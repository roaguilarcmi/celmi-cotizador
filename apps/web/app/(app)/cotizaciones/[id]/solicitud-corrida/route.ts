import {
  centavosADecimal,
  lineasSolicitud,
  nombreArchivoSolicitud,
  normalizarSku,
  PLAZOS_SOLICITUD,
  type EsquemaSolicitud,
  type PresentacionSolicitud,
} from '@celmi/core';
import { CONSULTAS } from '@/lib/consultas';
import { listarCatalogosCotizacion, listarTiposCambio, obtenerRevision } from '@/lib/datos';
import { excelCelmi, excelCt, excelIngram, type DatosExcel } from '@/lib/excel/formatos';
import { exigirPermiso } from '@/lib/sesion';
import {
  aplicaSolicitud,
  categoriaInicial,
  esCategoria,
  esquemasPosibles,
  formatoDe,
  propuestasSolicitud,
} from '@/lib/solicitud-corrida';
import { clienteServidor } from '@/lib/supabase/servidor';

/**
 * Genera el formato para pedir la corrida financiera (2026-10-23): CT, Ingram o CELMI según el mayorista del
 * arrendamiento, con los precios autorizados y el costo en pesos. Lleva costos: sólo con costos.ver y acceso a la
 * cotización (las reglas de la base lo vuelven a exigir al registrar la solicitud). El archivo no se guarda.
 */

const esUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const error = (texto: string, status = 400) => new Response(texto, { status });

interface Pedido {
  revision: string;
  propuesta: string;
  plazos: number[];
  esquemas: EsquemaSolicitud[];
  presentacion: PresentacionSolicitud;
  categorias: Record<string, string>;
}

function leerPedido(b: unknown): Pedido | null {
  if (!b || typeof b !== 'object') return null;
  const x = b as Record<string, unknown>;
  const plazos = Array.isArray(x.plazos) ? [...new Set(x.plazos)] : [];
  const esquemas = Array.isArray(x.esquemas) ? [...new Set(x.esquemas)] : [];
  const categorias =
    x.categorias && typeof x.categorias === 'object' ? (x.categorias as Record<string, unknown>) : {};
  if (
    !esUuid(x.revision) ||
    !esUuid(x.propuesta) ||
    plazos.length === 0 ||
    !plazos.every((p) => (PLAZOS_SOLICITUD as readonly unknown[]).includes(p)) ||
    esquemas.length === 0 ||
    esquemas.length > 2 ||
    !esquemas.every((e) => e === 'vjm' || e === 'fpo' || e === 'credito') ||
    (x.presentacion !== 'cliente' && x.presentacion !== 'desglosada') ||
    Object.keys(categorias).length > 500 ||
    !Object.entries(categorias).every(([k, v]) => esUuid(k) && (v === '' || esCategoria(v)))
  )
    return null;
  return {
    revision: x.revision,
    propuesta: x.propuesta,
    plazos: plazos as number[],
    esquemas: esquemas as EsquemaSolicitud[],
    presentacion: x.presentacion,
    categorias: categorias as Record<string, string>,
  };
}

/** Nombre para el encabezado Content-Disposition (con acentos, RFC 5987). */
const disposicion = (nombre: string) =>
  `attachment; filename="${nombre
    .normalize('NFD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;

export async function POST(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso('costos.ver');
  // Sólo desde el propio cotizador (las acciones con cookies no se aceptan desde otros sitios).
  const origen = peticion.headers.get('origin');
  if (!origen || origen !== new URL(peticion.url).origin) return error('Solicitud no permitida', 403);
  const { id } = await params;
  const pedido = leerPedido(await peticion.json().catch(() => null));
  if (!esUuid(id) || !pedido) return error('Datos de la solicitud no válidos');

  const revision = await obtenerRevision(pedido.revision);
  if (!revision || revision.cotizacion_id !== id) return error('No se encontró la cotización', 404);
  if (!aplicaSolicitud(revision))
    return error('La solicitud de corrida es para arrendamiento o crédito simple con precios autorizados');
  const posibles = esquemasPosibles(revision.esquema);
  const esquemas = posibles.length === 1 ? posibles : pedido.esquemas.filter((e) => posibles.includes(e));
  if (esquemas.length === 0) return error('Elige al menos un esquema');
  const propuesta = revision.propuestas.find((p) => p.id === pedido.propuesta && !p.es_adicional);
  if (!propuesta) return error('Propuesta no válida');

  const supabase = await clienteServidor();
  const [tiposCambio, catalogos, cot, guardadas] = await Promise.all([
    listarTiposCambio(revision.id),
    listarCatalogosCotizacion(),
    supabase.from('cotizaciones').select(CONSULTAS.cotizacionSolicitud).eq('id', id).maybeSingle(),
    supabase
      .from('categorias_producto')
      .select(CONSULTAS.categorias)
      .in(
        'sku',
        revision.propuestas.flatMap((p) => p.partidas.map((pa) => normalizarSku(pa.sku))).filter(Boolean),
      ),
  ]);
  const propuestas = propuestasSolicitud(revision, tiposCambio);
  if (!propuestas || !cot.data) return error('Faltan precios autorizados o el tipo de cambio', 409);
  const solicitud = lineasSolicitud(propuestas, propuesta.id, pedido.presentacion);
  const formato = formatoDe(revision, catalogos.mayoristas);

  const categoriasGuardadas = Object.fromEntries(
    ((guardadas.data ?? []) as { sku: string; categoria: string }[]).map((c) => [c.sku, c.categoria]),
  );
  const partidaDe = new Map(revision.propuestas.flatMap((p) => p.partidas).map((pa) => [pa.id, pa]));
  const lineas = solicitud.lineas.map((l) => {
    const pa = partidaDe.get(l.partidaId);
    return {
      pa,
      categoria: pedido.categorias[l.partidaId] || (pa ? categoriaInicial(pa, categoriasGuardadas) : ''),
      l,
    };
  });
  if (formato !== 'ct' && lineas.some((x) => !x.categoria))
    return error('Falta la categoría de alguna partida');

  // Registro de la solicitud (las reglas de la base exigen acceso, costos.ver y precios autorizados).
  const { error: alta } = await supabase.from('solicitudes_corrida').insert({
    revision_id: revision.id,
    propuesta_id: propuesta.id,
    mayorista_id: revision.mayorista_arrendamiento_id,
    formato,
    plazos: pedido.plazos,
    esquemas,
    presentacion: pedido.presentacion,
  });
  if (alta) {
    console.error('[solicitud-corrida]', alta.code, alta.message);
    return error('No tienes permiso para generar esta solicitud', 403);
  }

  // Se recuerda la categoría de cada número de parte (sólo las que cambiaron).
  const cambios = new Map<string, string>();
  for (const { pa, categoria } of lineas) {
    const sku = pa ? normalizarSku(pa.sku) : '';
    if (sku && categoria && categoriasGuardadas[sku] !== categoria) cambios.set(sku, categoria);
  }
  if (cambios.size)
    await supabase.from('categorias_producto').upsert(
      [...cambios].map(([sku, categoria]) => ({ sku, categoria })),
      { onConflict: 'sku' },
    );

  const op = (
    cot.data as unknown as {
      folio: string | null;
      oportunidad: {
        nombre: string;
        estado_entrega: string | null;
        cliente: { razon_social: string; rfc: string | null } | null;
        ejecutivo: { nombre: string; puesto: string; correo: string; telefono: string } | null;
      } | null;
    }
  ).oportunidad;
  const fecha = new Date();
  const principales = revision.propuestas.filter((p) => !p.es_adicional);
  const datos: DatosExcel = {
    empresa: op?.cliente?.razon_social ?? 'Cliente',
    rfc: op?.cliente?.rfc ?? '',
    estadoEntrega: op?.estado_entrega ?? '',
    proyecto: op?.nombre ?? '',
    propuesta: propuesta.nombre,
    cotizacion: revision.folio ?? (cot.data as { folio: string | null }).folio ?? 'Sin folio',
    mayorista: catalogos.mayoristas.find((m) => m.id === revision.mayorista_arrendamiento_id)?.nombre ?? '',
    plazos: [...pedido.plazos].sort((a, b) => a - b),
    esquemas,
    lineas: lineas.map(({ pa, categoria, l }) => ({
      parte: pa?.sku ?? '',
      marca: pa?.marca ?? '',
      descripcion: pa?.descripcion ?? '',
      categoria,
      cantidad: l.cantidad,
      costoUnitario: centavosADecimal(l.costoUnitario),
      precioUnitario: centavosADecimal(l.precioUnitario),
    })),
    ejecutivo: {
      nombre: op?.ejecutivo?.nombre ?? sesion.nombre,
      puesto: op?.ejecutivo?.puesto ?? '',
      correo: op?.ejecutivo?.correo ?? '',
      telefono: op?.ejecutivo?.telefono ?? '',
    },
    fecha,
  };
  const archivo =
    formato === 'ct' ? excelCt(datos) : formato === 'ingram' ? excelIngram(datos) : excelCelmi(datos);
  const nombre = nombreArchivoSolicitud(formato, {
    empresa: datos.empresa,
    esquemas,
    fecha,
    propuesta: principales.length > 1 ? propuesta.nombre : null,
  });
  return new Response(new Blob([archivo as BlobPart]), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': disposicion(nombre),
      'Cache-Control': 'no-store',
    },
  });
}
