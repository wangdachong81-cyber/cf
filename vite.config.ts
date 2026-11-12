import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/ws": { target: `ws://127.0.0.1:${process.env.PORT ?? 3001}`, ws: true },
      "/api": `http://127.0.0.1:${process.env.PORT ?? 3001}`,
    },
  },
  build: {
    target: "es2022",
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
