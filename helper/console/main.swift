// Print@ Console: a native window around the local console page (http://127.0.0.1:4243/).
import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let url = URL(string: "http://127.0.0.1:\(CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "4243")/")!

    func applicationDidFinishLaunching(_ n: Notification) {
        if let icon = NSImage(contentsOfFile: "/Library/Printers/Icons/PrintAt.icns") { NSApp.applicationIconImage = icon }
        let cfg = WKWebViewConfiguration()
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1120, height: 820), configuration: cfg)
        web.navigationDelegate = self
        window = NSWindow(contentRect: web.frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Print@ Console"
        window.contentView = web
        window.minSize = NSSize(width: 720, height: 480)
        window.setFrameAutosaveName("PrintAtConsole")
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        NSApp.mainMenu = menu()
        web.load(URLRequest(url: url))
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in self.web.reload() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showOffline() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showOffline() }
    func showOffline() {
        let html = """
        <body style="font:15px -apple-system,system-ui;color:#1c2430;background:#f6f7f9;padding:40px">
        <h2 style="font-size:20px;margin:0 0 8px">Print@ agent is not running</h2>
        <p>The console is served by the agent on port 4243. Start it with:</p>
        <pre style="background:#eef0f3;padding:10px;border-radius:6px">launchctl kickstart -k gui/$(id -u)/io.printat.agent</pre>
        <p><a href="\(url.absoluteString)">Retry</a></p></body>
        """
        web.loadHTMLString(html, baseURL: nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
    @objc func reload() { web.load(URLRequest(url: url)) }
    @objc func openInBrowser() { NSWorkspace.shared.open(url) }
    func menu() -> NSMenu {
        let bar = NSMenu()
        let app = NSMenuItem(); bar.addItem(app)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        appMenu.addItem(withTitle: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "b")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Print@ Console", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        app.submenu = appMenu
        let edit = NSMenuItem(); bar.addItem(edit)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.submenu = editMenu
        return bar
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
