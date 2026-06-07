# 🧰 股票工具箱 · StockToolbox `v2.1.1`

> **官网地址：https://aglarevv.github.io/Stock-Tools**

跨平台股票交易辅助桌面应用。集**交易计划**、**合约计算**、**每日复盘**、**AI 复盘助手**、**技术指标**、**每日时事 3-SOP 分析**于一体，支持 macOS / Windows。

前端 React 18 + Vite 5 · 桌面端 Electron 31 / Swift WKWebView · 后端 Node.js + MySQL/SQLite 双数据库

---

## 功能模块

| 模块 | 功能 |
|------|------|
| 📊 **看板** | 盈亏汇总、胜率统计、最近复盘摘要、交易计划总览 |
| 📈 **交易计划** | 止盈止损计算、做多/做空、仓位占比、策略预设、价格区间图 |
| 📋 **复盘记录** | 全部复盘列表、按日期/股票筛选、分页、删除 |
| 📝 **每日复盘** | 五步法复盘框架、草稿自动保存、AI 对话分析 |
| 🤖 **AI 复盘助手** | 基于复盘数据多轮对话，支持 OpenAI / DeepSeek，思考模式 |
| 📐 **合约计算** | 合约止盈止损 + 收益率反推价格 |
| 📊 **技术指标** | 14 种 K 线形态识别、量能柱分析、多空方向筛选 |
| 📰 **每日时事** | 3-SOP 日报 + AI 摘要 + RSS 去重 + 文章优先级评分 + 周报/月报精选 |
| ⚙️ **设置** | 数据库配置、AI 接口、OPML 源管理、API Key 加密存储 |
| 📄 **文件解析** | 拖拽上传 PDF / DOCX / TXT / MD 文件，AI 辅助分析 |

### v2.1.1 更新日志

| 类别 | 说明 |
|------|------|
| 🐛 **Bug 修复** | 删除复盘/交易记录后输入框无法点击（原生 confirm 替换为 React 弹窗） |
| 🐛 **Bug 修复** | 删除某条记录时误删其他记录（确认框增加股票名称提示） |
| 🎨 **样式优化** | ConfirmDialog 组件样式与 Toast 通知统一（--warning 色系、紧凑布局） |
| 🎨 **样式优化** | ConfirmDialog 复用现有 `.modal` 设计系统，移除重复内联样式 |

### v2.1.0 新增特性

| 特性 | 说明 |
|------|------|
| 🎨 **组件化系统** | `Icon` / `Button` 组件统一管理全项目图标和按钮风格 |
| 🔄 **RSS 去重** | 记录已使用的 RSS 文章链接，次日无新文章时不重复生成日报 |
| ⭐ **文章优先级评分** | 关键词 + 时间 + 情感综合评分，重要新闻优先进入日报 |
| 📅 **周报/月报精选** | AI 基于历史日报文章生成周期精选摘要，独立存储可查阅 |
| 🔒 **代码混淆** | 构建时自动混淆前端、服务端、Electron 代码，提高逆向门槛 |
| 🪟 **Windows 字体优化** | DirectWrite + 字体平滑平台自适应，解决字体模糊问题 |

---

## 技术栈

```
前端框架    React 18 + Vite 5 + JSX
样式系统    CSS 变量驱动（浅色/深色主题）
macOS 桌面   Swift + WKWebView（原生性能）
Windows 桌面 Electron 31 + NSIS 安装器
后端服务    Node.js HTTP Server（端口 8765）
数据库      MySQL 8.0+（优先） / SQLite（sql.js WASM 回退）
构建打包    esbuild 单文件 bundle（~674KB，内联 20+ 子依赖）
图表渲染    纯 CSS + SVG
字体        Inter + JetBrains Mono（自托管 WOFF2，离线可用）
安全存储    AES-256-GCM API Key 加密
CI/CD       GitHub Actions（CI 检查 + 自动构建 + GitHub Pages 官网）
```

---

## 项目结构

```
tools/
├── .github/workflows/
│   ├── ci.yml                  # CI：多 Node 版本构建检查
│   ├── release.yml             # Release：macOS/Windows 自动构建 + GitHub Release
│   └── deploy-website.yml      # 官网部署到 GitHub Pages
│
├── react-app/                   # React 前端应用
│   ├── index.html               # Vite 入口 HTML
│   ├── vite.config.js           # Vite 配置（dev 代理 /api → 8765）
│   ├── package.json             # 前端依赖 + Electron-builder 配置
│   ├── public/icon.png          # 应用图标
│   ├── electron/
│   │   ├── main.cjs             # Electron 主进程（窗口管理 + 后端拉起 + 健康轮询）
│   │   └── preload.cjs          # IPC 桥接（窗口控制）
│   ├── macos/
│   │   ├── AppDelegate.swift    # macOS 原生 WKWebView 壳（菜单 + 后端启动 + 导航拦截）
│   │   └── Info.plist           # 应用清单
│   └── src/
│       ├── main.jsx             # React 挂载 + WKWebView 粘贴补丁
│       ├── App.jsx              # 根组件（页面路由 + NavigationContext + ApiProvider）
│       ├── styles/global.css    # 全局样式 + CSS 变量 + 组件样式
│       ├── utils/
│       │   ├── api.js           # API 请求封装（自动适配 dev/prod 地址）
│       │   ├── helpers.js       # 格式化、计算工具
│       │   └── reviewConfig.js  # 复盘版块配置（从 DailyReview 提取的数据层）
│       ├── hooks/
│       │   ├── useToast.jsx     # Toast 通知 Context
│       │   ├── useAiChat.js     # AI 聊天状态管理（单向数据流）
│       │   ├── useApi.jsx       # API 客户端注入 Context（低耦合可测试）
│       │   └── useNavigation.js # 通用导航 Context（解耦页面参数）
│       └── components/
│           ├── Sidebar.jsx       # 侧边栏导航 + DB 状态指示
│           ├── TitleBar.jsx      # 自定义标题栏（Electron 无边框窗口）
│           ├── Dashboard.jsx     # 看板首页
│           ├── TradePlan.jsx     # 交易计划编辑器
│           ├── TradePlanList.jsx # 交易计划记录
│           ├── FuturesCalc.jsx   # 合约计算器
│           ├── DailyReview.jsx   # 每日复盘主组件（高内聚协调器）
│           ├── ReviewSectionCard.jsx  # 复盘版块摘要卡片（纯展示）
│           ├── ReviewEditModal.jsx    # 复盘版块编辑弹窗（纯展示）
│           ├── AiChatPanel.jsx        # AI 聊天面板（纯展示）
│           ├── ReviewList.jsx   # 复盘记录列表
│           ├── TechnicalIndicators.jsx  # K 线形态 + 量能分析
│           ├── DailyNews.jsx    # 每日时事 3-SOP 日报 + AI 摘要
│           └── Settings.jsx     # 应用设置
│
├── src/server/
│   ├── server.js                # Node.js 后端（REST API + RSS + AI 代理 + 静态文件 + 文件解析）
│   └── db.js                    # 数据库抽象层（MySQL/SQLite 双驱动 + SQL 语法转换）
│
├── scripts/
│   └── build-mac.sh             # macOS 构建脚本（React 构建 + Swift 编译 + 打包 .app）
│
├── website/                     # GitHub Pages 官网
│   └── index.html
│
├── sources.opml                 # 默认 RSS 源配置（OPML 格式）
├── package.json                 # 后端依赖
└── README.md                    # 本文件
```

---

## 快速开始

### 环境要求

- **Node.js** ≥ 18
- **MySQL** 8.0+（可选，无 MySQL 自动回退 SQLite）
- **npm** ≥ 9

### 1. 安装依赖

```bash
cd tools && npm install           # 后端依赖
cd react-app && npm install       # 前端依赖
```

### 2. 启动开发环境

```bash
# 终端 1：后端服务（端口 8765）
cd tools && node src/server/server.js

# 终端 2：前端开发服务器（端口 5173，自动代理 /api → 8765）
cd tools/react-app && npm run dev
```

浏览器打开 `http://localhost:5173`

### 3. Electron 桌面开发

```bash
cd tools/react-app && npm run electron:dev
```

### 4. AI 配置（可选）

在应用内「设置 → AI 接口」中填写，或设置环境变量：

```bash
export AI_API_URL="https://api.deepseek.com/v1/chat/completions"
export AI_API_KEY="sk-xxxxxxxx"
export AI_MODEL="deepseek-chat"
```

---

## 构建桌面应用

### macOS（原生 Swift 应用）

```bash
bash scripts/build-mac.sh        # → build/StockToolbox.app
```

使用 Swift + WKWebView，无需 Electron，性能更优、包体更小。

### macOS / Windows（Electron）

```bash
cd react-app
npm run electron:build:mac       # → release/*.dmg
npm run electron:build:win       # → release/工具箱 Setup.exe
```

### 构建原理

后端 `server.js` 通过 **esbuild** 打包为单文件 `server.bundle.js`（~690KB），将 `feedparser`、`node-fetch` 及全部 20+ 子依赖内联。仅保留 `mysql2`（原生绑定）、`sql.js`（WASM）、`mammoth`（Word 解析）、`pdf-parse`（PDF 解析）作为外部模块，彻底消除 Windows 下逐个排查缺失依赖的问题。

构建完成后自动执行 **javascript-obfuscator** 代码混淆：
- 变量名 mangling + 字符串 base64 编码 + 自保护机制
- 前端 JS 膨胀约 2.9×，服务端膨胀约 1.7×
- 混淆配置位于 `scripts/obfuscate-config.json`，可独立调参

---

## API 接口

后端运行在 `http://127.0.0.1:8765`，所有响应 JSON，CORS 已启用。

### 交易 & 复盘

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 + 数据库状态 + 当前引擎 |
| `GET` | `/api/dashboard` | 看板统计数据 |
| `GET/POST` | `/api/trade-plans` | 交易计划查询 / 保存 |
| `DELETE` | `/api/trade-plans?id=` | 删除交易计划 |
| `GET/POST` | `/api/daily-reviews` | 复盘记录查询（支持 id/日期/股票筛选）/ 保存 |
| `DELETE` | `/api/daily-reviews?id=` | 删除复盘记录 |
| `GET/POST` | `/api/settings` | 应用设置读写 |

### AI 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/chat` | AI 复盘对话（需 API Key，支持 DeepSeek 思维链） |
| `POST` | `/api/ai/parse-file` | 文件解析（pdf/docx/txt/md） |
| `POST` | `/api/ai/daily-digest` | AI 生成 3-SOP 日报摘要 |
| `POST` | `/api/ai/weekly-digest` | AI 生成周报精选（基于过去 7 天日报） |
| `POST` | `/api/ai/monthly-digest` | AI 生成月报精选（基于过去 30 天日报） |

### 每日时事

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/daily-news` | 采集 RSS + 去重 + 优先级排序 + 3-SOP 分类 + 已保存摘要 |
| `GET` | `/api/daily-digests` | 历史日报日期列表 |
| `GET` | `/api/daily-digest?date=` | 按日期查询历史日报（含角标恢复） |
| `GET` | `/api/settings` | 读取应用设置 |
| `POST` | `/api/settings` | 保存应用设置 |
| `GET/POST` | `/api/sources/opml` | 读取/保存 OPML 配置 |
| `GET` | `/api/sources/opml?default=true` | 读取捆绑的默认 OPML（恢复出厂） |
| `GET` | `/api/periodic-digests` | 历史周报/月报列表 |
| `GET` | `/api/periodic-digest?id=` | 按 ID 查询单条周报/月报详情 |

---

## 数据库表

### trade_plans — 交易计划

| 字段 | 说明 |
|------|------|
| `id` | 主键自增 |
| `symbol` | 股票名称（唯一） |
| `buy_price / shares` | 买入价 / 股数 |
| `profit_rate / loss_rate` | 止盈率 / 止损率 |
| `take_profit_price / stop_loss_price` | 止盈价 / 止损价 |
| `expected_profit / expected_loss` | 预期盈亏 |
| `risk_reward` | 盈亏比 |
| `trade_direction` | long / short |
| `position_pct` | 仓位占比 |
| `trade_notes` | 交易备注 |

### daily_reviews — 每日复盘（五步法 23 字段）

五大版块：市场复盘（事实）→ 板块分析（逻辑）→ 个股检查（标的）→ 交易记录（内因）→ 明日策略（决策），共 23 个分析字段 + 买入/卖出价、股数、持仓方式等交易参数。

### app_settings — 应用设置

KV 键值存储：`theme`, `aiUrl`, `aiKey`（AES-256-GCM 加密）, `aiModel`, `aiTemperature`, `aiThinking`, `dbType` 等。

### daily_digests — 日报摘要

| 字段 | 说明 |
|------|------|
| `digest_date` | 日期（主键） |
| `digest` | AI 生成的摘要文本（已清洗尾注） |
| `articles_json` | 原始文章 JSON（用于历史查看时恢复角标链接） |
| `source_count` | 来源文章数 |
| `sentiment` | 市场情绪标签 |

---

## 开发指南

### 架构设计原则

- **低耦合高内聚**：组件通过 Context（`useApi`、`useNavigation`）注入依赖，避免直接 import 耦合
- **单一职责**：`DailyReview` 已拆分为协调器 + 纯展示组件（`ReviewSectionCard`、`ReviewEditModal`、`AiChatPanel`）+ 数据层（`reviewConfig.js`）+ 业务逻辑 Hook（`useAiChat`）
- **可测试性**：`useApi` 通过 Context 注入，可在测试中替换为 mock 实现

### 新增页面

1. `react-app/src/components/YourPage.jsx` — 页面组件
2. `react-app/src/App.jsx` — 在 `PAGES` 中注册
3. `react-app/src/components/Sidebar.jsx` — 在 `NAV` 数组中添加导航项

### 新增 API

1. `src/server/server.js` — 在 `handleApi()` 中添加路由
2. `react-app/src/utils/api.js` — 添加客户端方法

### 数据库迁移

- 新增列使用 `db.addColumnIfNotExists()`（兼容 MySQL/SQLite）
- 新增表在 `initializeDatabase()` 中 `CREATE TABLE IF NOT EXISTS`
- 跨引擎设置持久化通过 `config.json` + `syncSettingsFromConfig()` 保障

### 跨平台注意事项

- **WKWebView (macOS)**：`target="_blank"` 链接需 `WKNavigationDelegate` 拦截，用 `NSWorkspace.shared.open` 打开；Cmd+V 粘贴由 JS 级 `paste` 事件处理器确保 React onChange 触发
- **Electron (Windows)**：依赖模块需在 `package.json` → `extraResources` 中列出
- **CSS**：使用 `var(--xxx)` 变量，避免硬编码色值；双主题通过 `data-theme` 属性切换

---

## CI/CD

本项目使用 GitHub Actions 实现持续集成与自动发布：

| 工作流 | 触发条件 | 功能 |
|--------|---------|------|
| **CI** | push / PR 到 main | 多 Node 版本（18, 20）构建检查 + esbuild bundle 验证 |
| **Release** | 推送 `v*` 标签 | macOS（Swift 原生）+ Windows（Electron NSIS）自动构建，创建 GitHub Release |
| **Deploy Website** | push 到 main（website/ 变更） | 部署官网到 GitHub Pages |

### 手动触发 Release

```bash
git tag v2.0.0
git push origin v2.0.0
```

Actions 会自动构建 macOS `.app` 和 Windows `.exe`，上传到 Release 页面。

---

## 常见问题

**Q: 构建后应用启动白屏并提示 "Not found"？**  
A: 开发模式的后端进程（`node src/server/server.js`）占用了 8765 端口，导致构建后的新进程无法绑定。构建脚本已自动检测并清理旧进程，重新构建即可。

**Q: Windows 构建后启动白屏？**  
A: 首次启动需等待 MySQL 连接超时（3s）+ SQLite 回退，约 5-8 秒后显示界面。

**Q: 每日时事加载失败？**  
A: 检查 `sources.opml` 中的 RSS 源是否可访问（部分境外源需科学上网）。可在应用内「源管理」编辑 OPML 或点击「恢复默认」。

**Q: AI 摘要提示 API Key 未配置？**  
A: 在「设置 → AI 接口」中填写 API 地址和 Key，支持 OpenAI / DeepSeek 兼容 API。

**Q: macOS 应用提示"已损坏，无法打开"？**  
A: 终端执行 `xattr -cr /Applications/StockToolbox.app`，或右键 → 打开 → 确认打开。

**Q: Cmd+V 粘贴无法填入文本框？**  
A: 本应用在 `main.jsx` 中通过全局 `paste` 事件监听 + value setter 补丁确保粘贴生效。如仍不生效，请检查是否已更新到最新版本。

---

## 许可

MIT License

---

**版本**: 2.0.0 · **最后更新**: 2026-06-07 · **官网**: https://aglarevv.github.io/Stock-Tools
