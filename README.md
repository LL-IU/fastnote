# fastnote

**快速启动、后台静默的 Windows 桌面便签软件**

版本:**0.1.0** · 许可:**MIT**

fastnote 是一款轻量、随呼随用的桌面便签工具,基于开源项目 [floral-notepaper](https://github.com/Achilng/floral-notepaper)(Tauri 2 + React 19 + Rust)深度改造而来:保留了其秒开的小窗窗口池与优雅的编辑体验,移除了更新器、商店/镜像分发等与本项目无关的部分,并针对"快速、静默、桌面固定"的定位做了定制。

## 功能

- **后台静默自启** — 开机自启、常驻系统托盘,关闭到托盘不打扰
- **多种方式唤起** — 全局快捷键(默认 `Ctrl+Space`,可自定义/录制)随时呼出**快捷小窗**;托盘或主界面管理笔记列表
- **打开速度优先** — 小窗窗口池预热 + 低内存档位,唤起即开;后台内存占用尽量小
- **Markdown 编辑与预览** — GFM 语法、LaTeX 数学公式、实时切换编辑/预览
- **桌面磁贴** — 便签可转为磁贴固定桌面、恒置顶,随时查阅复制;桌面可堆放多份
- **小窗置顶 / 置底** — 小窗右上角按钮一键置顶(↑)或置底(↓);默认置顶行为可在设置中开关
- **外观可调** — 背景图、便签纸颜色、透明度主题、字体大小
- **导入导出** — 便签即 `.md` 文件,支持导入/导出,可直接用任意编辑器打开

## 使用

### 便携版(免安装)

直接运行 `fastnote.exe` 即可,无需安装。

- **数据位置**:便签以纯 `.md` 文件存放在 `文档\fastnote`;旧版(花笺)数据在首次启动时可自动迁移
- **重定向数据目录**:设置环境变量 `FASTNOTE_DATA_DIR` 指向任意目录即可(兼容旧变量名 `FLORAL_NOTEPAPER_DATA_DIR`)
- **WebView2**:Windows 10/11 自带,无需额外安装

### 从源码构建

```bash
npm install
npm run tauri build --no-bundle     # 产出 src-tauri/target/release/fastnote.exe
```

开发模式:`npm run tauri dev`。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite 8 · TypeScript · Tailwind CSS 4 |
| 桌面壳 | Tauri 2(Rust 2021) |
| 存储 | 纯本地 `.md` 文件 + JSON 索引,零数据库依赖 |

## 与上游 floral-notepaper 的差异

- 移除:应用内更新/自动更新、Mirror酱 CDK、Microsoft Store/MSIX 分发、跨平台(macOS/Linux)打包、贡献者展示、原项目品牌与文档
- 调整:小窗默认不再置顶(新增"小窗默认置顶"设置);新增小窗**置顶/置底**按钮;打包目标收敛为 Windows 便携 exe
- 更名:应用名 `fastnote`,版本 `0.1.0`

## 许可证

[MIT](LICENSE)
