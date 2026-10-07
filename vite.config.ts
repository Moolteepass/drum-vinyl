import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works from a subfolder like GitHub Pages' /drum-vinyl/.
  base: "./",
  plugins: [react(), tailwindcss()],
});
