import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { checkGlobalShortcut, chooseBackgroundImage } from "../features/settings/api";
import type {
  AppConfig,
  BackgroundFit,
  ThemeOption,
  TileColorMode,
  ViewMode,
} from "../features/settings/types";
import {
  formatHeldKeys,
  hotkeyToConfigString,
  isValidGlobalShortcut,
  shortcutPlatform,
} from "../features/settings/shortcutRecorder";
import { useShortcutRecorder } from "../features/settings/useShortcutRecorder";
import { DEFAULT_TILE_COLOR, normalizeTileColor } from "../features/settings/tileColor";
import { applyTheme, watchSystemTheme } from "../features/settings/theme";
import {
  webdavGetConfig,
  webdavRestore,
  webdavSetConfig,
  webdavSyncNow,
  webdavTest,
} from "../features/settings/webdav";
import { SlidingButtonGroup } from "./SlidingButtonGroup";

const HARMONY_FONT_LICENSE_URL = new URL("../assets/fonts/LICENSE_Fonts", import.meta.url).href;

interface SettingsPanelProps {
  config: AppConfig;
  onChange: (config: AppConfig) => void;
  onMigrateDataDir: () => void;
  onClose: () => void;
}

export function SettingsPanel({ config, onChange, onMigrateDataDir, onClose }: SettingsPanelProps) {
  const { t } = useTranslation();
  const setConfigValue = <Key extends keyof AppConfig>(key: Key, value: AppConfig[Key]) => {
    onChange({ ...config, [key]: value });
  };
  const tileColorModes = useMemo<Array<{ value: TileColorMode; label: string }>>(
    () => [
      {
        value: "system",
        label: t("settings.tileColor.followTheme", { defaultValue: "跟随主题" }),
      },
      {
        value: "custom",
        label: t("settings.tileColor.custom", { defaultValue: "自定义" }),
      },
    ],
    [t],
  );
  const themeOptions = useMemo<Array<{ value: ThemeOption; label: string }>>(
    () => [
      { value: "light", label: t("settings.theme.light", { defaultValue: "浅色" }) },
      { value: "dark", label: t("settings.theme.dark", { defaultValue: "深色" }) },
      {
        value: "system",
        label: t("settings.theme.system", { defaultValue: "跟随系统" }),
      },
    ],
    [t],
  );
  const viewModes = useMemo<Array<{ value: ViewMode; label: string }>>(
    () => [
      { value: "edit", label: t("settings.defaultView.edit", { defaultValue: "编辑" }) },
      { value: "split", label: t("settings.defaultView.split", { defaultValue: "分栏" }) },
      {
        value: "preview",
        label: t("settings.defaultView.preview", { defaultValue: "预览" }),
      },
    ],
    [t],
  );
  const backgroundFits = useMemo<Array<{ value: BackgroundFit; label: string }>>(
    () => [
      { value: "cover", label: t("settings.background.fit.cover", { defaultValue: "填充" }) },
      { value: "contain", label: t("settings.background.fit.contain", { defaultValue: "完整" }) },
      { value: "repeat", label: t("settings.background.fit.repeat", { defaultValue: "平铺" }) },
    ],
    [t],
  );

  return (
    <aside className="w-[360px] h-full shrink-0 border-l border-paper-deep/30 bg-cloud/92 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between h-11 px-4 border-b border-paper-deep/25">
        <h2 className="text-[13px] font-display font-medium text-ink-soft">
          {t("settings.title", { defaultValue: "应用设置" })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors cursor-pointer"
          title={t("settings.closeTitle", { defaultValue: "关闭设置" })}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hidden px-4 py-4 space-y-5">
        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.theme.label", { defaultValue: "主题" })}
          </label>
          <SlidingButtonGroup
            options={themeOptions}
            value={config.theme}
            onChange={(v: ThemeOption) => {
              setConfigValue("theme", v);
              applyTheme(v);
              watchSystemTheme(v);
            }}
          />
        </section>

        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.dataDir", { defaultValue: "数据目录" })}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.dataDir}
              readOnly
              className="min-w-0 flex-1 h-8 px-2.5 rounded-lg bg-paper-warm/70 border border-paper-deep/40 text-[11px] font-mono text-ink-faint truncate"
            />
            <button
              type="button"
              onClick={onMigrateDataDir}
              className="h-8 px-3 rounded-lg border border-paper-deep/45 text-[11px] text-ink-faint hover:text-bamboo hover:bg-bamboo-mist/50 transition-colors cursor-pointer"
            >
              {t("settings.selectFolder", { defaultValue: "选择文件夹" })}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <ToggleRow
            label={t("settings.closeToTray", { defaultValue: "关闭到托盘" })}
            checked={config.closeToTray}
            onChange={(checked) => setConfigValue("closeToTray", checked)}
          />
          <ToggleRow
            label={t("settings.autostart", { defaultValue: "开机自启" })}
            checked={config.autostart}
            onChange={(checked) => setConfigValue("autostart", checked)}
          />
          <ToggleRow
            label={t("settings.autoSave.note", { defaultValue: "自动保存笔记" })}
            checked={config.noteAutoSave}
            onChange={(checked) => setConfigValue("noteAutoSave", checked)}
          />
          <ToggleRow
            label={t("settings.autoSave.surface", { defaultValue: "小窗笔记自动保存" })}
            checked={config.noteSurfaceAutoSave}
            onChange={(checked) => setConfigValue("noteSurfaceAutoSave", checked)}
          />
          <ToggleRow
            label={t("settings.autoSave.externalFile", { defaultValue: "外部文件自动保存" })}
            checked={config.externalFileAutoSave}
            onChange={(checked) => setConfigValue("externalFileAutoSave", checked)}
          />
          <ToggleRow
            label={t("settings.rememberSurfaceSize", { defaultValue: "记住小窗尺寸" })}
            checked={config.rememberSurfaceSize}
            onChange={(checked) => setConfigValue("rememberSurfaceSize", checked)}
          />
          <ToggleRow
            label={t("settings.notepadAlwaysOnTop", { defaultValue: "小窗默认置顶" })}
            checked={config.notepadAlwaysOnTop ?? false}
            onChange={(checked) => setConfigValue("notepadAlwaysOnTop", checked)}
          />
          <ToggleRow
            label={t("settings.tileRenderMarkdown", { defaultValue: "磁贴渲染 Markdown" })}
            checked={config.tileRenderMarkdown}
            onChange={(checked) => setConfigValue("tileRenderMarkdown", checked)}
          />
          <ToggleRow
            label={t("settings.tileDoubleClickToEdit", { defaultValue: "双击磁贴进入编辑" })}
            checked={config.tileDoubleClickToEdit ?? false}
            onChange={(checked) => setConfigValue("tileDoubleClickToEdit", checked)}
          />
          <ToggleRow
            label={t("settings.tileSaveReturnsToPin", { defaultValue: "保存后回到磁贴" })}
            checked={config.tileSaveReturnsToPin ?? false}
            onChange={(checked) => setConfigValue("tileSaveReturnsToPin", checked)}
          />
          <ToggleRow
            label={t("settings.renderHtmlMarkdown", { defaultValue: "允许 HTML 标签渲染" })}
            checked={config.renderHtmlMarkdown}
            onChange={(checked) => setConfigValue("renderHtmlMarkdown", checked)}
          />
          <ToggleRow
            label={t("settings.splitScrollSync", { defaultValue: "分栏同步滚动" })}
            checked={config.splitScrollSync ?? true}
            onChange={(checked) => setConfigValue("splitScrollSync", checked)}
          />
        </section>

        {/* 快捷键功能设置区域，与上方常规设置分开 */}
        <section className="space-y-2">
          <ToggleRow
            label={t("settings.tileCtrlClose", { defaultValue: "Ctrl+右键快速关闭磁贴" })}
            checked={config.tileCtrlClose}
            onChange={(checked) => setConfigValue("tileCtrlClose", checked)}
          />
          <ToggleRow
            label={t("settings.openAtCursor", { defaultValue: "快捷键打开时跟随鼠标位置" })}
            checked={config.openAtCursor ?? true}
            onChange={(checked) => setConfigValue("openAtCursor", checked)}
          />
          <div className="space-y-1.5">
            <label className="block text-[11px] font-body text-ink-faint/70 px-0.5">
              {t("settings.quickNoteShortcut", { defaultValue: "快捷记录快捷键" })}
            </label>
            <ShortcutRecorder
              value={config.globalShortcut}
              onChange={(v) => setConfigValue("globalShortcut", v)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-body text-ink-faint/70 px-0.5">
              {t("settings.visibilityShortcut", { defaultValue: "显示/隐藏主窗口" })}
            </label>
            <ShortcutRecorder
              value={config.toggleVisibilityShortcut}
              onChange={(v) => setConfigValue("toggleVisibilityShortcut", v)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-body text-ink-faint/70 px-0.5">
              {t("settings.showTilesShortcut", { defaultValue: "置顶/置底磁贴" })}
            </label>
            <ShortcutRecorder
              value={config.showTilesShortcut}
              onChange={(v) => setConfigValue("showTilesShortcut", v)}
            />
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.fontSize.editor", { defaultValue: "编辑器字号" })}
          </label>
          <div className="flex items-center gap-3 h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
            <input
              type="range"
              min={8}
              max={30}
              step={1}
              value={config.fontSize ?? 14}
              onChange={(event) => setConfigValue("fontSize", Number(event.target.value))}
              className="flex-1 h-1 accent-bamboo cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-paper-deep/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bamboo [&::-webkit-slider-thumb]:-mt-[4.5px] [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
            />
            <span className="text-[12px] font-mono text-ink-soft tabular-nums w-8 text-right">
              {config.fontSize ?? 14}px
            </span>
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.fontSize.surface", { defaultValue: "小窗/磁贴字号" })}
          </label>
          <div className="flex items-center gap-3 h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
            <input
              type="range"
              min={8}
              max={30}
              step={1}
              value={config.surfaceFontSize ?? 14}
              onChange={(event) => setConfigValue("surfaceFontSize", Number(event.target.value))}
              className="flex-1 h-1 accent-bamboo cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-paper-deep/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bamboo [&::-webkit-slider-thumb]:-mt-[4.5px] [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
            />
            <span className="text-[12px] font-mono text-ink-soft tabular-nums w-8 text-right">
              {config.surfaceFontSize ?? 14}px
            </span>
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.tabIndentSize", { defaultValue: "Tab 缩进宽��" })}
          </label>
          <div className="flex items-center gap-3 h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={config.tabIndentSize ?? 2}
              onChange={(event) => setConfigValue("tabIndentSize", Number(event.target.value))}
              className="flex-1 h-1 accent-bamboo cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-paper-deep/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bamboo [&::-webkit-slider-thumb]:-mt-[4.5px] [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
            />
            <span className="text-[12px] font-mono text-ink-soft tabular-nums w-10 text-right">
              {config.tabIndentSize ?? 2}
            </span>
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.tileColor.label", { defaultValue: "磁贴颜色" })}
          </label>
          <SlidingButtonGroup
            options={tileColorModes}
            value={config.tileColorMode}
            onChange={(v: TileColorMode) => setConfigValue("tileColorMode", v)}
          />
          {config.tileColorMode === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={normalizeTileColor(config.tileColor)}
                onChange={(event) => setConfigValue("tileColor", event.target.value)}
                className="w-10 h-8 rounded-lg border border-paper-deep/40 bg-paper-warm/70 cursor-pointer"
              />
              <input
                type="text"
                value={config.tileColor}
                onChange={(event) => setConfigValue("tileColor", event.target.value)}
                placeholder="#faf7ef"
                spellCheck={false}
                className="min-w-0 flex-1 h-8 px-2.5 rounded-lg bg-paper-warm/70 border border-paper-deep/40 text-[12px] font-mono text-ink-soft outline-none"
              />
              <button
                type="button"
                onClick={() => setConfigValue("tileColor", DEFAULT_TILE_COLOR)}
                className="h-8 px-2.5 rounded-lg border border-paper-deep/45 text-[11px] text-ink-faint hover:text-bamboo hover:bg-bamboo-mist/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                {t("common.default", { defaultValue: "默认" })}
              </button>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.background.label", { defaultValue: "背景图片" })}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={
                (config.backgroundImagePath &&
                  (localStorage.getItem("backgroundImageName") ||
                    config.backgroundImagePath.split(/[/\\]/).pop())) ||
                t("settings.background.default", { defaultValue: "默认背景" })
              }
              readOnly
              className="min-w-0 flex-1 h-8 px-2.5 rounded-lg bg-paper-warm/70 border border-paper-deep/40 text-[11px] font-mono text-ink-faint truncate"
            />
            <button
              type="button"
              onClick={() => {
                void chooseBackgroundImage().then(async (path) => {
                  if (!path) return;
                  const originalName = path.split(/[/\\]/).pop() ?? "";
                  const saved = await invoke<string>("copy_background_image", {
                    sourcePath: path,
                  });
                  localStorage.setItem("backgroundImageName", originalName);
                  setConfigValue("backgroundImagePath", saved);
                });
              }}
              className="h-8 px-3 rounded-lg border border-paper-deep/45 text-[11px] text-ink-faint hover:text-bamboo hover:bg-bamboo-mist/50 transition-colors cursor-pointer"
            >
              {t("settings.background.choose", { defaultValue: "选择" })}
            </button>
            {config.backgroundImagePath && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem("backgroundImageName");
                  setConfigValue("backgroundImagePath", "");
                }}
                className="h-8 px-3 rounded-lg border border-red-400/40 text-[11px] text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
              >
                {t("settings.background.clear", { defaultValue: "清除" })}
              </button>
            )}
          </div>
          <SlidingButtonGroup
            options={backgroundFits}
            value={config.backgroundFit ?? "cover"}
            onChange={(value: BackgroundFit) => setConfigValue("backgroundFit", value)}
          />
          <RangeRow
            label={t("settings.background.dim", { defaultValue: "遮罩" })}
            value={config.backgroundDim ?? 0.25}
            min={0}
            max={1}
            step={0.01}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => setConfigValue("backgroundDim", value)}
          />
          <RangeRow
            label={t("settings.background.scale", { defaultValue: "缩放" })}
            value={config.backgroundScale ?? 1}
            min={0.5}
            max={2}
            step={0.05}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => setConfigValue("backgroundScale", value)}
          />
          <RangeRow
            label={t("settings.background.positionX", { defaultValue: "横向" })}
            value={config.backgroundPositionX ?? 50}
            min={0}
            max={100}
            step={1}
            format={(value) => `${value}%`}
            onChange={(value) => setConfigValue("backgroundPositionX", value)}
          />
          <RangeRow
            label={t("settings.background.positionY", { defaultValue: "纵向" })}
            value={config.backgroundPositionY ?? 50}
            min={0}
            max={100}
            step={1}
            format={(value) => `${value}%`}
            onChange={(value) => setConfigValue("backgroundPositionY", value)}
          />
          <RangeRow
            label={t("settings.background.blur", { defaultValue: "模糊" })}
            value={config.backgroundBlur ?? 0}
            min={0}
            max={20}
            step={1}
            format={(value) => `${value}px`}
            onChange={(value) => setConfigValue("backgroundBlur", value)}
          />
        </section>

        <section className="space-y-2">
          <label className="block text-[11px] font-body text-ink-faint">
            {t("settings.defaultView.label", { defaultValue: "默认视图" })}
          </label>
          <SlidingButtonGroup
            options={viewModes}
            value={config.defaultViewMode}
            onChange={(v) => setConfigValue("defaultViewMode", v)}
          />
        </section>

        <WebdavSettings />

        <section className="pt-2 border-t border-paper-deep/25">
          <p className="text-[10px] leading-relaxed text-ink-ghost/75">
            <span>
              {t("settings.fontNotice", {
                defaultValue:
                  "Uses HarmonyOS Sans SC font. Copyright 2021 Huawei Device Co., Ltd. Licensed under HarmonyOS Sans Fonts License Agreement.",
              })}
            </span>{" "}
            <a
              href={HARMONY_FONT_LICENSE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-ink-faint"
            >
              HarmonyOS Sans Fonts License Agreement
            </a>
          </p>
        </section>
      </div>
    </aside>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** WebDAV（坚果云）同步设置 */
function WebdavSettings() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [remotePath, setRemotePath] = useState("/fastnote/fastnote.json");
  const [lastSync, setLastSync] = useState(0);
  const [autoSyncSecs, setAutoSyncSecs] = useState(300);
  const [busy, setBusy] = useState<"" | "test" | "sync">("");
  const [status, setStatus] = useState<string>("");

  const autoSyncOptions = useMemo<Array<{ value: string; label: string }>>(
    () => [
      { value: "0", label: t("settings.webdav.autoSyncOff", { defaultValue: "关闭" }) },
      { value: "300", label: t("settings.webdav.autoSync5m", { defaultValue: "5 分钟" }) },
      { value: "900", label: t("settings.webdav.autoSync15m", { defaultValue: "15 分钟" }) },
      { value: "1800", label: t("settings.webdav.autoSync30m", { defaultValue: "30 分钟" }) },
      { value: "3600", label: t("settings.webdav.autoSync60m", { defaultValue: "60 分钟" }) },
    ],
    [t],
  );

  const load = useCallback(async () => {
    try {
      const cfg = await webdavGetConfig();
      setEnabled(cfg.enabled);
      setUrl(cfg.url);
      setUser(cfg.user);
      setRemotePath(cfg.remotePath || "/fastnote/fastnote.json");
      setLastSync(cfg.lastSync);
      setAutoSyncSecs(cfg.autoSyncSecs ?? 300);
    } catch (error) {
      setStatus(String(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    const cfg: Parameters<typeof webdavSetConfig>[0] = { enabled };
    if (url) cfg.url = url;
    if (user) cfg.user = user;
    if (remotePath) cfg.remotePath = remotePath;
    cfg.autoSyncSecs = autoSyncSecs;
    // 仅当用户输入了密码才更新（留空表示保留已保存密码）
    if (pass) cfg.pass = pass;
    await webdavSetConfig(cfg);
    setPass("");
    await load();
  }, [enabled, url, user, remotePath, pass, autoSyncSecs, load]);

  const onToggle = async (value: boolean) => {
    setEnabled(value);
    const cfg: Parameters<typeof webdavSetConfig>[0] = { enabled: value };
    if (url) cfg.url = url;
    if (user) cfg.user = user;
    if (remotePath) cfg.remotePath = remotePath;
    cfg.autoSyncSecs = autoSyncSecs;
    if (pass) cfg.pass = pass;
    try {
      await webdavSetConfig(cfg);
      setPass("");
      void load();
    } catch (error) {
      setStatus(String(error));
    }
  };

  const onTest = async () => {
    setBusy("test");
    setStatus(t("settings.webdav.testing", { defaultValue: "连接测试中…" }));
    try {
      await save();
      const msg = await webdavTest({ url, user, pass, remotePath });
      setStatus(msg);
    } catch (error) {
      setStatus(
        t("settings.webdav.statusError", {
          defaultValue: "同步失败：{{msg}}",
          msg: String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  };

  const onSync = async () => {
    setBusy("sync");
    setStatus(t("settings.webdav.syncing", { defaultValue: "同步中…" }));
    try {
      await save();
      const msg = await webdavSyncNow({ url, user, pass, remotePath });
      setStatus(msg);
      void load();
    } catch (error) {
      setStatus(
        t("settings.webdav.statusError", {
          defaultValue: "同步失败：{{msg}}",
          msg: String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  };

  const onRestore = async () => {
    if (
      !window.confirm(
        t("settings.webdav.restoreConfirm", {
          defaultValue: "将从云端下载并覆盖本机所有笔记，此操作不可撤销，确定继续？",
        }),
      )
    ) {
      return;
    }
    setBusy("sync");
    setStatus(t("settings.webdav.syncing", { defaultValue: "同步中…" }));
    try {
      await save();
      const msg = await webdavRestore({ url, user, pass, remotePath });
      setStatus(msg);
      void load();
    } catch (error) {
      setStatus(
        t("settings.webdav.statusError", {
          defaultValue: "同步失败：{{msg}}",
          msg: String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  };

  const formatSyncTime = (ts: number): string => {
    if (!ts) return t("settings.webdav.never", { defaultValue: "从未同步" });
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const inputClass =
    "w-full h-8 px-2.5 rounded-lg bg-paper-warm/70 border border-paper-deep/40 text-[11px] font-mono text-ink-faint truncate";
  const actionBtnClass =
    "h-8 px-3 rounded-lg border border-paper-deep/45 text-[11px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <section className="space-y-2">
      <label className="block text-[11px] font-body text-ink-faint">
        {t("settings.webdav.label", { defaultValue: "WebDAV 同步（坚果云）" })}
      </label>

      <ToggleRow
        label={t("settings.webdav.enable", { defaultValue: "启用 WebDAV 同步" })}
        checked={enabled}
        onChange={(value) => void onToggle(value)}
      />

      <div className={`space-y-2 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
        <label className="block text-[10px] font-body text-ink-ghost">
          {t("settings.webdav.server", { defaultValue: "服务器地址" })}
        </label>
        <input
          type="text"
          className={inputClass}
          placeholder="https://dav.jianguoyun.com/dav/"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <label className="block text-[10px] font-body text-ink-ghost">
          {t("settings.webdav.user", { defaultValue: "账号" })}
        </label>
        <input
          type="text"
          className={inputClass}
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />

        <label className="block text-[10px] font-body text-ink-ghost">
          {t("settings.webdav.pass", { defaultValue: "应用密码" })}
        </label>
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />

        <label className="block text-[10px] font-body text-ink-ghost">
          {t("settings.webdav.remotePath", { defaultValue: "远端文件路径" })}
        </label>
        <input
          type="text"
          className={inputClass}
          value={remotePath}
          onChange={(e) => setRemotePath(e.target.value)}
        />

        <label className="block text-[10px] font-body text-ink-ghost">
          {t("settings.webdav.autoSync", { defaultValue: "定时同步" })}
        </label>
        <SlidingButtonGroup
          options={autoSyncOptions}
          value={String(autoSyncSecs)}
          onChange={(value) => {
            const secs = Number(value);
            setAutoSyncSecs(secs);
            void webdavSetConfig({ autoSyncSecs: secs }).catch((error) =>
              setStatus(String(error)),
            );
          }}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={busy !== "" || !url || !user}
            className={`${actionBtnClass} flex-1 text-ink-faint hover:text-bamboo hover:bg-bamboo-mist/50`}
          >
            {t("settings.webdav.test", { defaultValue: "测试连接" })}
          </button>
          <button
            type="button"
            onClick={() => void onSync()}
            disabled={busy !== "" || !enabled}
            className={`${actionBtnClass} flex-1 text-cloud bg-bamboo hover:bg-bamboo-light`}
          >
            {t("settings.webdav.syncNow", { defaultValue: "立即同步" })}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void onRestore()}
          disabled={busy !== "" || !enabled}
          className={`${actionBtnClass} w-full text-red-400 hover:bg-red-400/10`}
        >
          {t("settings.webdav.restore", { defaultValue: "从云端恢复" })}
        </button>

        <p className="text-[10px] leading-relaxed text-ink-ghost">
          {t("settings.webdav.lastSync", { defaultValue: "上次同步：" })}
          {formatSyncTime(lastSync)}
        </p>
        {status ? <p className="text-[10px] leading-relaxed text-ink-soft">{status}</p> : null}
      </div>
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25 cursor-pointer">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <div
        className={`relative w-8 h-[18px] rounded-full transition-colors duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          checked ? "bg-bamboo" : "bg-paper-deep/50"
        }`}
      >
        <div
          className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            checked ? "translate-x-[14px]" : "translate-x-0"
          }`}
        />
      </div>
    </label>
  );
}

interface RangeRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function RangeRow({ label, value, min, max, step, format, onChange }: RangeRowProps) {
  return (
    <div className="flex items-center gap-3 h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
      <span className="w-9 text-[11px] text-ink-faint">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 h-1 accent-bamboo cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-paper-deep/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bamboo [&::-webkit-slider-thumb]:-mt-[4.5px] [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
      />
      <span className="w-10 text-right text-[11px] font-mono text-ink-soft tabular-nums">
        {format(value)}
      </span>
    </div>
  );
}

interface ShortcutRecorderProps {
  value: string;
  onChange: (value: string) => void;
}

type ShortcutMsg = { key: string; params?: Record<string, string> } | { raw: string };

function ShortcutRecorder({ value, onChange }: ShortcutRecorderProps) {
  const { t } = useTranslation();
  const [checkState, setCheckState] = useState<"idle" | "checking" | "ok" | "warning" | "error">(
    "idle",
  );
  const [checkMsg, setCheckMsg] = useState<ShortcutMsg>({
    // 默认不显示任何描述文字
    raw: "",
  });
  const shortcutCheckRequestId = useRef(0);
  const isMounted = useRef(true);
  const platform = shortcutPlatform();

  const resolveMsg = (msg: ShortcutMsg): string =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "raw" in msg ? msg.raw : (t as any)(msg.key, msg.params);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      shortcutCheckRequestId.current += 1;
    };
  }, []);

  const isCurrentShortcutCheck = (requestId: number) =>
    isMounted.current && requestId === shortcutCheckRequestId.current;

  const invalidateShortcutChecks = () => {
    shortcutCheckRequestId.current += 1;
  };

  const markShortcutCleared = () => {
    invalidateShortcutChecks();
    setCheckState("idle");
    setCheckMsg({ key: "settings.shortcut.cleared" });
  };

  const runShortcutCheck = async (shortcut: string, saveWhenAvailable: boolean) => {
    // 未设置是合法状态，不需要调用后端做冲突检测。
    if (!shortcut) {
      markShortcutCleared();
      return;
    }

    const requestId = shortcutCheckRequestId.current + 1;
    shortcutCheckRequestId.current = requestId;
    setCheckState("checking");
    setCheckMsg({ key: "settings.shortcut.checking" });
    try {
      const result = await checkGlobalShortcut(shortcut);
      if (!isCurrentShortcutCheck(requestId)) return;
      const conflictMsg: ShortcutMsg = {
        key: `settings.shortcut.conflict.${result.conflictType}`,
        params: { shortcut },
      };
      if (result.available) {
        setCheckState("ok");
        setCheckMsg(conflictMsg);
        if (saveWhenAvailable) {
          onChange(shortcut);
        }
      } else {
        setCheckState("warning");
        setCheckMsg(conflictMsg);
      }
    } catch (error) {
      if (!isCurrentShortcutCheck(requestId)) return;
      setCheckState("error");
      setCheckMsg(
        error instanceof Error ? { raw: error.message } : { key: "settings.shortcut.checkFailed" },
      );
    }
  };

  const recorder = useShortcutRecorder({
    onRecord: (shortcut) => {
      if (shortcut === "") {
        onChange("");
        markShortcutCleared();
      } else if (isValidGlobalShortcut(shortcut)) {
        const configString = hotkeyToConfigString(shortcut, platform);
        void runShortcutCheck(configString, true);
      } else {
        invalidateShortcutChecks();
        setCheckState("warning");
        setCheckMsg({ key: "settings.shortcut.needsModifier" });
      }
    },
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const clearShortcut = () => {
    // 显式清除会保存为空值，后端据此注销旧的全局快捷键绑定。
    recorder.cancelRecording();
    onChange("");
    markShortcutCleared();
  };

  useEffect(() => {
    if (!recorder.isRecording) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        recorder.cancelRecording();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [recorder.isRecording, recorder.cancelRecording]);

  const liveDisplay =
    recorder.isRecording && recorder.heldKeys.length > 0
      ? formatHeldKeys(recorder.heldKeys, platform)
      : null;
  const statusClass =
    checkState === "ok"
      ? "text-bamboo"
      : checkState === "warning" || checkState === "error"
        ? "text-red-400"
        : "text-ink-ghost";
  const isChecking = checkState === "checking";

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => recorder.startRecording()}
          className={`min-w-0 flex-1 h-8 px-2.5 rounded-lg border text-[12px] flex items-center gap-2 cursor-pointer transition-colors ${
            recorder.isRecording
              ? "bg-bamboo-mist/40 border-bamboo"
              : "bg-paper-warm/70 border-paper-deep/40 hover:border-paper-deep/60"
          }`}
        >
          {recorder.isRecording ? (
            <>
              <span className="flex-1 min-w-0 text-left text-bamboo truncate">
                {liveDisplay ||
                  t("settings.shortcut.pressHint", {
                    defaultValue: "按下快捷键；按 Delete 清空。",
                  })}
              </span>
              <span className="text-[10px] text-ink-faint shrink-0">
                {t("settings.shortcut.cancelHint", { defaultValue: "Esc 取消" })}
              </span>
            </>
          ) : (
            <>
              <span
                className={`flex-1 min-w-0 text-left truncate ${
                  value ? "text-ink-soft" : "text-ink-ghost"
                }`}
              >
                {value || t("settings.shortcut.notSet", { defaultValue: "未设置" })}
              </span>
              <span className="text-[10px] text-ink-ghost shrink-0">
                {t("settings.shortcut.clickToRecord", { defaultValue: "点击录制" })}
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          disabled={!value || recorder.isRecording}
          onClick={clearShortcut}
          aria-label={t("settings.shortcut.clear", { defaultValue: "清除" })}
          title={t("settings.shortcut.clear", { defaultValue: "清除" })}
          className="w-8 h-8 rounded-lg border border-paper-deep/45 text-[15px] leading-none text-ink-faint hover:text-red-400 hover:bg-paper-warm/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          ×
        </button>
        <button
          type="button"
          disabled={!value || isChecking || recorder.isRecording}
          onClick={() => void runShortcutCheck(value, false)}
          className="h-8 px-3 rounded-lg border border-paper-deep/45 text-[11px] text-ink-faint hover:text-bamboo hover:bg-bamboo-mist/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {isChecking
            ? t("settings.shortcut.checkingShort", { defaultValue: "检测中" })
            : t("settings.shortcut.check", { defaultValue: "检测" })}
        </button>
      </div>
      <p className={`min-h-4 text-[11px] ${statusClass}`}>{resolveMsg(checkMsg)}</p>
    </div>
  );
}
