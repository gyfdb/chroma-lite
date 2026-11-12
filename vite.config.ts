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
  build: {
    // the UI only runs in evergreen WebView2 (windows) or WebKitGTK (linux).
    // chrome111 / safari16.2 are the first with color-mix(), which the tokens use
    target: ["chrome111", "safari16.2"],
    cssTarget: ["chrome111", "safari16.2"],
    minify: "esbuild",
    sourcemap: false,
    reportCompressedSize: false,
    modulePreload: { polyfill: false },
  },
});
