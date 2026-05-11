import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // Cache all JS/CSS assets with a cache-first strategy
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        runtimeCaching: [
          {
            // Google Fonts CSS — stale-while-revalidate
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css", expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // Google Fonts files — cache-first (fonts never change at the same URL)
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-webfonts", expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      includeAssets: ["physio-logo.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: false, // keep existing manifest.json
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/firebase") || id.includes("@firebase/")) {
            if (id.includes("firebase/auth")      || id.includes("@firebase/auth"))      return "firebase-auth";
            if (id.includes("firebase/firestore") || id.includes("@firebase/firestore")) return "firebase-firestore";
            if (id.includes("firebase/storage")   || id.includes("@firebase/storage"))   return "firebase-storage";
            if (id.includes("firebase/functions") || id.includes("@firebase/functions")) return "firebase-functions";
            return "firebase-core";
          }
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "react";
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/lucide-react") || id.includes("node_modules/react-icons")) return "icons";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
