/**
 * Sistema de diseño de CELMI Solutions: fuente única de colores, tipografía, radios y espaciados
 * para la web (Tailwind, vía theme.css generado) y para Android (Expo).
 * Colores de marca tomados del membrete oficial de las cotizaciones.
 */

export const marca = {
  indigo: '#29235C',
  azul: '#0064EC',
  azulClaro: '#0071F6',
  azulProfundo: '#0057E2',
} as const;

export interface PaletaTema {
  fondo: string;
  superficie: string;
  superficie2: string;
  texto: string;
  textoSuave: string;
  borde: string;
  nav: string;
  navTexto: string;
  navActivo: string;
  acento: string;
  acentoTexto: string;
  acentoSuave: string;
  sobreAcento: string;
  paso: string;
  exito: string;
  exitoSuave: string;
  aviso: string;
  avisoSuave: string;
  peligro: string;
  peligroSuave: string;
  info: string;
  infoSuave: string;
  neutro: string;
  neutroSuave: string;
}

export const temas: { claro: PaletaTema; oscuro: PaletaTema } = {
  claro: {
    fondo: '#F4F5FA',
    superficie: '#FFFFFF',
    superficie2: '#F7F8FC',
    texto: '#16133A',
    textoSuave: '#55536E',
    borde: '#E3E4EE',
    nav: marca.indigo,
    navTexto: '#CBC8E6',
    navActivo: '#3B3580',
    acento: marca.azul,
    acentoTexto: '#0052C9',
    acentoSuave: '#E6F0FE',
    sobreAcento: '#FFFFFF',
    paso: marca.indigo,
    exito: '#0F7A47',
    exitoSuave: '#E3F4EB',
    aviso: '#9A5800',
    avisoSuave: '#FDF0DC',
    peligro: '#B42318',
    peligroSuave: '#FDE8E6',
    info: '#5B3FC4',
    infoSuave: '#EEEAFB',
    neutro: '#475467',
    neutroSuave: '#EEF1F5',
  },
  oscuro: {
    fondo: '#0F0E1F',
    superficie: '#17152D',
    superficie2: '#1E1B38',
    texto: '#ECEBF7',
    textoSuave: '#A6A3C2',
    borde: '#2C2950',
    nav: '#121029',
    navTexto: '#A6A3C2',
    navActivo: '#2A2660',
    acento: '#3D8BFF',
    acentoTexto: '#7EB2FF',
    acentoSuave: '#14244A',
    sobreAcento: '#04122E',
    paso: '#3B3580',
    exito: '#4ADE9B',
    exitoSuave: '#0F2E22',
    aviso: '#F5B544',
    avisoSuave: '#35280E',
    peligro: '#FF8A7A',
    peligroSuave: '#3A1A16',
    info: '#B4A2FF',
    infoSuave: '#241D4A',
    neutro: '#B4B8C8',
    neutroSuave: '#24223D',
  },
};

export const radios = { sm: 8, md: 10, lg: 14, xl: 20, pill: 999 } as const;

/** Escala de espaciado en px (múltiplos de 4). */
export const espacios = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

export const tipografia = {
  familia: 'Plus Jakarta Sans',
  tamanos: { xs: 12, sm: 13, base: 14, md: 15, lg: 17, xl: 20, '2xl': 24, '3xl': 28, '4xl': 32 },
  pesos: { normal: '400', medio: '500', semibold: '600', bold: '700', extra: '800' },
} as const;

/** Área táctil mínima para controles (WCAG / Material): 44 px. */
export const TOQUE_MINIMO = 44;
