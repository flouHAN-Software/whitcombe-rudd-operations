import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './': statik derleme her klasörden (GitHub Pages dahil) açılabilsin
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5190, strictPort: true },
  preview: { port: 5191, strictPort: true }
});
