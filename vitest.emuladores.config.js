import { defineConfig } from "vitest/config";

// Testes contra os emuladores (Auth, Firestore, Storage). Rode com:
//   npm run test:emuladores
export default defineConfig({
  test: {
    include: ["src/**/*.emu.test.js"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
