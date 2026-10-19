import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_API_ORIGIN = 'http://127.0.0.1:8080';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiOrigin = env.VITE_DEV_API_ORIGIN || DEFAULT_API_ORIGIN;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      // Same-origin /v1 and /auth in the browser (matches vercel.json). MSW
      // intercepts first when VITE_API_MODE=mock, so this proxy is unused then.
      proxy: {
        '/v1': { target: apiOrigin, changeOrigin: true },
        '/auth': { target: apiOrigin, changeOrigin: true },
      },
    },
  };
});
