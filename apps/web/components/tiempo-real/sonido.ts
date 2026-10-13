/**
 * Tono breve de aviso (Fase 8; encendido por omisión, decisión 2026-10-13). Se genera con Web Audio: sin archivos.
 * Los navegadores sólo dejan sonar después de una interacción, así que el audio se habilita con el primer clic o tecla.
 */

let audio: AudioContext | null = null;

/** Prepara el audio con la primera interacción de la persona; devuelve la limpieza. */
export function prepararSonido(): () => void {
  const habilitar = () => {
    try {
      audio ??= new AudioContext();
      if (audio.state === 'suspended') void audio.resume();
    } catch {
      audio = null;
    }
  };
  window.addEventListener('pointerdown', habilitar, { once: true });
  window.addEventListener('keydown', habilitar, { once: true });
  return () => {
    window.removeEventListener('pointerdown', habilitar);
    window.removeEventListener('keydown', habilitar);
  };
}

/** Dos notas suaves (≈ 0.35 s). Si el audio no está habilitado, no suena. */
export function sonarAviso() {
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  for (const [i, frecuencia] of [880, 1320].entries()) {
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    const inicio = t + i * 0.12;
    vol.gain.setValueAtTime(0, inicio);
    vol.gain.linearRampToValueAtTime(0.12, inicio + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.25);
    osc.connect(vol).connect(audio.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.26);
  }
}
