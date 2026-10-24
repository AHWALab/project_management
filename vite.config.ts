import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves this repo from /project_management/, so assets need that
// prefix in a production build. Local dev stays at the root.
// Override with BASE_PATH=/ if you deploy to a custom domain or Netlify.
const base = process.env.BASE_PATH ?? "/project_management/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
