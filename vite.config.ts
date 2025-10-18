import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://demo.ticimax.com",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(
            /^\/api/,
            "/TicimaxXmlV2/57549780091044F18AA8B92EAFEBC4FB"
          ),
      },
    },
  },
});
