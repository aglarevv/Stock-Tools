# 🧰 股票工具箱 · StockToolbox

跨平台股票交易辅助桌面应用。集**交易计划**、**合约计算**、**每日复盘**、**AI 复盘助手**、**技术指标**、**每日时事 3-SOP 分析**于一体，支持 macOS / Windows。

> 前端 React 18 + Vite 5 · 桌面端 Electron 31 / Swift WKWebView · 后端 Node.js + MySQL/SQLite 双数据库

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
| 📰 **每日时事** | 3-SOP 日报体系 + AI 摘要生成 + RSS 源自定义 + 历史查阅 |
| ⚙️ **设置** | 数据库配置、AI 接口、OPML 源管理、API Key 加密存储 |

---

## 技术栈

```
前端        React 18 + Vite 5 + JSX
样式        CSS 变量驱动（亮色主题）
桌面端      Electron 31（Win .nsis）/ Swift WKWebView（macOS .app）
后端        Node.js HTTP Server（端口 8765）
数据库      MySQL 8.0+（优先） / SQLite（sql.js WASM 回退）
打包        esbuild 单文件 bundle（666KB，含 feedparser + node-fetch）
图表        纯 CSS / SVG
字体        Inter + JetBrains Mono（自托管 WOFF2）
安全        AES-256-GCM API Key 加密
```

---

## 项目结构

```
tools/
├── react-app/                     # React 前端
│   ├── index.html                 # Vite 入口 HTML
│   ├── vite.config.js             # Vite 配置（dev 代理 /api → 8765）
│   ├── package.json               # 前端依赖 + Electron-builder 配置
│   ├── public/icon.png            # 应用图标
│   ├── electron/
│   │   ├── main.cjs               # Electron 主进程（窗口管理+后端拉起+健康轮询）
│   │   └── preload.cjs            # IPC 桥接（窗口控制）
│   ├── macos/
│   │   ├── AppDelegate.swift      # macOS 原生 WKWebView 壳（菜单+后端启动+导航拦截）
│   │   └── Info.plist             # 应用清单
│   └── src/
│       ├── main.jsx               # React 挂载 + WKWebView 补丁
│       ├── App.jsx                # 根组件（页面路由 + Toast 容器）
│       ├── styles/global.css      # 全局样式 + CSS 变量 + 组件样式
│       ├── utils/
│       │   ├── api.js             # API 请求封装（自动适配 dev/prod 地址）
│       │   └── helpers.js         # 格式化、计算工具
│       ├── hooks/
│       │   └── useToast.jsx       # Toast 通知 Context
│       └── components/
│           ├── Sidebar.jsx         # 侧边栏导航
│           ├── TitleBar.jsx        # 自定义标题栏（Electron 无边框窗口）
│           ├── Dashboard.jsx       # 看板首页
│           ├── TradePlan.jsx       # 交易计划编辑器
│           ├── TradePlanList.jsx   # 交易计划记录
│           ├── FuturesCalc.jsx     # 合约计算器
│           ├── DailyReview.jsx     # 每日复盘 + AI 对话
│           ├── ReviewList.jsx      # 复盘记录列表
│           ├── TechnicalIndicators.jsx  # K 线形态 + 量能分析
│           ├── DailyNews.jsx       # 每日时事 3-SOP 日报 + AI 摘要
│           └── Settings.jsx        # 应用设置
├── src/server/
│   ├── server.js                  # Node.js 后端（REST API + RSS + AI 代理 + 静态文件）
│   └── db.js                      # 数据库抽象层（MySQL/SQLite 双驱动 + SQL 转换）
├── scripts/
│   └── build-mac.sh               # macOS 构建脚本（React 构建 + Swift 编译 + 打包 .app）
├── sources.opml                   # 默认 RSS 源配置（OPML 格式）
└── package.json                   # 后端依赖
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

# 终端 2：前端开发服务器（端口 5173）
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

### 构建原理

后端 `server.js` 通过 **esbuild** 打包为单文件 `server.bundle.js`（666KB），将 `feedparser`、`node-fetch` 及全部 20+ 子依赖内联。仅保留 `mysql2`（原生绑定）和 `sql.js`（WASM）作为外部模块。彻底消除了 Windows 下逐个排查缺失依赖的问题。

### macOS

```bash
# Swift WKWebView 原生应用
bash scripts/build-mac.sh        # → build/StockToolbox.app

# Electron 打包
cd react-app && npm run electron:build:mac   # → release/*.dmg
```

### Windows

```bash
cd react-app && npm run electron:build:win   # → release/工具箱 Setup.exe
```

---

## API 接口

后端 `http://127.0.0.1:8765`，所有响应 JSON，CORS 已启用。

### 交易 & 复盘

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 + 数据库状态 |
| `GET` | `/api/dashboard` | 看板统计数据 |
| `GET/POST` | `/api/trade-plans` | 交易计划查询 / 保存 |
| `DELETE` | `/api/trade-plans?id=` | 删除交易计划 |
| `GET/POST` | `/api/daily-reviews` | 复盘记录查询 / 保存 |
| `DELETE` | `/api/daily-reviews?id=` | 删除复盘记录 |
| `GET/POST` | `/api/settings` | 应用设置读写 |

### AI 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/chat` | AI 复盘对话（需 API Key） |
| `POST` | `/api/ai/parse-file` | 文件解析（pdf/docx/txt/md） |
| `POST` | `/api/ai/daily-digest` | AI 生成 3-SOP 日报摘要 |

### 每日时事

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/daily-news` | 采集 RSS + 3-SOP 分类 + 已保存摘要 |
| `GET` | `/api/daily-digests` | 历史日报日期列表 |
| `GET` | `/api/daily-digest?date=` | 按日期查询历史日报 |
| `GET/POST` | `/api/sources/opml` | RSS 源配置读写 |

---

## 数据库表

### trade_plans — 交易计划
### daily_reviews — 每日复盘（五步法 16 字段）
### app_settings — 应用设置（KV 存储）
### daily_digests — 日报摘要持久化

| 字段 | 说明 |
|------|------|
| `digest_date` | 日期（主键） |
| `digest` | AI 生成的摘要文本 |
| `articles_json` | 原始文章 JSON（用于历史查看时恢复角标链接） |
| `source_count` | 来源文章数 |
| `sentiment` | 市场情绪标签 |

---

## 开发指南

### 新增页面

1. `react-app/src/components/YourPage.jsx` — 页面组件
2. `react-app/src/App.jsx` — 在 `PAGES` 中注册
3. `react-app/src/components/Sidebar.jsx` — 在 `NAV` 中添加导航项

### 新增 API

1. `src/server/server.js` — 在 `handleApi()` 中添加路由
2. `react-app/src/utils/api.js` — 添加客户端方法

### 数据库迁移

新增列使用 `db.addColumnIfNotExists()`（兼容 MySQL/SQLite），新表在 `initializeDatabase()` 中 `CREATE TABLE IF NOT EXISTS`。

### 跨平台注意事项

- **WKWebView**：`target="_blank"` 链接需 `WKNavigationDelegate` 拦截，用 `NSWorkspace.shared.open` 打开
- **Electron**：依赖模块需在 `package.json` → `extraResources` 中列出
- **CSS**：使用 `var(--xxx)` 变量，避免硬编码色值

---

## 常见问题

**Q: Windows 构建后启动白屏？**  
A: 首次启动需等待 MySQL 连接超时（3s）+ SQLite 回退，约 5-8 秒后显示界面。

**Q: 每日时事加载失败？**  
A: 检查 `sources.opml` 中的 RSS 源是否可访问（部分境外源需科学上网）。

**Q: AI 摘要提示 API Key 未配置？**  
A: 在「设置」中填写 AI 接口信息，支持 OpenAI / DeepSeek 兼容 API。
- 样式优先使用 CSS 变量（`var(--accent)` 等）

### 新增页面

1. 在 `components/` 创建组件
2. 在 `App.jsx` 的 `PAGES` 对象注册
3. 在 `Sidebar.jsx` 的 `NAV` 数组添加导航项

### 主题切换

`global.css` 中定义了两套 CSS 变量（`:root` 亮色 / `.dark` 暗色）。在 JS 中通过 `document.documentElement.classList.toggle("dark")` 切换。

### Vite 代理

开发时前端 `localhost:5173`，Vite 自动将 `/api/*` 代理到 `localhost:8765`。生产模式下 Electron 直接启动后端进程。

---

## 常见问题

**Q: 数据库连接失败？**
A: 确认 MySQL 已启动，检查环境变量或设置页中的数据库配置。

**Q: AI 助手无响应？**
A: 确认已配置有效的 API Key，检查 API 地址格式是否正确。

**Q: Windows 构建报错？**
A: `npm install` 需要完整安装，确保 `node_modules/electron` 存在。首次构建需下载 Electron 二进制约 150MB。

**Q: 开发时前端 404？**
A: 确认后端服务 `node src/server/server.js` 已在另一个终端启动。

---

## 许可

MIT License

---

**版本**: 2.0.0 · **最后更新**: 2026-06-05
