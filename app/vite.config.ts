import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import IstanbulPlugin from "vite-plugin-istanbul";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), IstanbulPlugin()],
  server: {
    open: true
  },
  build: {
    sourcemap: "hidden"
  }
});
