import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AboutPanel } from "./AboutPanel";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.1.0")),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("AboutPanel", () => {
  test("renders app identity", () => {
    const markup = renderToStaticMarkup(<AboutPanel onClose={vi.fn()} />);

    expect(markup).toContain("关于");
    expect(markup).toContain("fastnote");
    expect(markup).toContain("快速启动、后台静默的桌面便签工具");
  });

  test("renders version and license info", () => {
    const markup = renderToStaticMarkup(<AboutPanel onClose={vi.fn()} />);

    expect(markup).toContain("MIT License");
    expect(markup).toContain("您知道吗");
  });
});
