import Cocoa
import WebKit

/// 自定义 WKWebView，确保键盘事件和编辑操作能正确处理
final class ToolboxWebView: WKWebView {

    override var acceptsFirstResponder: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    private var window: NSWindow?
    private var backendProcess: Process?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 创建主菜单（包含编辑菜单，使 Cmd+C/V/X/A 等快捷键可用）
        buildMainMenu()

        let config = WKWebViewConfiguration()
        let prefs = WKPreferences()
        prefs.javaScriptCanOpenWindowsAutomatically = false
        config.preferences = prefs

        let webView = ToolboxWebView(frame: .zero, configuration: config)
        webView.allowsMagnification = true
        webView.uiDelegate = self
        webView.navigationDelegate = self

        let frame = NSRect(x: 0, y: 0, width: 1180, height: 760)
        let appWindow = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        appWindow.title = "股票工具箱"
        appWindow.minSize = NSSize(width: 960, height: 650)
        appWindow.center()
        appWindow.contentView = webView
        appWindow.makeKeyAndOrderFront(nil)
        appWindow.makeFirstResponder(webView)
        window = appWindow

        // 立即显示加载页面，避免启动白屏（使用与侧边栏一致的 SVG 图标）
        let loadingHTML = """
        <!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{display:flex;align-items:center;justify-content:center;height:100vh;
          font-family:-apple-system,'PingFang SC',sans-serif;background:#f8faf7;color:#17201d;}
        .splash{text-align:center;}
        .spinner{width:36px;height:36px;border:4px solid #e5e7e0;border-top-color:#6366f1;
          border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        .logo{margin-bottom:12px;}
        h1{font-size:20px;font-weight:700;margin-bottom:6px;}
        p{font-size:13px;color:#6b7280;}
        </style></head><body><div class="splash">
        <div class="logo"><svg width="48" height="48" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="url(#g)"/><path d="M9 12h6l-3 8h4l-4 8 6-14H12L9 12Z" fill="#fff" opacity="0.9"/><defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs></svg></div>
        <div class="spinner"></div><h1>工具箱</h1><p>正在启动本地服务…</p>
        </div></body></html>
        """
        webView.loadHTMLString(loadingHTML, baseURL: nil)

        startBackend(in: webView)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - 主菜单（修复编辑快捷键在无 Storyboard 的纯代码 App 中失效的问题）

    private func buildMainMenu() {
        let mainMenu = NSMenu()

        // App 菜单
        let appMenu = NSMenu()
        let appName = ProcessInfo.processInfo.processName
        appMenu.addItem(NSMenuItem(title: "关于 \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "退出 \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        let appMenuItem = NSMenuItem()
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // 编辑菜单
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(NSMenuItem(title: "撤销", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem(title: "重做", action: Selector(("redo:")), keyEquivalent: "Z"))
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "删除", action: #selector(NSText.delete(_:)), keyEquivalent: "\u{8}"))
        editMenu.addItem(NSMenuItem(title: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        let editMenuItem = NSMenuItem()
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // 窗口菜单
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(NSMenuItem(title: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        let windowMenuItem = NSMenuItem()
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    // MARK: - WKUIDelegate（使 alert/confirm/prompt 弹窗在 WKWebView 中正常工作）

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "股票工具箱"
        alert.informativeText = message
        alert.addButton(withTitle: "确定")
        alert.beginSheetModal(for: window!) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "股票工具箱"
        alert.informativeText = message
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        alert.beginSheetModal(for: window!) { response in
            completionHandler(response == .alertFirstButtonReturn)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "股票工具箱"
        alert.informativeText = prompt
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        alert.window.initialFirstResponder = input
        alert.beginSheetModal(for: window!) { response in
            completionHandler(response == .alertFirstButtonReturn ? input.stringValue : nil)
        }
    }

    // MARK: - WKNavigationDelegate（处理链接跳转：内部导航放行，_blank/外部链接用系统浏览器打开）

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        // 允许加载本地服务页面和 about:blank
        if url.scheme == "about" {
            decisionHandler(.allow)
            return
        }

        // 首次加载（无 mainFrame URL）放行
        guard let _ = navigationAction.targetFrame?.isMainFrame else {
            // targetFrame 为 nil 表示新窗口（target="_blank"）
            // 用系统默认浏览器打开
            if url.scheme == "http" || url.scheme == "https" {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
            return
        }

        // 同域内导航放行（127.0.0.1:8765 或 localhost:8765）
        if url.host == "127.0.0.1" || url.host == "localhost" {
            decisionHandler(.allow)
            return
        }

        // 外部链接用系统默认浏览器打开
        if url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    // 处理 window.open() / target="_blank" 创建新窗口的请求
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url,
           url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // MARK: - Backend

    private func startBackend(in webView: WKWebView) {
        guard let nodePath = findNodePath() else {
            showStartupError("未找到 Node.js。请先安装 Node.js 后再打开应用。", in: webView)
            return
        }

        // 优先使用打包后的单文件（server.bundle.js），回退到原始 server.js
        guard
            let webRootURL = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true)
        else {
            showStartupError("应用资源不完整，缺少本地服务文件。", in: webView)
            return
        }

        let serverURL: URL
        if let bundleURL = Bundle.main.url(forResource: "server.bundle", withExtension: "js", subdirectory: "server") {
            serverURL = bundleURL
        } else if let originalURL = Bundle.main.url(forResource: "server", withExtension: "js", subdirectory: "server") {
            serverURL = originalURL
        } else {
            showStartupError("应用资源不完整，缺少本地服务文件。", in: webView)
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [serverURL.path]
        process.currentDirectoryURL = serverURL.deletingLastPathComponent()

        var environment = ProcessInfo.processInfo.environment
        environment["PORT"] = "8765"
        environment["WEB_ROOT"] = webRootURL.path
        environment["MYSQL_HOST"] = "localhost"
        environment["MYSQL_PORT"] = "3306"
        environment["MYSQL_USER"] = "root"
        environment["MYSQL_PASSWORD"] = "rootroot"
        environment["MYSQL_DATABASE"] = "stock_toolbox"
        environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        process.environment = environment

        do {
            try process.run()
            backendProcess = process
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                webView.load(URLRequest(url: URL(string: "http://127.0.0.1:8765")!))
            }
        } catch {
            showStartupError("本地服务启动失败：\(error.localizedDescription)", in: webView)
        }
    }

    private func findNodePath() -> String? {
        let candidates = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    private func showStartupError(_ message: String, in webView: WKWebView) {
        let html = """
        <!doctype html>
        <html lang="zh-CN">
        <meta charset="utf-8">
        <body style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;margin:40px;color:#17201d;background:#f3f5f1">
          <h1>股票工具箱无法启动</h1>
          <p>\(message)</p>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        backendProcess?.terminate()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
