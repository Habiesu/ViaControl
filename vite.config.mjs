import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry (Electron) — compilado en dist-electron/
        entry: 'main.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'sqlite3', 'electron-updater', 'path', 'fs'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: 'dist-renderer',
  },
  base: './',
});
