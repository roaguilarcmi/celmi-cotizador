const PATHS = {
  inicio: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  oportunidades: 'M3 7h18v13H3z M8 7V4h8v3 M3 12h18',
  cotizaciones: 'M6 3h8l5 5v13H6z M14 3v5h5 M9 13h6 M9 17h6',
  autorizaciones: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  clientes:
    'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M22 19v-1a4 4 0 0 0-3-3.9 M16 5.1a3 3 0 0 1 0 5.8',
  catalogos: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  auditoria: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M20 20l-4-4',
  campana: 'M6 9a6 6 0 1 1 12 0c0 6 3 8 3 8H3s3-2 3-8 M10 21a2 2 0 0 0 4 0',
  mas: 'M12 5v14 M5 12h14',
  arrastrar: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  candado: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  ojo: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  palomita: 'M5 12.5l4.5 4.5L19 7',
  derecha: 'M5 12h14 M13 6l6 6-6 6',
  izquierda: 'M19 12H5 M11 6l-6 6 6 6',
  arriba: 'M12 19V5 M6 11l6-6 6 6',
  abajo: 'M12 5v14 M6 13l6 6 6-6',
  restablecer: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
  guardado: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8z M9.5 13.5l2 2 3.5-3.5',
  reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7v5l3 2',
  mensaje: 'M4 5h16v11H9l-5 4z',
  cerrar: 'M6 6l12 12 M18 6 6 18',
  luna: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sol: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  columnas: 'M3 4h18v16H3z M9 4v16 M15 4v16',
  usuarios: 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M3 21v-1a7 7 0 0 1 11-5.7 M19 15v6 M16 18h6',
  salir: 'M15 4h4v16h-4 M10 17l-5-5 5-5 M5 12h11',
  llave: 'M15 9a3 3 0 1 0 0-.01 M12.5 11.5 4 20v1h3v-2h2v-2h2l1.5-1.5 M21 9a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  copiar: 'M9 9h11v11H9z M5 15H4V4h11v1',
  telefono: 'M7 2h10v20H7z M11 18h2',
  enlace:
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  compactar: 'M11 17l-5-5 5-5 M18 17l-5-5 5-5',
  expandir: 'M13 17l5-5-5-5 M6 17l5-5-5-5',
  abrir: 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7',
  herramienta: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
} as const;

export type IconName = keyof typeof PATHS;

const GRUESOS = new Set<IconName>(['arrastrar']);

export function Icon({
  name,
  size = 18,
  strokeWidth,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? (GRUESOS.has(name) ? 3 : 1.8)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ''}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
