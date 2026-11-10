import { createRoot } from "react-dom/client";
import { LanguageProvider } from "./i18n";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
);
