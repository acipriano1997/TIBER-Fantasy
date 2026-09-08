import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/mobilePwa.css";

// Set dark mode globally for all shadcn components
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
