import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Target modern browsers — smaller output, no legacy polyfills
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Firebase: split by sub-package so each can be cached independently ──
          if (id.includes("@firebase/firestore"))  return "firebase-firestore";
          if (id.includes("@firebase/auth"))       return "firebase-auth";
          if (id.includes("@firebase/storage"))    return "firebase-storage";
          if (id.includes("@firebase/functions"))  return "firebase-functions";
          if (id.includes("@firebase/") || id.includes("node_modules/firebase")) return "firebase-core";

          // ── React core ──
          if (id.includes("node_modules/react-dom")) return "react-dom";
          if (id.includes("node_modules/react/"))    return "react";

          // ── Routing ──
          if (id.includes("node_modules/react-router")) return "router";

          // ── Icons (tree-shaken but keep separate for cache) ──
          if (id.includes("node_modules/lucide-react") || id.includes("node_modules/react-icons")) return "icons";

          // ── Everything else ──
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
