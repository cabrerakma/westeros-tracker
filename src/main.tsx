import { createRoot } from "react-dom/client";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/im-fell-english/latin-400.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
