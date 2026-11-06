import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // localhost counts as a secure context, which browsers require for microphone access.
    host: 'localhost',
    port: 5173,
  },
});
