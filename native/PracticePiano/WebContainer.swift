import SwiftUI
import UIKit
import WebKit

struct WebContainerView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebViewController { WebViewController() }
    func updateUIViewController(_ controller: WebViewController, context: Context) {}
}

/// Avoids a retain cycle between WKUserContentController and the view controller.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

final class WebViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let handlerName = "practicePiano"

    private var webView: WKWebView!
    private let midi = MIDIBridge()
    private let schemeHandler = AppSchemeHandler()
    private var pageReady = false
    private var pending: [String] = []

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: AppSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(WeakScriptHandler(self), name: Self.handlerName)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.94, green: 0.91, blue: 0.84, alpha: 1)
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, macCatalyst 16.4, *) {
            webView.isInspectable = true // Safari ▸ Develop menu, for debugging
        }
        self.webView = webView
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        midi.onMessage = { [weak self] json in self?.send(json) }
        midi.start()
        webView.load(URLRequest(url: AppSchemeHandler.startURL))
    }

    // Hardware keyboards (QWERTY practice) go straight to the web view.
    override var canBecomeFirstResponder: Bool { true }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        webView.becomeFirstResponder()
    }

    // MARK: JS → native

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "hello", "rescan":
            pageReady = true
            flushPending()
            midi.rescan()
        case "showBluetoothPairing":
            BluetoothMIDIPairing.present(from: self) { [weak self] in
                self?.midi.rescan()
                self?.send(#"{"type":"bluetoothClosed"}"#)
            }
        default:
            NSLog("practice-piano: unknown command \(cmd)")
        }
    }

    // MARK: native → JS

    private func send(_ json: String) {
        guard pageReady else {
            pending.append(json)
            if pending.count > 500 { pending.removeFirst(pending.count - 500) }
            return
        }
        webView.evaluateJavaScript("window.__practicePianoNative && window.__practicePianoNative.receive(\(json))")
    }

    private func flushPending() {
        let queued = pending
        pending.removeAll()
        queued.forEach(send)
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        pageReady = false
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Keep the app on its bundled pages; open real links in the default browser.
        if let url = action.request.url, url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}
