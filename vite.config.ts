import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Firebase — largest dependency, cache separately
          if (id.includes("node_modules/firebase")) return "firebase";
          // React core
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
          // Routing
          if (id.includes("node_modules/react-router")) return "router";
          // Icons
          if (id.includes("node_modules/lucide-react") || id.includes("node_modules/react-icons")) return "icons";
          // Everything else stays in vendor
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
