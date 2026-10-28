import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Estas pruebas inician sesión muchas veces desde la misma IP: el límite por IP se apaga (se prueba aparte en limite-por-ip.spec.ts).
    env: { LIMITE_POR_IP: 'desactivado' },
  },
});
