export type ViewMode = "edit" | "split" | "preview";

export type ThemeOption = "light" | "dark" | "system";

export type BackgroundFit = "cover" | "contain" | "repeat";

export interface AppConfig {
  locale: string;
  dataDir: string;
  globalShortcut: string;
  closeToTray: boolean;
  autostart: boolean;
  defaultViewMode: string;
  noteAutoSave: boolean;
  noteSurfaceAutoSave: boolean;
  tileColor: string;
  // 自定义颜色：浅色/深色主题各一套，互不干扰（空 = 跟随主题默认）
  mainWindowColorLight?: string;
  mainWindowColorDark?: string;
  noteListColorLight?: string;
  noteListColorDark?: string;
  tileTextColorLight?: string;
  tileTextColorDark?: string;
  tileColorLight?: string;
  tileColorDark?: string;
  theme: ThemeOption;
  fontSize: number;
  surfaceFontSize: number;
  tabIndentSize: number;
  externalFileAutoSave: boolean;
  rememberSurfaceSize: boolean;
  tileCtrlClose: boolean;
  tileDoubleClickToEdit: boolean;
  tileSaveReturnsToPin: boolean;
  tileRenderMarkdown: boolean;
  renderHtmlMarkdown: boolean;
  splitScrollSync: boolean;
  surfaceWidth?: number;
  surfaceHeight?: number;
  // 主窗口尺寸与位置（逻辑像素）：完全退出时由后端记录，下次启动沿用
  mainWindowWidth?: number;
  mainWindowHeight?: number;
  mainWindowX?: number;
  mainWindowY?: number;
  toggleVisibilityShortcut: string;
  showTilesShortcut: string;
  openAtCursor: boolean;
  notepadAlwaysOnTop: boolean;
  backgroundImagePath?: string;
  backgroundFit?: BackgroundFit;
  backgroundDim?: number;
  backgroundBlur?: number;
  backgroundScale?: number;
  backgroundPositionX?: number;
  backgroundPositionY?: number;
}
