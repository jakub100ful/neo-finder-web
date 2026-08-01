import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    watch: {
      usePolling: process.env.CODEX_SANDBOX === "seatbelt"
    }
  }
});
