import { defineConfig } from "vite";

// Browser CORS: the public verifier / DA-layer / XRPL endpoints don't send
// CORS headers, so the dev server (and any production host) must proxy them.
// Deployed equivalents: 3 trivial rewrite rules (Vercel/Netlify/CF Pages).
export default defineConfig({
  server: {
    proxy: {
      "/verifier-api": {
        target: "https://fdc-verifiers-testnet.flare.network",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/verifier-api/, ""),
      },
      "/da-api": {
        target: "https://ctn2-data-availability.flare.network",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/da-api/, ""),
      },
      "/xrpl-api": {
        target: "https://s.altnet.rippletest.net:51234",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xrpl-api/, ""),
      },
    },
  },
});
