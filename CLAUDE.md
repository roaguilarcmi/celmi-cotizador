# CLAUDE.md — Cotizador CELMI Solutions

Plataforma interna web + Android para crear, autorizar, versionar y emitir cotizaciones de CELMI Solutions.
Documento rector: «RFP — Plataforma Web y Android de Cotizaciones CELMI Solutions v2» (oct 2026).
Responsable del proyecto: Rodrigo Rivera Aguilar (Preventa).

## Reglas de trabajo (RFP §37–38)

- **No asumir reglas de negocio.** Si algo no está en «Reglas confirmadas», identificarlo, explicarlo y pedir definición. Mientras tanto, el código rechaza el caso (lanza error) en lugar de inventar un comportamiento.
- Avance por fases. Cada fase arranca con un plan aprobado y cierra con pruebas en verde, capturas o demostración, y aprobación.
- Cambios pequeños y descriptivos, en ramas. No hacer push ni PR sin pedirlo.
- Cada regla confirmada o decisión técnica nueva se anota aquí.
- La integridad de la información va por delante de la velocidad.
- **Lo visual tiene máxima prioridad.** La interfaz debe ser muy atractiva y sencilla para todo el departamento. Respeta el sistema de diseño (abajo) y revisa cada pantalla a 1440 px, en celular y en modo oscuro.

## Stack

| Capa       | Tecnología                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------- |
| Lenguaje   | TypeScript estricto (fijado en ~6.0: typescript-eslint aún no soporta TS 7)                   |
| Monorepo   | npm workspaces: npm viene con Node; sin pnpm ni Turborepo (ver «Seguridad y políticas de TI») |
| Web        | Next.js 16 (App Router, Turbopack) + Tailwind CSS v4                                          |
| Android    | **En pausa.** Expo SDK 57 + React Native 0.86 en `apps/mobile`, fuera del workspace           |
| Lógica     | `packages/core` (sin dependencias) + Vitest                                                   |
| Validación | `packages/validation` (Zod 4)                                                                 |
| Diseño     | `packages/ui`: tokens → `theme.css` generado                                                  |
| Datos      | `packages/db`: PostgreSQL + ORM tipado (Fase 1). Supabase recomendado por el RFP              |
| Lint       | ESLint 9 (fijado: eslint-plugin-react de Next aún no soporta ESLint 10)                       |

Pendientes de stack: shadcn/ui, TanStack Table, Tiptap y dnd-kit entran en la Fase 3; Expo Router, NativeWind y EAS cuando se retome Android.

## Seguridad y políticas de TI (prioridad máxima)

La ciberseguridad del equipo y el cumplimiento de las políticas de TI de CELMI están **por encima de todo**: velocidad, comodidad y herramientas sugeridas por el RFP.

- **Software permitido en el equipo:** Node.js 24 y npm, ya aprobados. No instalar herramientas globales, CLIs ni nada que traiga ejecutables propios sin aprobación explícita de Rodrigo y TI.
- **Microsoft Defender (reducción de superficie de ataque)** bloquea `.exe` nuevos o poco comunes.
  - `turbo.exe` fue bloqueado el 2026-10-02; por eso no se usa Turborepo.
  - pnpm 12 traía `pnpm.exe`; se desinstaló el mismo día y se migró a npm.
  - Las librerías con complementos nativos `.node` (SWC de Next.js, Tailwind, Vitest) funcionan porque se cargan dentro de `node.exe`.
- **`.npmrc`:**
  - `ignore-scripts=true`: ninguna dependencia ejecuta código al instalarse. No desactivarlo; si una dependencia lo requiere, buscar otra o consultarlo.
  - `save-exact=true`: versiones exactas.
  - `engine-strict`.
- **`npm run check:exe`** (incluido en `verify` y en CI) falla si alguna dependencia trae `.exe`, `.com`, `.scr` o `.msi`.
- **Antes de agregar una dependencia:** justificarla, preferir paquetes muy usados y mantenidos, y revisar `npm audit`. CI falla con severidad alta.
- **No ejecutar `npx` con paquetes que no estén ya instalados en el proyecto**: descargan y ejecutan código.
- **Servidores de desarrollo** solo en `127.0.0.1` (ya configurado en `dev` y `start`); detenerlos al terminar.
- **Telemetría de Next.js desactivada** (`next telemetry disable` en el equipo; `NEXT_TELEMETRY_DISABLED=1` en CI).
- **Secretos:** nunca en el repositorio; `.env*` está en `.gitignore`.

## Iniciativa propia, aún sin TI (decisión 2026-10-03)

El proyecto es iniciativa de Rodrigo, autorizada por su jefe. **TI aún no está enterada**: se le presentará al terminar para que valide y asuma la seguridad.

- Mientras tanto **no se puede pedir nada a TI**: ni registros DNS, ni SMTP, ni registro de apps en Microsoft, ni excepciones de Defender. Todo debe funcionar sin su intervención.
- La seguridad y la confidencialidad se tratan con más rigor precisamente por eso.
- **Datos reales permitidos** en Supabase y GitHub por decisión de Rodrigo (con autorización de su jefe). Por ello:
  - El repositorio de GitHub debe ser **privado**.
  - El proyecto de Supabase no se comparte.
  - Las claves secretas solo van en `.env.local`, nunca en el chat ni en el repositorio.

## Costo cero (decisión 2026-10-03)

Todo el proyecto debe operar **gratis**. Si algo requiere pago, se busca la mejor alternativa gratuita antes de seguir.

- Base de datos, autenticación y archivos: **Supabase, plan Free**.
  - Límites: 2 proyectos activos, 500 MB de base, 1 GB de archivos y 50 000 usuarios activos al mes.
  - El proyecto se pausa tras 1 semana sin actividad.
  - **No incluye respaldos automáticos.**
  - SAML no está incluido, pero OAuth sí.
- **Inicio de sesión (decisión 2026-10-03):** el tenant de Microsoft de CELMI restringe el inicio de sesión con apps externas, así que se usa **correo corporativo + contraseña** con Supabase Auth.
  - No hay registro abierto: solo el administrador da de alta usuarios.
  - **Sin envío de correos por ahora.** El correo integrado de Supabase solo envía 2 por hora y únicamente a miembros del equipo, y un SMTP propio (Brevo/Resend) requiere registros DNS que hoy no se pueden pedir a TI.
    - Alta y recuperación: el administrador genera desde la app el enlace de invitación o de recuperación (`auth.admin.generateLink`, sin enviar correo), lo entrega por un canal interno y queda en la auditoría.
    - Cuando TI configure el SMTP, se activa la recuperación por cuenta propia sin rehacer nada.
  - **2FA con app autenticadora (TOTP), obligatoria para todos**, exigida en la base de datos (`aal2`). La 2FA por SMS cuesta 75 USD al mes: descartada.
  - **Passkeys:** Supabase las ofrece en beta experimental (mayo de 2026). Se agregan como opción después de estabilizar contraseña + 2FA.
  - Si TI autoriza más adelante el inicio de sesión con Microsoft, en Supabase aparece como proveedor «Azure».
- **Vercel Hobby no sirve**: sus términos prohíben el uso comercial. El hosting de la web se decide en la Fase 11 entre opciones gratuitas que permitan uso comercial.
- Herramientas descartadas por traer `.exe`: Supabase CLI y `drizzle-kit` (que depende de esbuild). Las migraciones son SQL versionado aplicado con un script de Node. El acceso tipado a datos se hace con Kysely y `postgres` (JavaScript puro).

## Alcance actual: solo web (decisión 2026-10-02)

Desarrollar web y Android en paralelo consumía demasiados recursos. Se termina la web y después se lleva todo a Android.

- `apps/mobile` queda como esqueleto Expo **fuera de los workspaces** de npm: no se instala, no se compila y no corre en CI.
- La lógica sigue en `packages/*` sin dependencias de navegador, para reutilizarla tal cual en Android.
- React se mantiene en 19.2.3 (la versión de Expo 57) para no generar conflictos al volver.
- Al retomar Android, evaluar con TI las herramientas de Expo, EAS y el SDK de Android antes de instalarlas.

## Estructura

```
apps/web          Next.js: dashboard y demo de autorización EPOXEMEX (/autorizaciones/epoxemex)
apps/mobile       Expo (en pausa, fuera del workspace): pantalla de muestra de autorización
packages/core     precios, IVA, redondeo, importe con letra y folio (+ fixtures reales)
packages/validation  esquemas Zod compartidos
packages/ui       tokens de diseño; `npm run gen -w @celmi/ui` regenera theme.css
packages/db       esquema y migraciones (Fase 1)
```

## Comandos

```bash
npm install                  # respeta .npmrc: sin scripts de instalación
npm run dev                  # http://127.0.0.1:3000
npm run verify               # formato + lint + tipos + pruebas + build + revisión de .exe (igual que CI)
npm test | npm run lint | npm run typecheck | npm run build
npm run gen -w @celmi/ui     # tras editar packages/ui/src/tokens.ts
npm run audit                # vulnerabilidades de severidad alta
```

- ESLint 9 aparece como versión sin soporte. Se migrará a ESLint 10 cuando `eslint-config-next` lo soporte.
- Los paquetes internos se consumen como TypeScript fuente (`exports` → `src/*.ts`). La web los transpila con `transpilePackages`.

## Convenciones

- El dominio se nombra en español (`precioUnitario`, `utilidadPct`, `Propuesta`). La infraestructura, en inglés solo si la librería lo impone.
- **Dinero:** nunca `number` ni punto flotante.
  - Los importes viajan como texto decimal (`"14533.46"`) y se calculan como `bigint` en centavos con `@celmi/core`.
  - Escalas: dinero 2, tipo de cambio 6, porcentaje 4.
- **Todo cálculo vive en `packages/core`** y se prueba ahí. La web y Android solo muestran. El servidor recalcula y registra los valores definitivos (§3.6).
- **Colores:** solo mediante tokens. En la web, las utilidades de Tailwind generadas: `bg-superficie`, `text-texto-suave`, `bg-acento`, `text-sobre-acento`, `border-borde`, `bg-exito-suave text-exito`, etc. No uses hex sueltos salvo en datos de gráficas.
- Los tokens tienen pruebas de contraste WCAG AA en ambos temas. Si cambias un color, `npm test` debe seguir en verde.
- **Accesibilidad:**
  - Controles reales (`button`, `a`, `label` + `input`).
  - Área táctil ≥ 44 px y foco visible.
  - Se respeta `prefers-reduced-motion`.

## Sistema de diseño (aprobado 2026-10-02)

- **Estructura:** dirección «A · Ejecutivo», con menú lateral índigo fijo y contenido en tarjetas.
- **Wizard:** de la dirección «C · Lienzo», en píldoras. El paso actual va en índigo con su nombre completo y los demás con su nombre corto.
- **Colores** (del membrete oficial):
  - Índigo `#29235C`.
  - Azul `#0064EC`, con degradado `#0057E2 → #0071F6`.
  - Tipografía Plus Jakarta Sans.
  - No existe manual de marca.
- **Lienzo de diseño** (referencia de todas las pantallas): https://claude.ai/artifact/8y9Cc8yj6zsUDFvNHCo3mx
- **Logotipos:**
  - `apps/web/public/logo-celmi-blanco.svg` es el original.
  - `logo-celmi-color.svg` es una variante derivada: texto y arco izquierdo en índigo, arco derecho en azul. Hay que sustituirla si aparece el original a color.

## Modelo de negocio observado (caso EPOXEMEX, cotización CELMISOLUTIONS-2026001253)

- **Flujo actual con tres documentos:**
  1. Solicitud de precios en Excel: costos de compra por mayorista.
  2. Corrida en Excel: utilidad y precios.
  3. Cotización PDF para el cliente.
- **Una cotización contiene varias propuestas alternativas** (el cliente elige una).
  - Cada propuesta tiene tipo (Cómputo, Accesorio), modalidad, partidas, subtotal, IVA, total y total con letra.
- **Varias partidas internas pueden mostrarse al cliente como una sola línea.**
  - Ejemplo: SSD + servicio de instalación.
  - Precio visible = suma de los precios unitarios redondeados; exige la misma cantidad.
- **Transformaciones hacia el PDF:**
  - «PIEZA» pasa a «PZA».
  - «2 DÍAS» pasa a «2 DÍAS HÁBILES».
  - El SKU va en negritas entre corchetes al final del título de la descripción.
- **Condiciones del PDF:**
  - Son viñetas con fragmentos en negritas.
  - La vigencia es fecha + hora (30 sep 2026, 12:30 h) y aparece dentro del texto de una condición.
  - Firma: Alejandro Bonilla Becerril, Gerente CELMISOLUTIONS.
- **Pie del PDF:** CELMILENIUM S.A. DE C.V., Plaza Juárez No. 116 Col. Centro, C.P. 42000, Pachuca, Hidalgo · RFC CEL1812033U2 · (771) 717 45 00 · www.celmisolutions.com.

## Reglas confirmadas

| Fecha      | Regla                                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | Precio unitario = costo × tipo de cambio × (1 + utilidad %). La utilidad es sobre el costo.                                                                                                                                                                                                                    |
| 2026-10-02 | El precio unitario se redondea a 2 decimales (mitad hacia arriba) **antes** de multiplicar por la cantidad. Subtotal = Σ(unitario × cantidad). IVA = 16 % del subtotal, redondeado. Total = subtotal + IVA. Verificado al centavo contra las 7 tablas del PDF EPOXEMEX (`packages/core/src/epoxemex.test.ts`). |
| 2026-10-02 | Folio: `CELMISOLUTIONS-` + año + consecutivo de 6 dígitos (`CELMISOLUTIONS-2026001253`). El consecutivo se reinicia cada año y lo asigna el servidor.                                                                                                                                                          |
| 2026-10-02 | Si aparece un mejor costo con otro mayorista, se registra como una **Rev** dentro del mismo proyecto; no se sobrescribe.                                                                                                                                                                                       |
| 2026-10-02 | En el dashboard, «monto cotizado» y «en negociación» toman la **propuesta de menor monto** de cada cotización.                                                                                                                                                                                                 |
| 2026-10-03 | Aclaración: cambiar de mayorista es poco común. Lo usual es obtener una **mejora de precio**. El costo previo se muestra como **«Precio anterior»** (tachado, con el % de mejora calculado por `mejoraDePrecio` en `packages/core`), nunca como «otro mayorista».                                              |
| 2026-10-03 | Cuando el mayorista mejora su precio **sí se crea una nueva Rev**.                                                                                                                                                                                                                                             |
| 2026-10-03 | Un ejecutivo ve **solo sus oportunidades** (y donde colabora); el administrador ve todas.                                                                                                                                                                                                                      |
| 2026-10-03 | Ejecutivos y Cotizador **ven costos**; la **utilidad solo la ve quien autoriza**.                                                                                                                                                                                                                              |
| 2026-10-03 | **Rodrigo Rivera también es administrador**, además de Alejandro Bonilla.                                                                                                                                                                                                                                      |
| 2026-10-03 | **2FA obligatoria para todos.**                                                                                                                                                                                                                                                                                |

## Base de datos (Fase 1)

- Migraciones SQL versionadas en `packages/db/migraciones/NNNN_nombre.sql`.
  - Se aplican con `npm run migrar -w @celmi/db` (lee `SUPABASE_DB_URL` de `packages/db/.env.local`).
  - **Una migración aplicada no se edita: se agrega otra.** El aplicador compara huellas SHA-256 y se detiene si alguna cambió.
- **Toda tabla nueva** debe habilitar RLS y dar privilegios explícitos a `authenticated` (una prueba falla si alguna tabla pública no tiene RLS).
- **Pruebas con PGlite** (PostgreSQL 18 en WebAssembly, sin `.exe` ni Docker):
  - `test/supabase-simulado.sql` imita roles, `auth.uid()` y `auth.jwt()`.
  - `como(db, 'jorge', …)` ejecuta como cada usuario.
  - Supabase usa PostgreSQL 15/17: no uses sintaxis exclusiva de la 18.
- **Seguridad en la base:**
  - Sesión válida = perfil activo + `aal2`.
  - Permisos por rol en `rol_permisos`.
  - Costos (`partida_costos`), utilidad (`partida_utilidad`) y precio (`partida_precios`) van en tablas separadas con reglas propias.
  - La revisión autorizada o emitida bloquea partidas y costos (salvo `modificaciones.autorizar`).
- **Auditoría:** disparadores en todas las tablas de negocio. Inalterable incluso para el superusuario.
- **Folio:** `public.asignar_folio()`, atómico. Cuándo se asigna (al crear o al emitir) sigue pendiente.
- **Roles iniciales:**
  - Administrador (todos los permisos): Alejandro y Rodrigo.
  - Ejecutivo: clientes ver/crear, oportunidades propias, costos y PDF.
  - Cotizador/Operador: clientes ver, costos y PDF; trabaja en oportunidades donde es colaborador.

## Autenticación en la web (Fase 1)

- **Tres capas:**
  - `proxy.ts` (barrera optimista, renueva la sesión).
  - `lib/sesion.ts` → `obtenerSesion()` / `exigirPermiso()` en el servidor, con `getClaims()`; nunca confiar en `getSession()`.
  - Las reglas RLS de la base.
- **Clientes de Supabase** en `lib/supabase/`:
  - `servidor` (cookies, sujeto a RLS).
  - `navegador` (2FA y contraseña).
  - `admin` (clave secreta, solo servidor y siempre después de `exigirPermiso`).
- **Rutas de acceso** (grupo `(acceso)`, sin menú):
  - `/entrar`: correo + contraseña.
  - `/entrar/verificar`: código TOTP.
  - `/entrar/configurar-2fa`: QR + clave.
  - `/acceso/confirmar`: canjea el enlace del administrador solo al presionar «Continuar», para que las vistas previas de Teams o WhatsApp no lo consuman.
  - `/restablecer`: contraseña nueva, mínimo 12 caracteres; configura el mismo mínimo en Supabase.
- **Administración** en `/admin/usuarios`: alta sin correo (`generateLink('invite')`), enlace de recuperación, restablecer 2FA, rol y activar/desactivar. Todo se registra en `accesos` con `realizado_por`.
- **Cierre por inactividad:** 30 minutos (`components/CierrePorInactividad.tsx`).
- **Sin `apps/web/.env.local`**, la web corre en **modo demostración**: sin inicio de sesión y con datos de muestra.

## Pantalla de autorización (corrida de precios)

- Debe parecerse lo más posible al «FORMATO CORRIDA COTIZACIÓN» de Excel que ya usa Alejandro: mismas columnas, mismo orden y fila de totales.
- **Columnas, en grupos con banda de color:**
  - Producto: marca, mayorista, modelo, tiempo de entrega, unidad, cantidad.
  - Costo: unitario sin IVA, moneda, T.C., unitario final sin IVA, costo compra sin/con IVA.
  - Utilidad: %, $ unitaria, total sin/con IVA.
  - Precio de venta: unitario sin/con IVA, total sin/con IVA.
- **Columnas personalizables** (menú «Columnas»): vistas rápidas «Como la corrida», «Sin IVA» y «Esencial». «Utilidad en %» siempre visible. Hoy la elección se guarda en el navegador; en la Fase 1 pasa al perfil del usuario.
- Las columnas «con IVA» por fila son informativas (`conIva`). El IVA que se cobra se calcula sobre el subtotal de cada propuesta.
- **Menú lateral compactable** (botón «Compactar menú»): queda en barra de íconos para dar más espacio al módulo; se recuerda sin parpadeo (`<html data-menu="compacto">` + variante Tailwind `compacto:`).

## Decisiones pendientes (no implementar sin confirmación)

Surgidas del análisis:

- ¿Una Rev creada por una mejora de precio vuelve a pasar por autorización, o hereda la utilidad autorizada?
- ¿Los adicionales (tipo Accesorio) cuentan como alternativa en el «menor monto», se suman o se excluyen? Hoy se excluyen y la interfaz lo indica.
- Significado de las columnas «Precio mínimo» y «Precio máximo» de la solicitud de precios.
- **Moneda extranjera:**
  - Se implementó como lo hace la corrida: el costo convertido no se redondea antes de la utilidad.
  - Falta confirmarlo con un caso real en USD y definir con cuántos decimales se captura el tipo de cambio (hoy se permiten 6).
- ¿Se permite utilidad negativa (vender bajo costo)? Hoy se rechaza.
- ¿Hay cantidades fraccionarias (metros, horas)? Hoy solo se aceptan enteros positivos.
- Formato del sufijo de revisión (`Rev A`, `Rev B`…) y qué pasa después de la Z.

Del RFP §39, aún abiertos:

- Descuentos.
- Prorrateo de costos ocultos.
- Fuente del tipo de cambio.
- Autenticación (¿correo corporativo?).
- Quién cambia estados y quién modifica cotizaciones autorizadas.
- Cuándo una cotización se considera emitida y si puede cancelarse.
- Conservación del historial y respaldos.
- Información legal del PDF.
- Firma electrónica y envío por correo.
- Integraciones (ERP/CRM, mayoristas, listas de precios).
- Usuarios externos.
- Alcance, versión mínima y distribución de la app Android, y eventos de notificaciones push.
- Hosting y dominio.
- Catálogos iniciales: mayoristas observados CVA, Ingram Micro, CT Internacional y Amazon; las condiciones salen del PDF EPOXEMEX.

## Estado por fase

- [x] **Fase 0 — Preparación:** monorepo, sistema de diseño, motor de precios con casos reales, web base, CI con controles de seguridad. (Esqueleto Expo creado y pausado.)
- [ ] Fase 1 — Arquitectura: modelo de datos, roles, autenticación, navegación.
- [ ] Fases 2–11: ver RFP §37.
