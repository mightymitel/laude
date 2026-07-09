import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
  resolve: {
    // The @laude/* workspace packages may resolve their own peer copies —
    // without dedupe Vite would bundle two React/socket.io copies (breaking
    // hooks and instanceof checks).
    dedupe: ['react', 'react-dom', 'socket.io-client'],
  },
});
