/**
 * Se ejecuta antes de pintar la página para aplicar el tema y el menú compacto guardados
 * sin parpadeo. Sólo lee localStorage y escribe atributos en <html>.
 */
export const SCRIPT_INICIAL = `try{var d=document.documentElement,t=localStorage.getItem('celmi-tema');if(t==='light'||t==='dark')d.dataset.theme=t;if(localStorage.getItem('celmi-menu')==='compacto')d.dataset.menu='compacto'}catch(e){}`;
