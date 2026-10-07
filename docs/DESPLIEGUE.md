# Publicar el Cotizador en Netlify

Guía para dejar la web disponible todo el tiempo (decisión 2026-10-07). Netlify compila el proyecto en su nube a partir
del repositorio privado de GitHub: en el equipo no se instala nada y no hace falta pedir nada a TI.

El repositorio ya está preparado:

- `apps/web/netlify.toml`: cómo compilar (revisa que no haya ejecutables y compila la web; Node 24).
- Encabezados de seguridad en `apps/web/next.config.ts` y política de contenido (CSP) con nonce en `apps/web/proxy.ts`.
- `robots.txt` y `X-Robots-Tag`: los buscadores no la indexan.
- Los enlaces de alta y recuperación usan la dirección fija `SITIO_URL`, nunca la que llega en la petición.
- `.github/workflows/mantener-activo.yml`: consulta semanal para que Supabase no pause la base (opcional).

> Las claves **nunca** se escriben en el chat ni en el repositorio: sólo en Netlify (y, si se usa el paso 6, en GitHub).

## 1. Cuenta de Netlify

1. Entra a <https://app.netlify.com/signup> y elige **Sign up with GitHub** (con tu cuenta de GitHub, que ya tiene el
   repositorio). El plan **Free** no pide tarjeta.
2. Activa la verificación en dos pasos: avatar → **User settings** → **Security** → **Two-factor authentication**.

## 2. Conectar el repositorio (sólo ése)

1. **Add new project** → **Import an existing project** → **GitHub**.
2. Cuando GitHub pregunte qué repositorios puede ver Netlify, elige **Only select repositories** → `celmi-cotizador`.
   No le des acceso a todos.
3. Elige `celmi-cotizador` y, en la configuración de compilación:

   | Campo                        | Valor                                                    |
   | ---------------------------- | -------------------------------------------------------- |
   | Branch to deploy             | `main`                                                   |
   | Base directory               | _(vacío)_                                                |
   | Package directory            | `apps/web`                                               |
   | Build command / Publish dir. | _(déjalos como los propone: los toma de `netlify.toml`)_ |

4. **Antes de desplegar**, en la misma pantalla, agrega las variables del paso 3 (o despliega y agrégalas después; sin
   ellas la web abre en «modo demostración»).
5. Nombre del sitio: **Project configuration → General → Change project name**, p. ej. `cotizador-celmi`. La dirección
   será `https://cotizador-celmi.netlify.app`.

## 3. Variables de entorno

**Project configuration → Environment variables → Add a variable.** Copia los valores de `apps/web/.env.local`.

| Variable                               | Valor                                           | Scopes             | ¿Secreta?                        |
| -------------------------------------- | ----------------------------------------------- | ------------------ | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | la de `.env.local`                              | Builds, Functions  | No (es pública)                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la de `.env.local`                              | Builds, Functions  | No (es pública)                  |
| `SUPABASE_SECRET_KEY`                  | la de `.env.local`                              | **Sólo Functions** | **Sí: «Contains secret values»** |
| `SITIO_URL`                            | `https://cotizador-celmi.netlify.app` (la tuya) | Functions          | No                               |

- `SUPABASE_SECRET_KEY` da acceso de administrador: márcala como secreta y que **no** esté en «Builds» (así nunca llega
  al código que ve el navegador).
- Después de capturar o cambiar variables: **Deploys → Trigger deploy → Deploy project**.

## 4. Sólo se publica `main`

**Project configuration → Build & deploy → Branches and deploy contexts → Configure:**

- Production branch: `main`.
- Branch deploys: **None**.
- Deploy previews: **None** (no se publican versiones de prueba con dirección propia).

Cada `git push` a `main` publica la versión nueva en uno o dos minutos. Antes de subir cambios se corre
`npm run verify` (lo mismo que revisa CI).

## 5. Supabase: dirección del sitio

En Supabase: **Authentication → URL Configuration**.

- **Site URL**: `https://cotizador-celmi.netlify.app` (la tuya).
- **Redirect URLs**: agrega `https://cotizador-celmi.netlify.app/**`. Deja también `http://127.0.0.1:3000/**` para
  trabajar en el equipo.

## 6. (Opcional) Que Supabase no se pause

El plan gratuito de Supabase pausa el proyecto tras 7 días sin uso. Con uso diario no pasa; si habrá semanas sin uso:
en GitHub, **Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL`: la de `NEXT_PUBLIC_SUPABASE_URL`.
- `SUPABASE_PUBLISHABLE_KEY`: la de `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

El flujo «Mantener activa la base» corre cada lunes (también se puede correr a mano desde **Actions**).

## 7. Comprobar

1. Abre la dirección del sitio: debe pedir correo, contraseña y código 2FA.
2. Avísame la dirección: reviso los encabezados de seguridad, el certificado y que nada quede bloqueado.

## Si algo falla

- **La compilación falla:** Netlify → **Deploys** → el despliegue fallido → **Deploy log**. Mientras falle, sigue
  publicada la versión anterior.
- **La web dice «Modo demostración»:** faltan `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, o no
  se volvió a desplegar después de capturarlas.
- **Al dar de alta un usuario aparece «Falta configurar la dirección del sitio»:** falta `SITIO_URL` o no empieza con
  `https://`.
- **Se rebasa el plan gratuito:** Netlify pausa el sitio hasta el siguiente mes (no cobra sin tarjeta).
