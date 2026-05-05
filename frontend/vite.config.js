import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://172.19.128.1:8000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://172.19.128.1:8000',
        changeOrigin: true,
        ws: true
      }
    }
  }
});
