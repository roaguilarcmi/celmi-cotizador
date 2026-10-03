# Cotizador CELMI Solutions

Plataforma interna, web y Android, para gestionar oportunidades, autorizar precios y emitir cotizaciones de
CELMI Solutions. Las reglas, decisiones y el estado del proyecto están en [CLAUDE.md](CLAUDE.md).

## Requisitos

- Node.js 22.18 o superior (probado con 24). Basta con el npm que trae Node: no se instala ninguna herramienta global.

## Arranque

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:3000. La demostración con la cotización real de EPOXEMEX está en `/autorizaciones/epoxemex`.

La app Android está en pausa hasta terminar la web (ver [CLAUDE.md](CLAUDE.md)).

## Seguridad

Las políticas de TI de CELMI tienen prioridad. Las dependencias no ejecutan scripts al instalarse (`.npmrc`) y no
pueden traer ejecutables (`npm run check:exe`). El servidor de desarrollo solo escucha en tu equipo. Detalles en
[CLAUDE.md](CLAUDE.md#seguridad-y-políticas-de-ti-prioridad-máxima).

## Verificación

```bash
npm run verify   # formato, lint, tipos, pruebas, build y revisión de ejecutables: lo mismo que corre la integración continua
```

## Estructura

| Carpeta               | Contenido                                  |
| --------------------- | ------------------------------------------ |
| `apps/web`            | Aplicación web (Next.js)                   |
| `apps/mobile`         | Aplicación Android (Expo), en pausa        |
| `packages/core`       | Lógica de negocio compartida y sus pruebas |
| `packages/validation` | Esquemas de validación (Zod)               |
| `packages/ui`         | Tokens del sistema de diseño               |
| `packages/db`         | Esquema de base de datos y migraciones     |
