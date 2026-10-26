/**
 * ¿La petición viene de una página del propio cotizador? Compara el Origin que manda el navegador con el servidor
 * que la recibió (Host, o x-forwarded-host detrás de Netlify). No se usa `request.url`: en Next.js dice «localhost»
 * aunque se entre por 127.0.0.1 (error del 2026-10-26 al descargar la solicitud de corrida).
 */
export function mismoOrigen(peticion: Request): boolean {
  const origen = peticion.headers.get('origin');
  if (!origen) return false;
  let hostOrigen: string;
  try {
    hostOrigen = new URL(origen).host;
  } catch {
    return false;
  }
  const hosts = [peticion.headers.get('x-forwarded-host'), peticion.headers.get('host')]
    .flatMap((h) => (h ? h.split(',') : []))
    .map((h) => h.trim())
    .filter(Boolean);
  return hosts.includes(hostOrigen);
}
