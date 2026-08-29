import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import i18n, { initializeI18n } from "./locales";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

const mountTarget = rootElement;

async function bootstrap() {
  // 仅支持中文界面
  await initializeI18n("zh-CN");

  ReactDOM.createRoot(mountTarget).render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
