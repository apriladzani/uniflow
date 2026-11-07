import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    root: frontendRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': frontendRoot,
      },
    },
    server: {
      // Google Identity Services needs this on http://localhost.
      headers: { 'Referrer-Policy': 'no-referrer-when-downgrade' },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
  };
});
