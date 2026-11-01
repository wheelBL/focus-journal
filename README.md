# 专注记 · Focus Journal

Windows 11 与 macOS 上的本地工作日志，把 **估计 → 实践 → 复盘 → 调整** 串成每天的工作流程。

任务树负责理清事情，番茄计时帮助开始，日历记录真实投入，今日与回顾回答“今天推进了什么”。界面为中文，采用 TypeScript + React + Electron + SQLite。

界面采用 Things 风格的紧凑列表与右侧详情，支持跟随系统、浅色和深色。侧栏底部可以快速切换外观，在“设置 → 外观与动效”调整过渡效果；计时、提醒和快速记录窗口保持一致。外观偏好仅保存在本机，不改变工作记录。

事项页的“视图选项”集中提供保存视图、显示已完成、展开与折叠；右侧详情中的“更多安排”提供尚未设置的提醒、重复和定期审视，设置后直接显示。设置按分类打开，分类之间切换保留当前未保存的输入。

## 下载与运行

最近公开发布版本为 **0.30.0**，源码和下载包见 [Releases](https://github.com/wheelBL/focus-journal/releases/tag/v0.30.0)。

| 设备 | 下载 |
| --- | --- |
| Windows 11 x64 | [ZIP](https://github.com/wheelBL/focus-journal/releases/download/v0.30.0/FocusJournal-0.30.0-Windows-x64.zip) |
| Mac，M 系列芯片 | [DMG](https://github.com/wheelBL/focus-journal/releases/download/v0.30.0/FocusJournal-0.30.0-macOS-arm64.dmg) · [ZIP](https://github.com/wheelBL/focus-journal/releases/download/v0.30.0/FocusJournal-0.30.0-macOS-arm64.zip) |
| Mac，Intel 芯片 | [DMG](https://github.com/wheelBL/focus-journal/releases/download/v0.30.0/FocusJournal-0.30.0-macOS-x64.dmg) · [ZIP](https://github.com/wheelBL/focus-journal/releases/download/v0.30.0/FocusJournal-0.30.0-macOS-x64.zip) |

Windows 解压整个文件夹，双击 **专注记.exe**；Mac 安装说明见下文。无需安装 Node.js。

- 系统：Windows 11 x64；macOS 14 或更新系统，提供 Apple Silicon 与 Intel 两种包。macOS 原生启动测试使用 macOS 15。
- 更新：先在旧版托盘中选择“退出专注记”，再运行新版。数据保存在用户数据目录中，升级数据结构前自动备份。
- Windows 0.30.1 起使用固定的 `%USERPROFILE%\.focus-journal`，不随启动入口改变。首次升级保留原目录并校验迁移；发现不同的旧工作区时明确选择。详见[统一工作区规则](desktop/docs/workspace-location.md)。
- 关闭主窗口后继续在托盘运行；完全退出请使用托盘菜单或设置中的“保存并退出”。
- 发布包目前未做 Windows 代码签名。校验值随 Releases 中的 `SHA256SUMS.txt` 提供。
- 不要只移动 EXE，必须保留同目录的运行库、`resources` 和许可证文件。

## 主要能力

- **统一事项树**：任意嵌套，项目为可选标记；行内编辑、拖拽调整层级、自动排序、标签、筛选与保存视图。
- **子弹笔记式快速记录**：普通事项、`- ` 笔记、`o ` 事件；支持日期、标签、估计和已有项目路径的语义识别。全局快速记录：Windows 为 `Ctrl+Alt+Space`，macOS 为 `⌘⇧Space`；均可在设置修改。
- **从计时开始**：直接计时，或先开始再补充事项；暂停、恢复、手动补记和校正均保留真实时间。不需要的投入可放弃并从今日或日历恢复，稍后补充也会保存已填写的进展。支持多个事项独立计时。
- **补入开始时间**：已做一段时间才想起计时，可先开始，再选择“调整开始时间”；支持 40 分钟前等快捷选择或准确日期时间。过去投入计入累计，从现在再专注一个目标时长才提醒，暂停不消耗目标。
- **完整专注与休息**：默认 25 分钟专注、5 分钟休息；到点发声并显示持续置顶卡片，计时继续，直到主动结束。休息结束后自行确认继续。
- **屏边计时签**：主窗口最小化或收至托盘时仍可看到时间；点击展开操作，可拖动、隐藏、切换计时器。
- **执行首页与日历**：今日重点、继续计时、今日进展和时间线；日/周/月回顾，拖选添加提醒、事件或投入。同一事项保持同色，真实重叠独立排布。
- **重复与复盘**：日/周/月/年重复，固定日历或完成后间隔；事项审视、估计历史、期间成果和投入汇总。
- **交接与完成归属**：交接即关闭本人责任、独立跟进提醒、重新接手后恢复待办；保留本人历史投入，分别统计本人、他人、共同完成与未注明，旧记录不补造归属。
- **活动与 AI 使用记录**：回顾中查看业务变化、本机轻量操作及 AI 请求、分析、应用结果；操作摘要只记操作、入口、结果和版本，可暂停、清空与导出。
- **本地数据与扩展**：SQLite 持久化、备份/恢复、回收站、可选 GitCode 快照同步，以及默认关闭的本机 AI 控制 API。
- **应用内 AI 助手**：填写兼容 OpenAI 的服务地址、模型和自己的 API Key，可使用 DeepSeek 等服务；选择事项、今日或近 7 天的范围，整理、拆解与复盘，逐条预览确认后写入。密钥仅在本机加密保存，不进入日志备份或同步。

屏边计时签（截图使用示例数据）：

![收起的屏边计时签](docs/images/timer-compact.png)

![展开操作](docs/images/timer-expanded.png)

## macOS

分别下载对应芯片的 ZIP 或 DMG：M 系列使用 arm64，Intel 使用 x64。解压 ZIP 或打开 DMG，将“专注记.app”放入“应用程序”后打开。首次运行使用独立的本机数据目录；可从 Windows 导出 JSON 备份，再在 Mac 恢复，保留事项身份和投入。密钥由各自系统加密，需在 Mac 重新配置。

macOS 使用原生菜单、窗口红黄绿按钮、菜单栏图标和 Dock 恢复窗口。主要快捷键使用 Command：`⌘K` 搜索、`⌘N` 新增、`⌘Enter` 控制计时；树中 `⌘⇧N` 新增同级、`⌘⌥N` 新增子项。完整列表见应用快捷键帮助。

当前包为 ad-hoc 签名，尚未通过 Apple 公证。系统可能要求在“系统设置 → 隐私与安全性”中确认打开；企业策略可能禁止此类应用。未使用 Apple Developer 证书或读取用户签名凭据，不声称已完成公证。

本机构建：在 `desktop` 执行 `npm ci`、`npm run package:mac`。原生包与重启验证通过 `node scripts/package-macos.mjs --qa`、`node scripts/run-macos-smoke.mjs` 和 `node scripts/check-macos-package.mjs` 执行，测试使用隔离数据并自行退出。

## 第一次使用

1. 在事项页右键创建事项，或直接用快速记录输入名称。估计可以暂时不填。
2. 添加过程中按 `Tab` 缩进，`Shift+Tab` 提升一级，`Enter` 保存并继续，`Ctrl+Enter` 保存结束（Mac 为 `⌘Enter`）。
3. 将今天要推进的事情加入“今日重点”，从今日或事项行开始计时；也可以先计时，结束后再命名。
4. 到时自行选择继续、稍后提醒或结束并休息。结束本次计时不会自动完成事项。
5. 在日历补记遗漏投入，在回顾中比较估计与实际，记录下次如何调整。

**日期语义**：“计划开始”是打算开始的日期，不会覆盖真实开始时间。“10 月 23 日前”不包含当天，表示在 10 月 23 日 00:00 前完成；也支持精确到分钟的截止时间。

## 本地开发

需要 **Node.js 24.x、npm、Git**。Windows 打包需要 Windows x64；macOS 打包需在 Mac 上运行，或使用仓库的 macOS 工作流。Electron 版本固定在锁文件中，安装依赖时需要网络下载运行时。

```powershell
cd desktop
npm ci
node node_modules/electron/install.js
npm run build
npm run desktop
```

隔离示例数据启动（不使用个人数据；关闭窗口会退出）：

```powershell
cd desktop
npm run build
npx electron . --demo --data-dir ./qa-data/development
```

浏览器预览需要两个终端，在 `desktop` 下分别执行 `npm run preview:api` 和 `npm run dev`。预览只使用 `qa-data` 中的示例数据；原生托盘、全局快捷键和窗口提醒需在 Electron 中验证。

## 测试与打包

在 `desktop` 下执行：

```powershell
npm test
npm run test:ui
npm run test:api
npm run test:sync
npm run build
npm run test:sites
node scripts/package-windows.mjs --versioned
```

输出为 `desktop/release/win-<package.json 中的版本号>/专注记.exe`。本地 API 与同步测试使用回环 HTTP 服务，需要环境允许监听 `127.0.0.1`；同步测试还需要 Git。第三方组件许可证会在打包时生成并复制到产物中。

自动测试覆盖业务规则、组件交互、本机 API、同步与预览 Worker。原生窗口检查脚本位于 `desktop/scripts/check-*.ts`，使用隔离配置，结束时必须正常退出测试实例。`check-local-api.ts` 另需 Python 3，可通过 `PYTHON` 环境变量指定路径。

## 代码与文档

| 路径 | 职责 |
| --- | --- |
| `desktop/core/` | 领域模型、统一命令、计时与 SQLite |
| `desktop/electron/` | 主进程、受限 IPC、托盘、提醒、本机 API 和同步 |
| `desktop/src/` | React 页面、任务树、日历、计时签与样式 |
| `desktop/tests/` | 业务及组件自动测试 |
| `desktop/scripts/` | 构建、Windows 打包、隔离验证 |
| `desktop/tools/journal-api.py` | 本机 AI API 命令行客户端 |

- [架构说明](docs/architecture.md)
- [本机 AI 与同步 API](desktop/docs/local-api.md)
- [快速记录语法](desktop/docs/semantic-capture.md)
- [事项规则](desktop/docs/scenario-rules.md) · [事项审视](desktop/docs/item-review-rules.md)
- [0.21.0 发布说明](docs/releases/0.21.0.md)

## 数据与发布范围

个人数据库、备份、设备密钥、测试输出和内部设计截图不进入本仓库。截图仅使用示例数据。

应用可离线使用。GitCode 同步需自行配置仓库和令牌，使用整份日志快照；发生分歧时由用户选择，不自动覆盖。令牌由 Windows 加密保存在设备配置中，不进入日志导出。本机 API 仅监听回环地址，默认关闭、默认只读，启用后须使用独立密钥。

目前尚未为本项目源码选择开源许可证。依赖组件各自的许可证与署名见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)；Electron / Chromium 的说明随 Windows 包附带。
