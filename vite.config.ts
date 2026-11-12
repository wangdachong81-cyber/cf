import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:3001", ws: true },
      "/api": "http://127.0.0.1:3001",
    },
  },
  build: {
    target: "es2022",
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
