import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// base relativa + HashRouter: o build em docs/ funciona no GitHub Pages
// (https://<usuario>.github.io/<repo>/) sem configurar reescrita de rotas.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "docs", emptyOutDir: true },
  // *.emu.test.js rodam contra os emuladores do Firebase: npm run test:emuladores
  test: { exclude: [...configDefaults.exclude, "**/*.emu.test.js"] },
});
