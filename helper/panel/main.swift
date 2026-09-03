// Print@ panel: one window that follows a job from "locating" to "sent".
// Driven entirely by the agent over localhost: it streams job state as
// server-sent events and receives the user's choices as POSTs.
//   PrintAtPanel <jobId> <port>
import SwiftUI
import AppKit

struct Shop: Codable, Identifiable, Hashable {
    let id: String; let name: String; let address: String
    let summary: String; let why: String; let method: String; let primary: String
}
struct Loc: Codable { let address: String; let source: String }
struct Act: Codable, Identifiable { var id: String { key }; let key: String; let label: String }
struct JobState: Codable {
    var phase = "status"
    var title = ""
    var status = ""
    var detail = ""
    var log: [String] = []
    var location: Loc? = nil
    var ranked: [Shop] = []
    var fromMemory = false
    var note = ""
    var alternates = 0
    var result = ""
    var actions: [Act] = []
}

final class Model: NSObject, ObservableObject, URLSessionDataDelegate {
    @Published var state = JobState()
    @Published var selected: String? = nil
    @Published var typedAddress = ""
    let jobId: String, port: Int
    private var buffer = Data()
    private var session: URLSession!

    init(jobId: String, port: Int) {
        self.jobId = jobId; self.port = port
        super.init()
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 86400
        cfg.timeoutIntervalForResource = 86400
        session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
        session.dataTask(with: URL(string: "http://127.0.0.1:\(port)/job/\(jobId)/events")!).resume()
    }
    func urlSession(_ s: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        buffer.append(data)
        while let r = buffer.range(of: Data("\n\n".utf8)) {
            let chunk = buffer.subdata(in: 0..<r.lowerBound)
            buffer.removeSubrange(0..<r.upperBound)
            guard let text = String(data: chunk, encoding: .utf8) else { continue }
            for line in text.split(separator: "\n") where line.hasPrefix("data: ") {
                if let st = try? JSONDecoder().decode(JobState.self, from: Data(line.dropFirst(6).utf8)) {
                    DispatchQueue.main.async { self.apply(st) }
                }
            }
        }
    }
    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        DispatchQueue.main.async { NSApp.terminate(nil) }
    }
    private func apply(_ st: JobState) {
        state = st
        if selected == nil || !st.ranked.contains(where: { $0.id == selected }) { selected = st.ranked.first?.id }
        if st.phase == "closed" { NSApp.terminate(nil) }
    }
    func send(_ action: String, value: String = "") {
        var req = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/job/\(jobId)/action")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["action": action, "value": value])
        URLSession.shared.dataTask(with: req).resume()
    }
    var selectedShop: Shop? { state.ranked.first { $0.id == selected } }
}

struct ContentView: View {
    @ObservedObject var m: Model
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("Print@").font(.system(size: 20, weight: .semibold))
                Text("™").font(.system(size: 10, weight: .semibold)).baselineOffset(8)
                Spacer()
                Text(m.state.title).font(.callout).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            }
            Divider()
            Group {
                switch m.state.phase {
                case "confirm_location": locationView
                case "pick": pickView
                case "result": resultView
                default: statusView
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .padding(22)
        .frame(width: 520, height: 500)
    }

    var statusView: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                ProgressView().controlSize(.small)
                Text(m.state.status.isEmpty ? "Working" : m.state.status).font(.body.weight(.medium))
            }
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array(m.state.log.suffix(7).enumerated()), id: \.offset) { i, line in
                    Text(line)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(i == m.state.log.suffix(7).count - 1 ? Color.primary : Color.secondary)
                        .lineLimit(1).truncationMode(.middle)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
            Spacer()
            QuoteView()
            HStack { Spacer(); Button("Cancel") { m.send("cancel") } }
        }
    }

    var locationView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Search for a print shop near").font(.headline)
            VStack(alignment: .leading, spacing: 4) {
                Text(m.state.location?.address ?? "Unknown").font(.title3)
                Text(m.state.location?.source ?? "").font(.caption).foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor)))
            Text("Somewhere else?").font(.subheadline).padding(.top, 6)
            TextField("Street address, intersection or place name", text: $m.typedAddress)
                .textFieldStyle(.roundedBorder)
                .onSubmit { if !m.typedAddress.isEmpty { m.send("address", value: m.typedAddress) } }
            Spacer()
            HStack {
                Button("Cancel") { m.send("cancel") }
                Spacer()
                Button("Use typed address") { m.send("address", value: m.typedAddress) }.disabled(m.typedAddress.isEmpty)
                Button("Use this location") { m.send("use") }.keyboardShortcut(.defaultAction)
            }
        }
    }

    var pickView: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(m.state.fromMemory ? "Last time from here you used" : "Best matches, ranked").font(.headline)
            if !m.state.note.isEmpty { Text(m.state.note).font(.caption).foregroundStyle(.secondary) }
            List(m.state.ranked, selection: $m.selected) { s in
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name).font(.body.weight(.medium))
                    Text(s.summary).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .padding(.vertical, 2)
                .tag(s.id)
            }
            .frame(height: m.state.fromMemory ? 64 : 170)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            if let s = m.selectedShop {
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.address).font(.callout)
                    Text(s.why).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Text(s.method).font(.callout).padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 4)
            HStack {
                Button("Cancel") { m.send("cancel") }
                if m.state.fromMemory { Button("Search again") { m.send("search") } }
                if m.state.alternates > 0 { Button("Show \(m.state.alternates) other option\(m.state.alternates == 1 ? "" : "s")") { m.send("alternates") } }
                Spacer()
                Button(m.selectedShop?.primary ?? "Choose") { if let id = m.selected { m.send("choose", value: id) } }
                    .keyboardShortcut(.defaultAction).disabled(m.selected == nil)
            }
        }
    }

    var resultView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(m.state.result).font(.body).fixedSize(horizontal: false, vertical: true)
            Spacer()
            HStack {
                Spacer()
                ForEach(m.state.actions) { a in
                    if a.key == "done" {
                        Button(a.label) { m.send(a.key) }.keyboardShortcut(.defaultAction)
                    } else {
                        Button(a.label) { m.send(a.key) }
                    }
                }
            }
        }
    }
}

struct QuoteView: View {
    static let quotes: [(String, String)] = [
        ("The best way to predict the future is to invent it.", "Alan Kay"),
        ("Any sufficiently advanced technology is indistinguishable from magic.", "Arthur C. Clarke"),
        ("The future is already here. It's just not evenly distributed.", "William Gibson"),
        ("The question of whether a machine can think is no more interesting than the question of whether a submarine can swim.", "Edsger Dijkstra"),
        ("Machines take me by surprise with great frequency.", "Alan Turing"),
        ("We are stuck with technology when what we really want is just stuff that works.", "Douglas Adams"),
        ("The real problem is not whether machines think but whether men do.", "B. F. Skinner"),
        ("Civilization advances by extending the number of important operations which we can perform without thinking of them.", "Alfred North Whitehead"),
    ]
    @State private var index = Int.random(in: 0..<QuoteView.quotes.count)
    let timer = Timer.publish(every: 9, on: .main, in: .common).autoconnect()
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(QuoteView.quotes[index].0).font(.callout).italic().foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Text(QuoteView.quotes[index].1).font(.caption).foregroundStyle(.tertiary)
        }
        .onReceive(timer) { _ in withAnimation { index = (index + 1) % QuoteView.quotes.count } }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let model: Model
    init(model: Model) { self.model = model }
    func applicationDidFinishLaunching(_ n: Notification) {
        if let icon = NSImage(contentsOfFile: "/Library/Printers/Icons/PrintAt.icns") { NSApp.applicationIconImage = icon }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 500),
                          styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Print@"
        window.contentView = NSHostingView(rootView: ContentView(m: model))
        window.isReleasedWhenClosed = false
        window.center()
        window.level = .floating
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.window.level = .normal }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
}

let args = CommandLine.arguments
let model = Model(jobId: args.count > 1 ? args[1] : "", port: args.count > 2 ? Int(args[2]) ?? 4243 : 4243)
let app = NSApplication.shared
let delegate = AppDelegate(model: model)
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
