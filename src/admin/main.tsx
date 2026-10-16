import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/big-shoulders-display/700";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "../styles/global.css";
import { AdminApp } from "./AdminApp";

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró #root");

createRoot(root).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
