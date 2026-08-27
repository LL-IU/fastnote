# fastnote 现状分析

> 分析时间：2026-08 · 对象：`速记软件/fastnote`（v0.1.0，MIT）
> 来源：[floral-notepaper（花笺）](https://github.com/Achilng/floral-notepaper) v1.1.0 深度定制版

---

## 〇、结论摘要

fastnote 已经完成了一轮扎实的「改造」：改名、去掉更新器 / 商店 / 镜像分发 / 跨平台打包、收敛为 Windows 便携版，并新增了小窗置顶/置底按钮、小窗默认置顶开关等定制。代码质量高（前后端测试齐全、lint/format 门禁、i18n 完整），核心亮点（**窗口池预热秒开 + 自研键盘钩子快捷键**）保留完好。

对照原「速记软件 readme」需求，**大体贴合但有 3 个已知缺口**（待办功能页与多快捷键映射、点击穿透、透明度调节），另有几处**品牌残留与维护性问题**（见第五节）建议清理。

---

## 一、项目概况

| 项 | 值 |
|---|---|
| 目录 | `速记软件/fastnote` |
| 版本 | 0.1.0（上游 v1.1.0 裁剪） |
| 技术栈 | Tauri 2 + React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + i18next |
| 存储 | 纯本地 `.md` 文件 + JSON 索引，零数据库 |
| 代码规模 | 前端 ts/tsx + Rust 合计约 1.4 万行 |
| 测试 | 前端 vitest 20 个测试文件；Rust 内嵌测试 desktop.rs 14 个 + notes.rs 19 个 + locales.rs 2 个 |
| 工程门禁 | husky + lint-staged + oxlint + oxfmt（`npm run lint` / `npm run fmt` / `npm test`） |
| 构建状态 | ⚠️ 本机尚无 node_modules / dist / src-tauri/target，**未实际构建验证** |
| 版本控制 | ⚠️ **不是 git 仓库**（无 `.git` 目录），无法回滚/对比上游 |

---

## 二、架构

### 1. 单一前端，URL 路由驱动三种窗口

`src/features/windows/windowRoutes.ts`：`index.html?view=...` 区分窗口用途

| view | 窗口 | 尺寸 | 用途 |
|---|---|---|---|
| `main` | 主窗口 | 1180×760 | 笔记列表 + 编辑 + 设置/关于 |
| `notepad` | 快捷小窗 | 260×260 | 快速便签（窗口池，秒开） |
| `tile` | 磁贴窗 | 260×260 | 固定桌面、恒置顶 |

### 2. 前端结构

- `components/`：`MainWindow.tsx`（120KB，最大单文件）、`NotePad.tsx`（34KB）、`SettingsPanel.tsx`（31KB）、`ContextMenu/Toast/BackgroundLayer/Tile` 等
- `features/` 按领域拆：`notes`（笔记 CRUD/分类/工具）、`settings`（配置/主题/快捷键录制）、`windows`（窗口路由/磁贴/置底/表面模式）、`markdown`（预览/滚动同步/图片路径）、`images`（粘贴/二进制直传）、`importExport`（.md 导入导出）
- `locales/`：zh-CN / zh-HK / en-US 三语，i18next，Rust 侧菜单文案也走 `locales.rs`

### 3. Rust 后端（src-tauri/src，4 个模块）

| 文件 | 行数 | 职责 |
|---|---|---|
| `lib.rs` | 517 | IPC 命令层（~35 个命令）+ 单实例 + CLI(version/help) + 数据目录 scope |
| `desktop.rs` | 2856 | 窗口池/预热/回收、托盘与菜单、全局快捷键、键盘钩子、磁贴/置底、窗口事件 |
| `services/notes.rs` | 2464 | NoteStore：纯文件存储、迁移、图片管理、导入导出、分类、原子 JSON 写 |
| `locales.rs` | 307 | 三语菜单/窗口标题/托盘文案 |
| `json_io.rs` | 1.2KB | `write_json_atomic` 原子写 |

### 4. 数据布局（纯文件，零数据库）

```
数据目录（FASTNOTE_DATA_DIR 可重定向，兼容旧变量 FLORAL_NOTEPAPER_DATA_DIR）
├── config.json        # 配置（原子写入）
├── metadata.json      # 笔记元数据（id/标题/分类/时间/字数/预览）
├── notes/             # 笔记本体 = 纯 .md 文件，按分类分目录
├── images/            # 笔记内嵌图片
└── backgrounds/       # 便签纸背景图
```

---

## 三、亮点实现

1. **窗口池预热（秒开核心）**：`schedule_notepad_prewarm` 后台预建小窗 → `activate_pooled_notepad` 唤起即用 → `recycle_notepad_window` 回收复用；不活跃窗口 `set_webview_memory_usage_level(low)` 降内存；小窗默认在**鼠标位置**弹出（`cursor_centered_bounds`）。
2. **快捷键录制 = tauri 插件 + 自研 WH_KEYBOARD_LL 钩子**：录制期间临时注销全局快捷键，用低级键盘钩子捕获按键；含 **IME 热键保护/恢复**（ImmGetHotKey/ImmSetHotKey）、系统快捷键冲突检测、重复校验。
3. **磁贴模式**：恒置顶固定桌面，双击进入编辑，Ctrl+关闭保护，Markdown 渲染可开关。
4. **小窗置顶/置底按钮**（fastnote 定制）：右上角一键 ↑ 置顶 / ↓ 置底，默认置顶行为可在设置开关。
5. **外部文件关联**：`.md`/`.txt` 文件关联 + 单实例 + 启动参数取文件（`take_startup_file` / `open-external-file` 事件），双击外部文件直接进编辑。
6. **拖拽偏移补偿**：`start_window_drag_with_offset` 先位移再 `start_dragging`，配合 JS deadzone 消除拖拽滞后。
7. **图片 raw 二进制直传**：`images_save` 用 headers 传 noteId/扩展名、body 直传字节，避开 JSON 序列化开销；配套 `clean_unused_images` 清理。
8. **数据迁移**：旧版布局迁移、损坏 metadata 自动重建备份、`migrate_data_to` 目录搬迁，测试覆盖充分。
9. **构建前杀进程**：`beforeBuildCommand` 里 `taskkill /F /IM fastnote.exe` 防文件锁（hack，见风险节）。

---

## 四、与「速记软件」原 readme 需求对照

| # | readme 需求 | fastnote 现状 | 评级 |
|---|---|---|---|
| 1 | 可自启动，后台静默 | 托盘常驻 + autostart 开关 + close_to_tray | ✅ |
| 2 | 多种快捷键启动不同功能（笔记/待办…），一次只开一页 | 2 个全局快捷键（呼出小窗 / 显隐主窗），**可录制自定义**；无「待办」动作 | ⚠️ |
| 3 | 强调打开速度 | 窗口池预热/回收/低内存档，小窗秒开 | ✅（核心亮点） |
| 4 | 完成后可调外观 | 背景图、便签纸颜色、主题、字体大小；**透明度滑杆缺失** | ⚠️ |
| 5 | 固定桌面，不影响鼠标 | 磁贴恒置顶；**无点击穿透**（set_ignore_cursor_events 未启用） | ⚠️ |
| 6 | 桌面堆放多份便签/待办页 | 小窗多开 + 磁贴多份；待办 = Markdown 复选框 | ✅（便签）/ ⚠️（待办） |
| 7 | 快速打开 | 主窗启动即显 + 全局快捷键唤起 | ✅ |

**额外已具备**：Markdown（GFM/KaTeX/告警块）、外部 .md/.txt 编辑、图片粘贴清理、导入导出、分类管理、i18n、CLI。

---

## 五、本次分析新发现的问题（建议处理）

1. **「floral」品牌残留（用户可见，2 处）**
   - `src-tauri/src/lib.rs` `config_migrate_data_dir`：重定向数据目录时硬编码 `new_path.join("floral")` → 用户数据会落在 `<自定义目录>\floral` 子目录，出现花笺旧名。
   - `src/components/MainWindow.tsx` L1116 迁移确认文案：「数据将存放在…下的 **floral** 子文件夹中」。
   - 建议：改为 `fastnote` 子目录或无子目录；环境变量 `FLORAL_NOTEPAPER_*` 兼容可保留（向后兼容合理）。
2. **capabilities 残留**：`opener:allow-open-url` 仅放行 `ms-windows-store://*`，但前端已无任何商店相关代码 → 死权限，可删。
3. **中文名缺失**：`locales.rs app_name` 三种语言都返回小写 `"fastnote"`，中文界面也没有中文产品名（原定位是「速记软件」，可考虑给个中文名如「速记」）。
4. **巨型单文件**：`MainWindow.tsx` 120KB（约 2700 行）、`NotePad.tsx` 34KB、`desktop.rs` 2856 行、`notes.rs` 2464 行——当前可维护，但后续加「待办页」等功能前建议先拆分。
5. **构建期杀进程 hack**：`beforeBuildCommand` 的 `taskkill /F /IM fastnote.exe` 会在构建时强杀正在运行的程序（可能丢未保存内容）；`beforeDevCommand` 无此问题。
6. **未构建验证**：本机无 node_modules/dist/target，README 的构建命令未经实测（依赖 npm 源可用性）。
7. **无 git 仓库**：建议 `git init` 并先提交一份「上游基线」tag，便于后续与 floral-notepaper 对比、回滚。

---

## 六、若继续按 readme 扩展（优先级建议）

1. **待办功能页**（最大缺口）：仿 `view=notepad` 增加 `view=todo` 路由 + `ShortcutBindings` 增加 `open-todo` 动作；待办数据可先用独立 `todos/` 目录存 `.md`/JSON，或复用笔记模型。
2. **点击穿透**：磁贴模式加 `set_ignore_cursor_events`，capabilities 补 `core:window:allow-set-ignore-cursor-events`。
3. **透明度调节**：设置面板加透明度滑杆，窗口 `set_opacity`（tauri.conf 已 `transparent: true`，基础具备）。
4. **多快捷键 → 多功能映射**：把快捷键从「2 个动作」扩成「动作表」，一次只开一页（readme 核心差异化点）。
5. **清理**：floral 残留、ms-windows-store 权限、中文名。

---

## 七、与「取消的 LiteNote 改造」对比（供决策参考）

| 维度 | LiteNote 简化版（已取消） | fastnote（现有） |
|---|---|---|
| 打开速度 | 单窗口，无预热 | **窗口池预热秒开**（更优） |
| 功能 | 仅待办列表 | 笔记 + Markdown + 磁贴 + 小窗（更全） |
| 待办 | 原生待办（截止/置顶/排序） | 无，需新增 |
| 多快捷键 | 3 个固定动作 | 2 个动作 + 可录制（机制更好） |
| 存储 | SQLite | 纯 .md 文件（可读性/迁移更优） |
| 工程质量 | 无测试 | 55+ 测试、lint 门禁（更优） |

→ 结论：**在 fastnote 上加「待办功能页」比在 LiteNote 上加「笔记/小窗/磁贴」划算得多**，fastnote 应作为继续开发的基础。
