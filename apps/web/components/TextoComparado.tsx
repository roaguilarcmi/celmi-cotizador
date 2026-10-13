import type { TramoTexto } from '@celmi/core';

/** Texto con lo quitado (rojo, tachado) y lo agregado (verde) resaltados, de `diferenciaPalabras`. */
export function TextoComparado({ tramos }: { tramos: TramoTexto[] }) {
  return (
    <>
      {tramos.map((x, i) =>
        x.tipo === 'igual' || !x.texto.trim() ? (
          <span key={i}>{x.texto}</span>
        ) : x.tipo === 'quitado' ? (
          <del key={i} className="rounded-sm bg-peligro-suave px-0.5 text-peligro decoration-peligro/60">
            {x.texto}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-exito-suave px-0.5 font-semibold text-exito no-underline">
            {x.texto}
          </ins>
        ),
      )}
    </>
  );
}
