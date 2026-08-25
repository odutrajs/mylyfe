import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const productionApi = "https://feedeo.com.br";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": {
        target: productionApi,
        changeOrigin: true,
        secure: true
      }
    }
  },
  preview: {
    proxy: {
      "/api": {
        target: productionApi,
        changeOrigin: true,
        secure: true
      }
    }
  },
  optimizeDeps: {
    include: ["@stripe/stripe-js", "@stripe/react-stripe-js"]
  }
});
