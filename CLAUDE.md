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

| Fecha      | Regla                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | Precio unitario = costo × tipo de cambio × (1 + utilidad %). La utilidad es sobre el costo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-02 | El precio unitario se redondea a 2 decimales (mitad hacia arriba) **antes** de multiplicar por la cantidad. Subtotal = Σ(unitario × cantidad). IVA = 16 % del subtotal, redondeado. Total = subtotal + IVA. Verificado al centavo contra las 7 tablas del PDF EPOXEMEX (`packages/core/src/epoxemex.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-02 | Folio: `CELMISOLUTIONS-` + año + consecutivo de 6 dígitos (`CELMISOLUTIONS-2026001253`). El consecutivo se reinicia cada año y lo asigna el servidor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-02 | Si aparece un mejor costo con otro mayorista, se registra como una **Rev** dentro del mismo proyecto; no se sobrescribe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-02 | En el dashboard, «monto cotizado» y «en negociación» toman la **propuesta de menor monto** de cada cotización.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-03 | Aclaración: cambiar de mayorista es poco común. Lo usual es obtener una **mejora de precio**. El costo previo se muestra como **«Precio anterior»** (tachado, con el % de mejora calculado por `mejoraDePrecio` en `packages/core`), nunca como «otro mayorista».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-03 | Cuando el mayorista mejora su precio **sí se crea una nueva Rev**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-03 | Un ejecutivo ve **solo sus oportunidades** (y donde colabora); el administrador ve todas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-03 | Ejecutivos y Cotizador **ven costos**; la **utilidad solo la ve quien autoriza**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-03 | **Rodrigo Rivera también es administrador**, además de Alejandro Bonilla.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-03 | **2FA obligatoria para todos.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-03 | El **estado** de una oportunidad lo cambian **su ejecutivo y los administradores** (no los colaboradores); reasignar a otro ejecutivo, sólo administradores. Cada cambio queda en la bitácora `seguimiento`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-03 | Los **ejecutivos pueden editar clientes** y contactos (auditado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-03 | Los clientes **se capturan conforme se usan** (sin carga masiva inicial).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-05 | **Tareas personales** en cada oportunidad: cada quien las crea **sólo para sí mismo** y nadie más las ve (ni administradores). La anticipación del aviso se elige al crearla (a la hora, 15 min, 1 h, 1 día antes o sin aviso). Hoy el aviso es dentro de la app (contador en el menú, tarjeta y notificación del sistema con la app abierta); push al celular llegará con Android o la web publicada.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-05 | Una tarea puede tener **varios avisos** (máx. 6: a la hora, 15 min, 30 min, 1 h, 1 día, 2 días antes; tabla `tarea_avisos`) y **notas con formato**. Se **edita y reprograma** (al cambiar la fecha, los avisos se recalculan en la base). «Mis tareas» se ve como **tablero** (Vencidas, Hoy, Próximas, Completadas; arrastrar a Completadas la termina) o como lista.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-05 | **Texto con formato** en tareas y seguimiento (Tiptap): negritas, cursivas, subrayado con color, tachado, viñetas, numeración, color de texto y resaltado. Se guarda como **JSON validado contra una lista blanca** (`packages/validation/src/enriquecido.ts`), nunca HTML; también se guarda en texto plano para respaldo y búsqueda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-05 | **Notas de seguimiento editables sólo por su autor** (nunca los cambios de estado; nada se borra). Se marcan «editado» y la versión anterior queda en la auditoría. En la ficha, tareas y seguimiento van **compactos**: los formularios se despliegan con «Nueva tarea» / «Registrar» y la bitácora muestra los 4 registros recientes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-05 | **Captura en ventana flotante** (`components/VentanaFlotante.tsx`) con el fondo desenfocado. Si hay cambios y se cierra (clic fuera, Esc, «×» o «Cancelar»), pregunta: seguir editando, guardar, guardar como borrador o descartar. Los **borradores** van en la base (`borradores`, RLS: sólo su autor, sin auditoría), uno por persona, oportunidad y tipo, y se borran al guardar el registro.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-05 | **Subtareas** al estilo Asana: tareas hijas de un solo nivel (`tareas.tarea_padre_id`), con el mismo dueño y oportunidad que la principal y notas con formato. Fecha opcional; sin fecha no hay avisos. Se agregan rápido (título + Enter) en el detalle de la tarea o al crearla; se completan con su casilla y se abren en una ventana encima para editarlas. El tablero y el contador muestran sólo tareas principales, con su avance («2/5»). Las subtareas **se reordenan** arrastrando su manija o con ↑ ↓ (`tareas.orden`).                                                                                                                                                                                                                                                                                                      |
| 2026-10-05 | «Mis tareas» es un **pipeline de etapas personales** (`etapas_tarea`, una por persona, editables en «Etapas»): nombre, color, orden; máx. 8. Por omisión: Por hacer, En curso, En espera, Completada. Hay **una etapa final** que completa la tarea (se renombra, no se quita); debe quedar una abierta; al quitar una etapa sus tareas pasan a la primera. `tareas.estado` es el ciclo de vida y la base lo sincroniza con `etapa_id`. Interacción de tarjetas y filas (2026-10-05, priorizando UX): clic en una **zona libre** o en el botón ↗ → detalle; clic en el **título** (subrayado punteado, ▾) → «Mover a…»; clic en la **fecha** → «Reprogramar» (hoy, mañana, próximo lunes, en una semana, fecha y hora, quitar fecha). Los menús flotantes se dibujan dentro de la ventana modal abierta (`capaDe`), o quedarían detrás. |
| 2026-10-05 | **Tareas libres y sin horario**: una tarea puede no estar ligada a una oportunidad (se crea desde «Mis tareas», con oportunidad opcional) y puede no tener fecha; con fecha, la hora es opcional («sin hora» vence al final del día y sólo admite avisos de días antes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-05 | Una **Rev creada por mejora de precio vuelve a pasar por autorización** (no hereda la utilidad autorizada).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-05 | **Adicionales (tipo Accesorio):** el ejecutivo marca **por partida** cuáles se suman (`partidas.se_suma`). Las sumadas entran al subtotal de **cada** propuesta principal (el IVA se calcula sobre todo junto) y al «menor monto» del dashboard (`totalesConAdicionales`, `menorMonto` en `packages/core`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-05 | Las columnas «Precio mínimo» y «Precio máximo» de la solicitud de precios **se omiten**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-05 | **Moneda extranjera: 5 decimales** (escala del tipo de cambio).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-05 | **No se permite utilidad negativa** (no se vende bajo costo).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-05 | **Sólo cantidades enteras** (no hay fraccionarias).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-05 | **Sufijo de revisión:** la original no lleva; Rev A … Rev Z, después **Rev A1, B1 … Z1, A2…** (`sufijoRevision` en `packages/core`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-05 | **El folio se asigna al emitir la cotización** (no al crearla), para no dejar huecos en el consecutivo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-05 | **Adicionales de una partida** (p. ej. memoria RAM y su instalación): el ejecutivo decide si cada uno es **visible** (línea propia en la cotización) o **incluido** (oculto: el cliente ve una sola línea con el precio sumado). Cada adicional tiene **su propia utilidad**; el incluido lleva **la misma cantidad que su partida**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-05 | **Cargos prorrateados** (p. ej. envío especial): tienen costo y **utilidad propia**; su precio se reparte entre las partidas que elija el ejecutivo **en proporción a su precio de venta**. No se presentan como línea al cliente. (Resuelve el pendiente «prorrateo de costos ocultos» del RFP §39.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-05 | La **oportunidad** sólo indica el **tipo general: Adquisición o Arrendamiento** (`oportunidades.tipo`). Los esquemas específicos (VJM, FPO, crédito simple…) se eligen **por propuesta** en el paso de financiamiento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-05 | **Condiciones comerciales predefinidas** en un catálogo (Catálogos). En la cotización se eligen las que aplican y **se pueden ajustar sólo para esa cotización**; la vigencia se inserta donde la condición diga `{vigencia}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-05 | **Propuesta de financiamiento:** paso **después de la autorización de precios**, sin nueva autorización. Por cada propuesta se eligen uno o varios esquemas y, por cada esquema y plazo, se captura **mensualidad, valor residual, factor, tasa de interés y gastos de apertura o ratificación** (se capturan; no se calculan).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Base de datos (Fase 1)

- Migraciones SQL versionadas en `packages/db/migraciones/NNNN_nombre.sql`.
  - Se aplican con `npm run migrar -w @celmi/db` (lee `SUPABASE_DB_URL` de `packages/db/.env.local`).
  - **Una migración aplicada no se edita: se agrega otra.** El aplicador compara huellas SHA-256 y se detiene si alguna cambió.
- **Consultas de la web:** las columnas viven en `apps/web/lib/consultas.ts`. Si dos tablas tienen más de una relación (oportunidades ↔ perfiles), nombra la llave en el embebido (`perfiles!oportunidades_ejecutivo_id_fkey(...)`); si no, PostgREST responde PGRST201. En relaciones de una tabla consigo misma (subtareas) la pista va por columna (`tareas!tarea_padre_id(...)`); por nombre de llave la API no la encuentra. `npm run migrar` pide a la API recargar su caché del esquema. Después de cambiar consultas o esquema, corre `npm run verificar:consultas -w @celmi/web`: PGlite no pasa por PostgREST y no detecta estos errores. Un error de consulta nunca debe tratarse como «sin datos».
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
- **Folio:** `public.asignar_folio()`, atómico. Se asigna **al emitir** (decisión 2026-10-05).
- **Roles iniciales:**
  - Administrador (todos los permisos): Alejandro y Rodrigo.
  - Ejecutivo: clientes ver/crear, oportunidades propias, costos y PDF.
  - Cotizador/Operador: clientes ver, costos y PDF; trabaja en oportunidades donde es colaborador.

## Respaldos (decisión 2026-10-05)

El plan gratuito de Supabase no respalda. `npm run respaldo -w @celmi/db` exporta todas las tablas (`public` y `app`) en una transacción de sólo lectura, las comprime y las **cifra con AES-256-GCM** (`packages/db/src/respaldo.ts`, sólo `node:crypto`).

- Clave: `RESPALDO_CLAVE` en `packages/db/.env.local` (mín. 16 caracteres). La elige Rodrigo y la guarda también fuera del equipo: sin ella el respaldo no se abre.
- Destino: `Documentos\Respaldos CELMI` (o `RESPALDOS_DIR`); se conservan los 12 más recientes.
- `npm run respaldo:verificar -w @celmi/db` descifra el último y cuenta registros por tabla, sin tocar la base.
- No incluye usuarios de Supabase Auth (contraseñas, 2FA): se quedan en Supabase.
- Pendiente: script de restauración (sobre una base vacía con el mismo esquema).

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

- **Moneda extranjera:** se implementó como lo hace la corrida (el costo convertido no se redondea antes de la utilidad). Falta confirmarlo con un caso real en USD.

Del RFP §39, aún abiertos:

- Descuentos.
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
- [x] **Fase 1 — Arquitectura (2026-10-03):** modelo de datos con RLS, auditoría y folio; roles y permisos; inicio de sesión con 2FA obligatoria; administración de usuarios sin correo; navegación por permisos.
  - Supabase en uso: proyecto `celmi-cotizador` (us-west-2), migraciones 0001-0005 aplicadas y `npm run verificar -w @celmi/db` en orden. Rodrigo es administrador con 2FA.
  - Pendiente: dar de alta al resto del equipo (cuando Rodrigo lo decida) y passkeys (beta de Supabase, opcional).
- [ ] **Fase 2 — Clientes y oportunidades (en revisión):** clientes con búsqueda y ficha, oportunidades (tablero/tabla, arrastrar entre estados), paso 1 del wizard, bitácora de seguimiento, tareas personales con aviso, catálogos editables y dashboard con datos reales.
- [ ] **Fase 3 — Cotizaciones (en curso):**
  - [x] **3A · Modelo y reglas (2026-10-05, migración 0014):** ciclo borrador → pendiente → autorizada/rechazada (`app.reglas_revision`); bloqueo también mientras espera autorización; para enviar, todas las partidas con costo; para autorizar, todas con precio; precio nunca bajo el costo; tipo de cambio de 5 decimales; adicionales que se suman por partida; descripción con formato; `public.crear_revision` (copia sin utilidad ni precios, guarda «Precio anterior» en mejoras de precio). Sufijo de revisión y totales con adicionales en `packages/core`.
  - [ ] **3B · Wizard (en revisión, 2026-10-05):** `/cotizaciones/[id]` con 3 pasos propios: **Partidas y costos** (un solo paso: tabla compacta de solo lectura con todo a la vista; cada partida se captura o edita en ventana flotante con el editor de texto con formato; reordenar; propuestas y adicionales con «Se suma»), Condiciones (vigencia y texto con formato) y Autorización (revisar y enviar, retirar, motivo de rechazo). **Pegar desde Excel** (`packages/validation/src/pegado.ts`): reconoce la Solicitud de precios por encabezado u orden y empata con catálogos; **conserva el formato de origen** de la descripción (negritas, cursivas, subrayado, tachado, color) leyendo la versión HTML del portapapeles (`apps/web/lib/pegado-html.ts`), validado contra la lista blanca. Guardado atómico con `public.guardar_partidas` (0015/0016), Ctrl+S y aviso al salir. Wizard de 7 pasos: Condiciones antes de Autorización. **Adicionales** de cada partida (incluidos o visibles) y **cargos prorrateados** con sus partidas destino (0016: `partidas.partida_padre_id`, `presentacion`, `partida_prorrateos`); las descripciones largas se expanden con «Ver más». Cálculo en `packages/core`: `consolidarLinea` (incluidos), `repartir` y `prorratear` (mayor residuo, informa la diferencia de centavos); se aplica al autorizar (3C).
  - [x] **Adecuaciones (2026-10-05, migración 0017):** oportunidad con tipo general (Adquisición/Arrendamiento); catálogo de condiciones comerciales (Catálogos) y paso Condiciones para elegirlas y ajustarlas por cotización (`revision_condiciones`, `{vigencia}`); paso **Propuesta de financiamiento** tras la autorización (`propuesta_financiamientos`: esquema, plazo, mensualidad, valor residual, factor, tasa, gastos de apertura). Wizard: Cliente → Partidas y costos → Condiciones → Autorización → Financiamiento → Vista previa → Emisión.
  - [ ] 3C · Bandeja de autorización con datos reales.
  - [ ] 3D · Revisiones: crear, historial y comparación.
- [ ] Fases 4–11: ver RFP §37. La emisión (folio) y el PDF van en la Fase 4.
