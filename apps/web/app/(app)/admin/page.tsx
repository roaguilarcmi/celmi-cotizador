import { redirect } from 'next/navigation';

/** /admin no tiene contenido propio: lleva a la administración de usuarios. */
export default function Admin() {
  redirect('/admin/usuarios');
}
