import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./globals.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Hazumi web root is missing");

createRoot(root).render(<App />);
