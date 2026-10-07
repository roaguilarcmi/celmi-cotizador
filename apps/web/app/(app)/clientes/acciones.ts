'use server';

import { clienteSchema, contactoSchema } from '@celmi/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { leerFormulario } from '@/lib/datos';
import { exigirPermiso } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';

export interface EstadoFormulario {
  error?: string;
  ok?: string;
  /** Cliente que ya existe con la misma razón social (para enlazarlo en vez de duplicarlo). */
  duplicado?: { id: string; razon_social: string };
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Alta de cliente con su primer contacto. Si viene `destino=oportunidad`, continúa con la oportunidad nueva. */
export async function crearCliente(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const sesion = await exigirPermiso('clientes.crear');
  const campos = leerFormulario(datos);
  const cliente = clienteSchema.safeParse(campos);
  if (!cliente.success) return { error: cliente.error.issues[0]?.message };

  const conContacto = Boolean(campos.contacto_nombre);
  const contacto = contactoSchema.safeParse({
    tratamiento: campos.contacto_tratamiento,
    nombre: campos.contacto_nombre,
    puesto: campos.contacto_puesto,
    correo: campos.contacto_correo,
    telefono: campos.contacto_telefono,
  });
  if (conContacto && !contacto.success) return { error: contacto.error.issues[0]?.message };

  const supabase = await clienteServidor();
  const { data: existentes } = await supabase.from('clientes').select('id, razon_social');
  const igual = (existentes ?? []).find(
    (c) => normalizar(c.razon_social) === normalizar(cliente.data.razon_social),
  );
  if (igual) return { error: 'Ya existe un cliente con esa razón social.', duplicado: igual };

  const { data: nuevo, error } = await supabase
    .from('clientes')
    .insert({ ...cliente.data, creado_por: sesion.usuarioId })
    .select('id')
    .single();
  if (error || !nuevo) return { error: 'No se pudo guardar el cliente.' };

  if (conContacto && contacto.success) {
    await supabase.from('contactos').insert({ ...contacto.data, cliente_id: nuevo.id });
  }
  revalidatePath('/clientes');
  redirect(
    datos.get('destino') === 'oportunidad'
      ? `/oportunidades/nueva?cliente=${nuevo.id}`
      : `/clientes/${nuevo.id}`,
  );
}

export async function actualizarCliente(
  id: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await exigirPermiso('clientes.editar');
  const cliente = clienteSchema.safeParse(leerFormulario(datos));
  if (!cliente.success) return { error: cliente.error.issues[0]?.message };
  const supabase = await clienteServidor();
  const { error, count } = await supabase
    .from('clientes')
    .update(cliente.data, { count: 'exact' })
    .eq('id', id);
  if (error || !count) return { error: 'No se pudo actualizar el cliente.' };
  revalidatePath(`/clientes/${id}`);
  revalidatePath('/clientes');
  return { ok: 'Datos del cliente actualizados.' };
}

/** Alta (sin `contactoId`) o edición de un contacto. */
export async function guardarContacto(
  clienteId: string,
  contactoId: string | null,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await exigirPermiso(contactoId ? 'clientes.editar' : 'clientes.crear');
  const contacto = contactoSchema.safeParse(leerFormulario(datos));
  if (!contacto.success) return { error: contacto.error.issues[0]?.message };
  const supabase = await clienteServidor();
  const { error } = contactoId
    ? await supabase.from('contactos').update(contacto.data).eq('id', contactoId).eq('cliente_id', clienteId)
    : await supabase.from('contactos').insert({ ...contacto.data, cliente_id: clienteId });
  if (error) return { error: 'No se pudo guardar el contacto.' };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: contactoId ? 'Contacto actualizado.' : 'Contacto agregado.' };
}

/**
 * Contacto nuevo de un cliente existente desde «Nueva oportunidad» (2026-10-07): la misma empresa puede tener
 * solicitantes de distintas áreas. Devuelve el id para dejarlo elegido.
 */
export async function crearContacto(
  clienteId: string,
  datos: FormData,
): Promise<EstadoFormulario & { id?: string }> {
  await exigirPermiso('clientes.crear');
  const contacto = contactoSchema.safeParse(leerFormulario(datos));
  if (!contacto.success) return { error: contacto.error.issues[0]?.message };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from('contactos')
    .insert({ ...contacto.data, cliente_id: clienteId })
    .select('id')
    .single();
  if (error || !data) return { error: 'No se pudo agregar el contacto.' };
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath('/oportunidades/nueva');
  return { ok: 'Contacto agregado.', id: data.id as string };
}
