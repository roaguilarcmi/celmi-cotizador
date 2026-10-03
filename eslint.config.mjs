// Configuración base para los paquetes compartidos. apps/web tiene la suya (Next.js).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'apps/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // En pruebas se accede a filas que se acaban de insertar: el `!` es legítimo ahí y sólo ahí.
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
