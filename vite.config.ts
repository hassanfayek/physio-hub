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
          if (id.includes("node_modules/firebase") || id.includes("@firebase/")) return "firebase";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "react";
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/lucide-react") || id.includes("node_modules/react-icons")) return "icons";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
