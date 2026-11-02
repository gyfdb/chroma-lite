import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// tauri expects a fixed port and no screen clearing
export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
