import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTips, parseTip } from "../locales/tips";

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  const { t, i18n } = useTranslation();
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  const tipSegments = useMemo(() => {
    const tips = getTips(i18n.language);
    const raw = tips[Math.floor(Math.random() * tips.length)] ?? "";
    return parseTip(raw);
  }, [i18n.language]);

  const tipContainerRef = useRef<HTMLDivElement>(null);
  const tipInnerRef = useRef<HTMLSpanElement>(null);
  const [tipScrollable, setTipScrollable] = useState(false);
  const [tipScrollOffset, setTipScrollOffset] = useState("0px");

  const checkTipOverflow = useCallback(() => {
    const container = tipContainerRef.current;
    const inner = tipInnerRef.current;
    if (!container || !inner) return;
    const overflow = inner.scrollWidth - container.clientWidth;
    if (overflow > 0) {
      setTipScrollable(true);
      setTipScrollOffset(`-${overflow}px`);
    } else {
      setTipScrollable(false);
    }
  }, []);

  useEffect(() => {
    requestAnimationFrame(checkTipOverflow);
  }, [tipSegments, checkTipOverflow]);

  return (
    <aside className="w-[360px] h-full shrink-0 border-l border-paper-deep/30 bg-cloud/92 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between h-11 px-4 border-b border-paper-deep/25">
        <h2 className="text-[13px] font-display font-medium text-ink-soft">
          {t("about.title", { defaultValue: "关于" })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors cursor-pointer"
          title={t("about.closeTitle", { defaultValue: "关闭关于" })}
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
        <section className="space-y-1.5">
          <h3 className="text-[20px] font-serif font-medium text-ink-soft">
            {t("about.productName", { defaultValue: "fastnote" })}
          </h3>
          <p className="text-[11px] text-ink-ghost font-body">
            {t("about.summary", { defaultValue: "快速启动、后台静默的桌面便签工具" })}
          </p>
          <p className="text-[11px] text-ink-ghost font-body">
            Copyright © 2026 fastnote,
            <br />
            Licensed under the MIT License. <br />
          </p>
          {version && (
            <p className="text-[11px] text-ink-ghost font-mono">
              {t("about.version", { defaultValue: "版本：v{{version}}", version })}
            </p>
          )}
        </section>
      </div>

      <div className="flex items-center px-4 h-7 border-t border-paper-deep/20 bg-paper/30 shrink-0 overflow-hidden">
        <span className="text-[10px] text-ink-ghost font-body shrink-0 mr-1">
          {t("about.tipPrefix", { defaultValue: "您知道吗：" })}
        </span>
        <div ref={tipContainerRef} className="flex-1 overflow-hidden min-w-0 flex items-center">
          <span
            ref={tipInnerRef}
            className={`text-[10px] text-ink-ghost font-body whitespace-nowrap inline-block ${tipScrollable ? "animate-tip-marquee" : ""}`}
            style={
              tipScrollable ? { ["--tip-scroll-offset" as string]: tipScrollOffset } : undefined
            }
          >
            {tipSegments.map((seg, i) =>
              seg.type === "link" ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => void openUrl(seg.url!)}
                  className="inline-flex items-center gap-0.5 text-ink-faint hover:text-bamboo cursor-pointer transition-colors"
                >
                  {seg.text}
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 3h7v7M13 3L3 13" />
                  </svg>
                </button>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </span>
        </div>
      </div>
    </aside>
  );
}
