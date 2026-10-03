// Configuración base para los paquetes compartidos. apps/web tiene la suya (Next.js).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'apps/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
);
