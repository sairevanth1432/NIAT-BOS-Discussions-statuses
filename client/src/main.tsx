import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const savedTheme = localStorage.getItem("sheetsync_theme");
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
