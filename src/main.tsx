import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTelegram } from "./telegram";
import "./styles.css";

// Before the first render, so the inset and viewport custom properties are set
// by the time the shell measures itself.
initTelegram();

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
