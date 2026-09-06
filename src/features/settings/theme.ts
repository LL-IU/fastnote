import { normalizeHexColor } from "./tileColor";
import type { AppConfig, ThemeOption } from "./types";

export type ResolvedTheme = "light" | "dark";

type AppearanceConfig = Pick<
  AppConfig,
  "theme" | "mainWindowColorLight" | "mainWindowColorDark" | "noteListColorLight" | "noteListColorDark"
>;

function resolveTheme(option: ThemeOption): ResolvedTheme {
  if (option === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return option;
}

export function resolvedTheme(): ResolvedTheme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(option: ThemeOption): void {
  const root = document.documentElement;
  const resolved = resolveTheme(option);
  // Cache to localStorage so the blocking script in index.html can set
  // data-theme before first paint, preventing a flash of wrong theme.
  localStorage.setItem("theme-option", option);
  localStorage.setItem("theme-resolved", resolved);
  if (root.getAttribute("data-theme") !== resolved) {
    root.classList.add("theme-transition");
    root.setAttribute("data-theme", resolved);
    setTimeout(() => root.classList.remove("theme-transition"), 400);
  }
}

let systemListener: (() => void) | null = null;

export function watchSystemTheme(option: ThemeOption): () => void {
  if (systemListener) {
    systemListener();
    systemListener = null;
  }

  if (option !== "system") return () => {};

  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    // 系统主题切换：用最近一次外观配置重应用（保留自定义颜色按新主题解析）
    if (lastAppearanceConfig) {
      applyAppearance(lastAppearanceConfig);
    } else {
      applyTheme("system");
    }
  };
  mql.addEventListener("change", handler);

  const cleanup = () => {
    mql.removeEventListener("change", handler);
    // 仅当自己仍是当前单例时才清空全局引用；否则会把后来者
    // （如设置面板刚注册的监听）的注销入口抹掉，造成监听泄漏
    if (systemListener === cleanup) {
      systemListener = null;
    }
  };
  systemListener = cleanup;
  return cleanup;
}

/// 最近一次外观配置：系统主题切换时用它重应用自定义颜色
let lastAppearanceConfig: AppearanceConfig | null = null;

/// 主题 + 自定义颜色一起应用。设置项底色按列表色用 color-mix 自动加深。
export function applyAppearance(config: AppearanceConfig): void {
  lastAppearanceConfig = config;
  applyTheme(config.theme);
  applyCustomColors(config, resolvedTheme());
}

/// 自定义颜色（主窗口背景 / 笔记列表），浅色与深色主题各一套互不干扰；
/// 空值表示该主题跟随默认。设置项底色按列表色用 color-mix 自动加深。
export function applyCustomColors(
  config: Pick<
    AppConfig,
    "mainWindowColorLight" | "mainWindowColorDark" | "noteListColorLight" | "noteListColorDark"
  >,
  resolved: ResolvedTheme,
): void {
  const root = document.documentElement;
  const setOrClear = (name: string, value: string | undefined) => {
    if (value) {
      root.style.setProperty(name, value);
    } else {
      root.style.removeProperty(name);
    }
  };

  const pick = (light?: string, dark?: string) =>
    normalizeHexColor(resolved === "dark" ? dark : light);

  setOrClear("--color-cloud", pick(config.mainWindowColorLight, config.mainWindowColorDark) || undefined);
  const noteList = pick(config.noteListColorLight, config.noteListColorDark);
  setOrClear("--color-paper", noteList || undefined);
  if (noteList) {
    // 设置项底色比列表深一点；边框/轨道再深一档，保持层次
    root.style.setProperty("--color-paper-warm", `color-mix(in oklch, ${noteList} 93%, black)`);
    root.style.setProperty("--color-paper-deep", `color-mix(in oklch, ${noteList} 85%, black)`);
  } else {
    root.style.removeProperty("--color-paper-warm");
    root.style.removeProperty("--color-paper-deep");
  }
}
