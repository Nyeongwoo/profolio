import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Help ▸ Send Feedback…: a short form that turns into an email to the
/// developer in the user's mail app, with the app and macOS versions and any
/// files picked (a Lab capture, a screenshot) attached. Nothing is sent from
/// the app itself; the user sends the email.
enum FeedbackWindow {
    static let address = "nnwoo@duck.com"
    private static var window: NSWindow?

    static func show() {
        if let window { window.makeKeyAndOrderFront(nil); return }
        let w = NSWindow(contentRect: .zero, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        w.title = "Send Feedback"
        w.isReleasedWhenClosed = false
        w.contentViewController = NSHostingController(rootView: FeedbackView { w.close(); window = nil })
        w.center()
        window = w
        w.makeKeyAndOrderFront(nil)
    }

    /// "Profolio 1.5.8 (38) · macOS 15.3.1 · Apple silicon"
    static var systemLine: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "?"
        let build = info["CFBundleVersion"] as? String ?? "?"
        let os = ProcessInfo.processInfo.operatingSystemVersion
        #if arch(arm64)
        let chip = "Apple silicon"
        #else
        let chip = "Intel"
        #endif
        return "Profolio \(version) (\(build)) · macOS \(os.majorVersion).\(os.minorVersion).\(os.patchVersion) · \(chip)"
    }
}

struct FeedbackView: View {
    let close: () -> Void

    enum Kind: String, CaseIterable, Identifiable {
        case problem = "Problem", idea = "Idea", other = "Other"
        var id: String { rawValue }
    }

    @State private var kind: Kind = .problem
    @State private var message = ""
    @State private var files: [URL] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Tell Nyeongwoo what isn’t working, or what you’d like Profolio to do. This opens an email in your mail app for you to send.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Picker("Kind", selection: $kind) {
                ForEach(Kind.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            TextEditor(text: $message)
                .font(.body)
                .frame(minHeight: 160)
                .overlay(alignment: .topLeading) {
                    if message.isEmpty {
                        Text(kind == .problem ? "What happened, and what did you expect?" : "Your feedback")
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .allowsHitTesting(false)
                    }
                }
                .padding(4)
                .background(RoundedRectangle(cornerRadius: 6).fill(Color(nsColor: .textBackgroundColor)))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.secondary.opacity(0.25)))

            VStack(alignment: .leading, spacing: 4) {
                ForEach(files, id: \.self) { file in
                    HStack(spacing: 6) {
                        Image(systemName: "paperclip").foregroundStyle(.secondary)
                        Text(file.lastPathComponent).lineLimit(1).truncationMode(.middle)
                        Button { files.removeAll { $0 == file } } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.borderless)
                            .foregroundStyle(.secondary)
                            .help("Remove")
                    }
                    .font(.callout)
                }
                Button { attach() } label: { Label("Attach Files…", systemImage: "paperclip") }
                    .buttonStyle(.link)
                    .help("A screenshot or a Lab capture helps show the problem")
            }

            Text("Added to the email: \(FeedbackWindow.systemLine)")
                .font(.caption)
                .foregroundStyle(.tertiary)

            HStack {
                Spacer()
                Button("Cancel") { close() }.keyboardShortcut(.cancelAction)
                Button("Write Email") { send() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private func attach() {
        let panel = NSOpenPanel()
        panel.title = "Attach Files"
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK else { return }
        files += panel.urls.filter { !files.contains($0) }
    }

    private func send() {
        let subject = "Profolio feedback: \(kind.rawValue)"
        let body = "\(message.trimmingCharacters(in: .whitespacesAndNewlines))\n\n—\n\(FeedbackWindow.systemLine)\n"
        // Mail (or the default mail app, when it supports the share service)
        // gets the attachments; otherwise a mailto: link, without them.
        if let service = NSSharingService(named: .composeEmail) {
            service.recipients = [FeedbackWindow.address]
            service.subject = subject
            let items: [Any] = [body] + files
            if service.canPerform(withItems: items) {
                service.perform(withItems: items)
                close()
                return
            }
        }
        var link = URLComponents()
        link.scheme = "mailto"
        link.path = FeedbackWindow.address
        link.queryItems = [URLQueryItem(name: "subject", value: subject), URLQueryItem(name: "body", value: body)]
        guard let url = link.url, NSWorkspace.shared.open(url) else {
            let alert = NSAlert()
            alert.messageText = "No mail app is set up."
            alert.informativeText = "Send your feedback to \(FeedbackWindow.address). The address has been copied."
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(FeedbackWindow.address, forType: .string)
            alert.runModal()
            return
        }
        if !files.isEmpty {
            let alert = NSAlert()
            alert.messageText = "Attach the files in your email."
            alert.informativeText = "Your mail app opened the email without them: \(files.map(\.lastPathComponent).joined(separator: ", "))."
            alert.runModal()
            NSWorkspace.shared.activateFileViewerSelecting(files)
        }
        close()
    }
}
