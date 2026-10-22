import AppKit
import UniformTypeIdentifiers

/// Every prompt sent to a Lab piece's agent, with when, what it answered,
/// what it did and how the turn ended — kept in the package
/// (assistant/prompt-log.json, never published) and never trimmed, so it
/// outlives Clear Conversation and the transcripts' 400-message window.
/// The Lab's Prompts button exports it as an Excel workbook.
struct LabPromptRecord: Codable, Identifiable {
    var id = UUID()
    /// When it was sent; nil for prompts taken over from transcripts saved
    /// before the log existed.
    var date: Date?
    let piece: String
    let prompt: String
    var picked: String?
    var reply = ""
    var actions: [String] = []
    var outcome = ""
}

@MainActor
final class LabPromptLog {
    private(set) var records: [LabPromptRecord] = []
    /// The record each piece's current turn adds to.
    private var open: [String: UUID] = [:]
    private let file: URL?
    private var pendingSave: DispatchWorkItem?

    init(folder: URL?) {
        file = folder?.appendingPathComponent("prompt-log.json")
        if let file, let data = try? Data(contentsOf: file) {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            records = (try? decoder.decode([LabPromptRecord].self, from: data)) ?? []
        }
    }

    var isEmpty: Bool { records.isEmpty }

    /// First run: takes over the prompts already in the saved transcripts
    /// (undated — the transcripts don't keep times).
    func seed(from transcripts: [String: [LabModel.Message]], skipping skipped: (String) -> Bool) {
        guard records.isEmpty, file.map({ !FileManager.default.fileExists(atPath: $0.path) }) ?? false else { return }
        for (piece, messages) in transcripts.sorted(by: { $0.key < $1.key }) where !skipped(piece) {
            var current: LabPromptRecord?
            for m in messages {
                switch m.role {
                case .person:
                    if let r = current { records.append(r) }
                    current = LabPromptRecord(piece: piece, prompt: m.text)
                case .agent:
                    let gap = current?.reply.isEmpty ?? true ? "" : "\n\n"
                    current?.reply += gap + m.text
                case .tool: current?.actions.append(m.text)
                case .note, .problem: current?.outcome = m.text
                }
            }
            if let r = current { records.append(r) }
        }
        save()
    }

    // MARK: - Recording

    func began(_ prompt: String, picked: String?, in piece: String) {
        let record = LabPromptRecord(date: Date(), piece: piece, prompt: prompt, picked: picked)
        records.append(record)
        open[piece] = record.id
        scheduleSave()
    }

    func replied(_ text: String, in piece: String) {
        update(piece) { r in
            // Long answers are kept in full in the transcript; this is a record.
            guard r.reply.count < 8000 else { return }
            r.reply += (r.reply.isEmpty ? "" : "\n\n") + text
        }
    }

    func acted(_ summary: String, in piece: String) {
        update(piece) { $0.actions.append(summary) }
    }

    func ended(_ outcome: String, in piece: String) {
        update(piece) { if $0.outcome.isEmpty { $0.outcome = outcome } }
        open[piece] = nil
    }

    private func update(_ piece: String, _ change: (inout LabPromptRecord) -> Void) {
        guard let id = open[piece], let i = records.lastIndex(where: { $0.id == id }) else { return }
        change(&records[i])
        scheduleSave()
    }

    private func scheduleSave() {
        pendingSave?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.save() }
        pendingSave = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
    }

    func save() {
        guard let file else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let data = try? encoder.encode(records) { try? data.write(to: file, options: .atomic) }
    }

    // MARK: - Export

    /// Asks where to save (Downloads by default), then writes the workbook.
    func export(site: String) {
        save()
        let stamp = Self.day.string(from: Date())
        let panel = NSSavePanel()
        panel.title = "Export Lab Prompts"
        panel.nameFieldStringValue = "\(site) Lab prompts \(stamp).xlsx"
        if let xlsx = UTType(filenameExtension: "xlsx") { panel.allowedContentTypes = [xlsx] }
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try XLSXWriter.write(sheet: "Prompts", headers: Self.headers, widths: Self.widths, rows: rows(), to: url)
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } catch {
            let alert = NSAlert()
            alert.messageText = "The prompts couldn’t be exported."
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }

    private static let headers = ["No.", "Date", "Piece", "Prompt", "Picked element", "Claude’s reply", "What it did", "Outcome"]
    private static let widths: [Double] = [6, 18, 16, 60, 30, 60, 36, 24]
    private static let day: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f }()
    private static let stamp: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f }()

    private func rows() -> [[String]] {
        records.enumerated().map { i, r in
            [String(i + 1), r.date.map(Self.stamp.string) ?? "", r.piece, r.prompt, r.picked ?? "",
             r.reply, r.actions.joined(separator: "\n"), r.outcome]
        }
    }
}

/// A minimal one-sheet .xlsx: inline strings, a bold frozen header row with
/// a filter, wrapped text, set column widths. Zipped with /usr/bin/zip.
enum XLSXWriter {
    static func write(sheet: String, headers: [String], widths: [Double], rows: [[String]], to url: URL) throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory.appendingPathComponent("xlsx-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: dir) }
        let files: [String: String] = [
            "[Content_Types].xml": """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\
            <Default Extension="xml" ContentType="application/xml"/>\
            <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\
            <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\
            <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\
            </Types>
            """,
            "_rels/.rels": """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\
            </Relationships>
            """,
            "xl/workbook.xml": """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\
            <sheets><sheet name="\(escape(sheet))" sheetId="1" r:id="rId1"/></sheets>\
            <definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\(escape(sheet))!$A$1:$\(column(headers.count - 1))$\(rows.count + 1)</definedName></definedNames>\
            </workbook>
            """,
            "xl/_rels/workbook.xml.rels": """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\
            <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\
            </Relationships>
            """,
            // Style 1: body (Arial 10, top-aligned, wrapped); 2: header
            // (bold white on dark green, wrapped).
            "xl/styles.xml": """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\
            <fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>\
            <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>\
            <fill><patternFill patternType="solid"><fgColor rgb="FF2F3E37"/><bgColor indexed="64"/></patternFill></fill></fills>\
            <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>\
            <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>\
            <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>\
            <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>\
            <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>\
            <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>\
            </styleSheet>
            """,
            "xl/worksheets/sheet1.xml": sheetXML(headers: headers, widths: widths, rows: rows),
        ]
        for (path, text) in files {
            let file = dir.appendingPathComponent(path)
            try fm.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(text.utf8).write(to: file)
        }
        let zipped = dir.appendingPathComponent("out.xlsx")
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/zip")
        p.currentDirectoryURL = dir
        p.arguments = ["-X", "-q", "-r", zipped.path, "[Content_Types].xml", "_rels", "xl"]
        try p.run()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { throw PublishError("zip failed (\(p.terminationStatus))") }
        if fm.fileExists(atPath: url.path) { try fm.removeItem(at: url) }
        try fm.moveItem(at: zipped, to: url)
    }

    private static func sheetXML(headers: [String], widths: [Double], rows: [[String]]) -> String {
        func row(_ cells: [String], _ r: Int, style: Int) -> String {
            let body = cells.enumerated().map { c, v in
                "<c r=\"\(column(c))\(r)\" s=\"\(style)\" t=\"inlineStr\"><is><t xml:space=\"preserve\">\(escape(v))</t></is></c>"
            }.joined()
            return "<row r=\"\(r)\">\(body)</row>"
        }
        let cols = widths.enumerated().map { "<col min=\"\($0 + 1)\" max=\"\($0 + 1)\" width=\"\($1)\" customWidth=\"1\"/>" }.joined()
        let data = ([row(headers, 1, style: 2)] + rows.enumerated().map { row($1, $0 + 2, style: 1) }).joined()
        return """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\
        <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>\
        <cols>\(cols)</cols><sheetData>\(data)</sheetData>\
        <autoFilter ref="A1:\(column(headers.count - 1))\(rows.count + 1)"/>\
        </worksheet>
        """
    }

    /// 0 → A, 25 → Z, 26 → AA.
    private static func column(_ i: Int) -> String {
        var n = i + 1, s = ""
        while n > 0 { n -= 1; s = String(UnicodeScalar(65 + n % 26)!) + s; n /= 26 }
        return s
    }

    /// XML-escaped, without the control characters XML can't carry; Excel
    /// caps a cell at 32,767 characters.
    private static func escape(_ s: String) -> String {
        var out = ""
        for scalar in s.unicodeScalars.prefix(32_000) {
            switch scalar {
            case "&": out += "&amp;"
            case "<": out += "&lt;"
            case ">": out += "&gt;"
            case "\"": out += "&quot;"
            case "\t", "\n", "\r": out.unicodeScalars.append(scalar)
            default: if scalar.value >= 0x20 { out.unicodeScalars.append(scalar) }
            }
        }
        return out
    }
}
