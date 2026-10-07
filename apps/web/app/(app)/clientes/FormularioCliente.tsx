'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { BotonEnviar, Campo, Mensaje } from '@/components/formulario';
import { Boton, Titulo2 } from '@/components/ui';
import { crearCliente, type EstadoFormulario } from './acciones';

/** Alta de cliente con su primer contacto. `destino="oportunidad"` continúa con la oportunidad nueva. */
export function FormularioCliente({
  destino,
  onCancelar,
}: {
  destino?: 'oportunidad';
  onCancelar?: () => void;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(crearCliente, {});
  return (
    <form action={accion} className="flex flex-col gap-5">
      {destino && <input type="hidden" name="destino" value={destino} />}
      {estado.error && (
        <Mensaje>
          {estado.error}{' '}
          {estado.duplicado && (
            <Link
              href={
                destino
                  ? `/oportunidades/nueva?cliente=${estado.duplicado.id}`
                  : `/clientes/${estado.duplicado.id}`
              }
              className="font-semibold underline"
            >
              Usar «{estado.duplicado.razon_social}»
            </Link>
          )}
        </Mensaje>
      )}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3">
          <Titulo2>Empresa</Titulo2>
        </legend>
        <div className="sm:col-span-2">
          <Campo
            etiqueta="Razón social o empresa"
            name="razon_social"
            required
            autoComplete="off"
            autoFocus
          />
        </div>
        <Campo etiqueta="RFC" name="rfc" autoComplete="off" maxLength={13} ayuda="Opcional" />
        <Campo etiqueta="Ciudad" name="ciudad" autoComplete="off" />
        <div className="sm:col-span-2">
          <Campo etiqueta="Dirección" name="direccion" autoComplete="off" />
        </div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1">
          <Titulo2>Contacto principal</Titulo2>
        </legend>
        <p className="-mt-1 text-[13px] text-texto-suave sm:col-span-2">
          Opcional; podrás agregar más contactos desde la ficha del cliente.
        </p>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 sm:col-span-2">
          <Campo etiqueta="Tratamiento" name="contacto_tratamiento" placeholder="Ing." autoComplete="off" />
          <Campo etiqueta="Nombre completo" name="contacto_nombre" autoComplete="off" />
        </div>
        <Campo etiqueta="Puesto" name="contacto_puesto" autoComplete="off" />
        <Campo etiqueta="Teléfono" name="contacto_telefono" type="tel" autoComplete="off" />
        <div className="sm:col-span-2">
          <Campo etiqueta="Correo" name="contacto_correo" type="email" autoComplete="off" />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-60">
          <BotonEnviar>{destino ? 'Guardar y continuar' : 'Guardar cliente'}</BotonEnviar>
        </div>
        {onCancelar && (
          <Boton variante="fantasma" onClick={onCancelar}>
            Cancelar
          </Boton>
        )}
      </div>
    </form>
  );
}
