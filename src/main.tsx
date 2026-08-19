import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import InquiryWidget from "./components/InquiryWidget";
import { I18nProvider } from "./lib/i18n";
import { LOCALE_META, localeFromPath } from "./lib/locale";
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";

const locale = localeFromPath(window.location.pathname);
document.documentElement.lang = LOCALE_META[locale].htmlLang;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider locale={locale}>
      <App />
      <InquiryWidget />
    </I18nProvider>
  </StrictMode>
);
