import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // PORT lets a second dev instance run alongside the default one on 5173.
  server: { port: Number(process.env.PORT) || 5173 },
});
