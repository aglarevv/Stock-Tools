/**
 * Electron 主进程
 *
 * 职责：
 * 1. 单实例锁 — 阻止多开，避免 NSIS 安装/卸载冲突
 * 2. 启动 Node.js 后端服务（fork 子进程，端口 8765）
 * 3. 创建无边框窗口（Windows hidden + macOS hiddenInset）
 * 4. IPC 通信 — 窗口最小化/最大化/关闭控制
 * 5. 等待后端就绪后再加载前端页面（轮询 /api/health）
 * 6. 应用退出时清理子进程
 */
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { fork } = require("child_process");

// ---------------------------------------------------------------------------
// 单实例锁
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let mainWindow = null;
let backendProcess = null;
let appIsQuitting = false;

// ---------------------------------------------------------------------------
// 解析服务器脚本路径（兼容 开发 / 生产）
// ---------------------------------------------------------------------------
function resolveServerPath() {
  // 优先使用打包后的 bundle（生产环境）
  if (process.resourcesPath) {
    const bundlePath = path.join(process.resourcesPath, "server", "server.bundle.js");
    if (fs.existsSync(bundlePath)) return bundlePath;
    const resPath = path.join(process.resourcesPath, "server", "server.js");
    if (fs.existsSync(resPath)) return resPath;
  }

  // 回退：开发环境中的相对路径
  const devBundle = path.join(__dirname, "..", "..", "src", "server", "server.bundle.js");
  if (fs.existsSync(devBundle)) return devBundle;
  const devPath = path.join(__dirname, "..", "..", "src", "server", "server.js");
  if (fs.existsSync(devPath)) return devPath;

  return devPath;
}

// ---------------------------------------------------------------------------
// 解析前端静态文件目录
// ---------------------------------------------------------------------------
function resolveWebRoot() {
  // 生产环境：Electron extraResources 中的 dist
  if (process.resourcesPath) {
    const resDist = path.join(process.resourcesPath, "web");
    if (fs.existsSync(resDist)) return resDist;
  }

  // 开发环境
  const devDist = path.join(__dirname, "..", "dist");
  if (fs.existsSync(devDist)) return devDist;

  return devDist; // 回退
}

// ---------------------------------------------------------------------------
// 启动后端 Node.js 服务
// ---------------------------------------------------------------------------
function startBackend() {
  const serverPath = resolveServerPath();
  const webRoot = resolveWebRoot();
  const userDataPath = app.getPath("userData");

  console.log("[electron] server path:", serverPath);
  console.log("[electron] web root:", webRoot);
  console.log("[electron] user data:", userDataPath);

  try {
    backendProcess = fork(serverPath, [], {
      cwd: path.dirname(serverPath),
      env: {
        ...process.env,
        PORT: "8765",
        WEB_ROOT: webRoot,
        ELECTRON_USER_DATA: userDataPath,
      },
      silent: true,
      // Windows 上确保子进程随父进程退出
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    backendProcess.stdout?.on("data", (d) => {
      console.log("[backend]", d.toString().trimEnd());
    });
    backendProcess.stderr?.on("data", (d) => {
      console.error("[backend]", d.toString().trimEnd());
    });
    backendProcess.on("error", (err) => {
      console.error("[backend] spawn error:", err.message);
    });
    backendProcess.on("exit", (code, signal) => {
      console.log(`[backend] exited code=${code} signal=${signal}`);
      backendProcess = null;
    });
  } catch (e) {
    console.error("[electron] Failed to start backend:", e.message);
  }
}

// ---------------------------------------------------------------------------
// 终止后端进程（跨平台）
// ---------------------------------------------------------------------------
function killBackend() {
  if (!backendProcess) return;
  try {
    // Windows 上 SIGTERM 不可靠，直接用任务管理器方式杀进程树
    if (process.platform === "win32") {
      // 先尝试温和退出
      backendProcess.kill("SIGTERM");
      // 定时强制杀
      setTimeout(() => {
        try { backendProcess?.kill("SIGKILL"); } catch {}
      }, 3000);
      // 也杀整个进程树
      try {
        require("child_process").execSync(
          `taskkill /pid ${backendProcess.pid} /T /F 2>nul`,
          { stdio: "ignore" },
        );
      } catch {}
    } else {
      backendProcess.kill("SIGTERM");
      setTimeout(() => {
        try { backendProcess?.kill("SIGKILL"); } catch {}
      }, 2000);
    }
  } catch (e) {
    console.error("[electron] killBackend error:", e.message);
  }
}

// ---------------------------------------------------------------------------
// 创建浏览器窗口
// ---------------------------------------------------------------------------
function createWindow() {
  const isWin = process.platform === "win32";

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 650,
    title: "工具箱",
    frame: false,
    autoHideMenuBar: true,
    show: false,
    titleBarStyle: isWin ? "hidden" : "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // ── 外部链接用系统默认浏览器打开 ──
  // 拦截 window.open() 和 target="_blank"
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // 拦截同窗口内导航到外部链接
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentHost = new URL(mainWindow.webContents.getURL()).host;
    const targetHost = new URL(url).host;
    if (targetHost !== currentHost) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // IPC：窗口控制
  ipcMain.on("win:minimize", () => mainWindow?.minimize());
  ipcMain.on("win:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("win:close", () => mainWindow?.close());
  ipcMain.handle("win:isMaximized", () => mainWindow?.isMaximized() ?? false);
  mainWindow.on("maximize", () => mainWindow?.webContents.send("win:maximize-change", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("win:maximize-change", false));

  const isDev = process.env.NODE_ENV === "development" || process.argv.includes("--dev");

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
    mainWindow.once("ready-to-show", () => mainWindow.show());
  } else {
    const serverUrl = "http://127.0.0.1:8765";
    let retries = 0;
    const maxRetries = 20;

    // 先显示窗口（加载中状态），避免用户以为应用没打开
    mainWindow.loadURL(`data:text/html;charset=utf-8,
      <!doctype html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{display:flex;align-items:center;justify-content:center;height:100vh;
        font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#f5f5f7;color:#1d1d1f}
      .splash{text-align:center}
      .spinner{width:36px;height:36px;border:4px solid #e5e5ea;border-top-color:#6366f1;
        border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px}
      @keyframes spin{to{transform:rotate(360deg)}}
      h1{font-size:18px;font-weight:600;margin-bottom:6px}
      p{font-size:13px;color:#6e6e73}
      </style></head><body><div class="splash">
      <div class="spinner"></div><h1>工具箱</h1><p>正在启动本地服务...</p>
      </div></body></html>`);
    mainWindow.show();

    const tryLoad = () => {
      if (appIsQuitting) return;

      const http = require("http");
      const req = http.get(`${serverUrl}/api/health`, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            const health = JSON.parse(body);
            // 数据库就绪后才加载页面，否则继续等待
            if (res.statusCode === 200 && health.database === "ready") {
              console.log("[electron] Backend ready, loading UI...");
              mainWindow.loadURL(serverUrl);
              mainWindow.once("ready-to-show", () => mainWindow.show());
            } else {
              console.log(`[electron] Backend status: ${health.database}, retrying...`);
              retryLoad();
            }
          } catch {
            retryLoad();
          }
        });
      });
      req.on("error", () => retryLoad());
      req.setTimeout(1500, () => {
        req.destroy();
        retryLoad();
      });
    };

    const retryLoad = () => {
      retries++;
      if (retries >= maxRetries) {
        console.warn("[electron] Backend timeout, loading anyway...");
        mainWindow.loadURL(serverUrl);
        mainWindow.once("ready-to-show", () => mainWindow.show());
        return;
      }
      setTimeout(tryLoad, 1000);
    };

    setTimeout(tryLoad, 1000);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App 生命周期
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  // macOS 上通常不退出，但用户关闭窗口时退出
  killBackend();
  app.quit();
});

app.on("before-quit", () => {
  appIsQuitting = true;
  killBackend();
});

app.on("activate", () => {
  // macOS：点击 Dock 图标时重新创建窗口
  if (!mainWindow) createWindow();
});

// 确保进程退出
process.on("exit", () => killBackend());
