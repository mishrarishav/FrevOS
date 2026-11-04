import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles.css";
import "./desktop-workspace.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) {
  throw new Error("DevSetu Control Center root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
