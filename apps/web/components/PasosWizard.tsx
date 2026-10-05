import { PASOS_WIZARD } from '@/lib/navegacion';
import { Icon } from './Icon';

/**
 * Wizard en píldoras (dirección C): pasos completados, actual y pendientes. Con `alElegir`, los pasos de
 * `disponibles` se pueden abrir con un clic.
 */
export function PasosWizard({
  actual,
  disponibles = [],
  alElegir,
}: {
  actual: number;
  disponibles?: number[];
  alElegir?: (paso: number) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1.5">
      <ol
        aria-label="Pasos de la cotización"
        className="flex min-w-[820px] gap-1 rounded-pill border border-borde bg-superficie p-1.5 sombra"
      >
        {PASOS_WIZARD.map((paso, i) => {
          const hecho = i < actual;
          const esActual = i === actual;
          const clase = `flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-pill px-3 text-[13px] transition-colors ${
            esActual
              ? 'bg-paso font-bold text-white'
              : hecho
                ? 'bg-acento-suave font-medium text-acento-texto'
                : 'font-medium text-texto-suave'
          }`;
          const contenido = (
            <>
              {hecho ? (
                <Icon name="palomita" size={16} strokeWidth={2.4} />
              ) : (
                <span
                  className={`inline-flex size-5.5 items-center justify-center rounded-full text-xs font-bold ${
                    esActual ? 'bg-white/20' : 'bg-neutro-suave'
                  }`}
                >
                  {i + 1}
                </span>
              )}
              {esActual ? paso.largo : paso.corto}
              {hecho && <span className="sr-only">(completado)</span>}
            </>
          );
          const elegible = alElegir && !esActual && disponibles.includes(i);
          return (
            <li
              key={paso.largo}
              title={paso.largo}
              aria-current={esActual ? 'step' : undefined}
              className={esActual ? 'flex flex-[2]' : 'flex flex-1'}
            >
              {elegible ? (
                <button
                  type="button"
                  onClick={() => alElegir(i)}
                  className={`${clase} cursor-pointer hover:ring-2 hover:ring-acento/40`}
                >
                  {contenido}
                </button>
              ) : (
                <span className={clase}>{contenido}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
