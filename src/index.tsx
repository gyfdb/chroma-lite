import { render } from "solid-js/web";
import App from "./App";
import { installZoomShortcuts } from "./zoom";
import "./tokens.css";
import "./styles.css";

// no browser right-click menu, so it feels like an app. text fields keep theirs
// for copy/paste, and dev builds keep it everywhere for Inspect
document.addEventListener("contextmenu", (e) => {
  if (import.meta.env.DEV) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest("input:not([type=range]):not([type=checkbox]):not([type=color]), textarea")) return;
  e.preventDefault();
});

installZoomShortcuts();

render(() => <App />, document.getElementById("root")!);
