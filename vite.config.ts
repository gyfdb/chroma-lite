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
    // the UI only runs in WebView2 (windows) or WebKitGTK (linux), so there's
    // no down-levelling for old browsers
    target: ["chrome105", "safari15"],
    cssTarget: ["chrome105", "safari15"],
    minify: "esbuild",
    sourcemap: false,
    reportCompressedSize: false,
    modulePreload: { polyfill: false },
  },
});
