import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
  resolve: {
    // The @laude/* packages are file-linked from ./laudasist, which carries its
    // own node_modules — without dedupe Vite would bundle two React/Firebase
    // copies (breaking hooks and Firestore instanceof checks).
    dedupe: ['react', 'react-dom', 'socket.io-client'],
  },
});
