import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "account",
  base: "/account/",
  plugins: [react()],
  build: {
    outDir: "../account-dist",
    emptyOutDir: true,
  },
});
