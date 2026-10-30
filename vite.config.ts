import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          hf: ['@huggingface/hub'],
        }
      }
    }
  },
  server: {
    port: 5173,
  }
});
