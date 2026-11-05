import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative Pfade, damit der Build auch in einem Unterverzeichnis läuft
  // (z.B. GitHub Pages unter /<repository>/).
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
});
