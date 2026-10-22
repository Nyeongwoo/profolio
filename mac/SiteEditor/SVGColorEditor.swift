import SwiftUI
import WebKit

/// A fill or stroke: none, a solid colour, or a linear / radial gradient.
/// Gradients are written in the shape's own box (objectBoundingBox): angle
/// in degrees for linear (0° left → right, 90° top → bottom), centre and
/// radius as fractions of the box for radial.
struct SVGPaint: Equatable {
    enum Kind: String, CaseIterable, Identifiable {
        case none = "None", solid = "Solid", linear = "Linear", radial = "Radial"
        var id: String { rawValue }
    }
    struct Stop: Equatable, Identifiable {
        var id = UUID()
        var offset: Double
        var color: String
        var opacity: Double
    }
    var kind: Kind = .none
    var color = "#000000"
    var opacity = 1.0
    var stops: [Stop] = []
    var angle = 90.0
    var cx = 0.5, cy = 0.5, r = 0.5

    init() {}

    init(_ d: [String: Any]?) {
        guard let d else { return }
        switch d["type"] as? String {
        case "solid": kind = .solid
        case "linear": kind = .linear
        case "radial": kind = .radial
        default: kind = .none
        }
        color = d["color"] as? String ?? color
        opacity = (d["opacity"] as? NSNumber)?.doubleValue ?? 1
        angle = (d["angle"] as? NSNumber)?.doubleValue ?? 90
        cx = (d["cx"] as? NSNumber)?.doubleValue ?? 0.5
        cy = (d["cy"] as? NSNumber)?.doubleValue ?? 0.5
        r = (d["r"] as? NSNumber)?.doubleValue ?? 0.5
        stops = (d["stops"] as? [[String: Any]] ?? []).map {
            Stop(offset: ($0["offset"] as? NSNumber)?.doubleValue ?? 0, color: $0["color"] as? String ?? "#000000",
                 opacity: ($0["opacity"] as? NSNumber)?.doubleValue ?? 1)
        }
    }

    var json: [String: Any] {
        let type: String = switch kind { case .none: "none"; case .solid: "solid"; case .linear: "linear"; case .radial: "radial" }
        return ["type": type, "color": color, "opacity": opacity, "angle": angle, "cx": cx, "cy": cy, "r": r,
                "stops": stops.sorted { $0.offset < $1.offset }.map { ["offset": $0.offset, "color": $0.color, "opacity": $0.opacity] }]
    }

    /// Switching kinds keeps what it can: a solid becomes a two-stop
    /// gradient from its colour, a gradient a solid of its first stop.
    mutating func become(_ new: Kind) {
        if (new == .linear || new == .radial), stops.count < 2 {
            let base = kind == .solid ? color : (stops.first?.color ?? "#6fcb98")
            stops = [Stop(offset: 0, color: base, opacity: 1), Stop(offset: 1, color: SVGColor.shade(base, by: -0.35), opacity: 1)]
        }
        if new == .solid, kind == .linear || kind == .radial, let first = stops.first {
            color = first.color
            opacity = first.opacity
        }
        kind = new
    }
}

enum SVGColor {
    static func color(_ hex: String, _ opacity: Double = 1) -> Color {
        Color(nsColor: ns(hex).withAlphaComponent(opacity))
    }

    static func ns(_ hex: String) -> NSColor {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        let v = UInt32(s.prefix(6), radix: 16) ?? 0
        return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
    }

    /// A Color back to "#rrggbb" and its opacity.
    static func hex(_ color: Color) -> (String, Double) {
        let c = NSColor(color).usingColorSpace(.sRGB) ?? .black
        let h = String(format: "#%02x%02x%02x", Int(round(c.redComponent * 255)), Int(round(c.greenComponent * 255)), Int(round(c.blueComponent * 255)))
        return (h, Double(c.alphaComponent))
    }

    /// Lighter (amount > 0) or darker.
    static func shade(_ hex: String, by amount: CGFloat) -> String {
        let c = ns(hex)
        let target: CGFloat = amount > 0 ? 1 : 0
        let k = abs(amount)
        let mix = { (x: CGFloat) in Int(round((x + (target - x) * k) * 255)) }
        return String(format: "#%02x%02x%02x", mix(c.redComponent), mix(c.greenComponent), mix(c.blueComponent))
    }
}

/// The Lab's SVG colour editor: opens one of the piece's .svg files in its
/// own web view, where shapes are clicked to select them, and recolours
/// their fill or stroke — solid or gradient — writing the file on Save.
@MainActor
final class SVGPaintEditor: NSObject, ObservableObject, WKScriptMessageHandler {
    struct Swatch: Identifiable, Hashable { let hex: String; let count: Int; var id: String { hex } }

    let webView: WKWebView
    @Published private(set) var files: [String] = []
    @Published private(set) var file: String?
    @Published private(set) var dirty = false
    @Published private(set) var selectionLabel: String?
    @Published private(set) var canUndo = false
    @Published private(set) var palette: [Swatch] = []
    @Published var fill = SVGPaint()
    @Published var stroke = SVGPaint()
    @Published var strokeWidth: Double = 0
    @Published var zoom: Double = 0 { didSet { webView.evaluateJavaScript("pf.zoom(\(zoom))") } }   // 0 = fit

    /// The piece's folder (package site/public/lab/<slug>).
    private var folder: URL?
    private var ready = false
    private var pendingText: String?
    var onSaved: (() -> Void)?

    override init() {
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = true
        super.init()
        let relay = WeakRelay()
        relay.target = self
        config.userContentController.add(relay, name: "svgPaint")
        webView.loadHTMLString(Self.page, baseURL: nil)
    }

    /// Lists the piece's SVG files; keeps the open one if it's still there.
    func show(folder: URL?) {
        if self.folder != folder { self.folder = folder; file = nil; dirty = false; clearSelection() }
        guard let folder else { files = []; return }
        let fm = FileManager.default
        let base = folder.standardizedFileURL.path + "/"
        var found: [String] = []
        if let walker = fm.enumerator(at: folder, includingPropertiesForKeys: nil) {
            for case let url as URL in walker where url.pathExtension.lowercased() == "svg" {
                found.append(String(url.standardizedFileURL.path.dropFirst(base.count)))
            }
        }
        files = found.sorted { ($0.contains("/") ? 1 : 0, $0) < ($1.contains("/") ? 1 : 0, $1) }
        if file == nil, let first = files.first { open(first) }
    }

    func open(_ name: String) {
        guard name != file else { return }
        guard confirmLeaving() else { return }
        guard let folder, let text = try? String(contentsOf: folder.appendingPathComponent(name), encoding: .utf8) else { return }
        file = name
        dirty = false
        clearSelection()
        load(text)
    }

    private func load(_ text: String) {
        guard ready else { pendingText = text; return }
        let arg = String(decoding: (try? JSONSerialization.data(withJSONObject: [text])) ?? Data("[\"\"]".utf8), as: UTF8.self)
        webView.evaluateJavaScript("pf.load(\(arg)[0]); pf.zoom(\(zoom))")
    }

    /// Unsaved changes: asks to save them first. False means stay.
    func confirmLeaving() -> Bool {
        guard dirty, let file else { return true }
        let alert = NSAlert()
        alert.messageText = "Save the colour changes to \(file)?"
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Don’t Save")
        alert.addButton(withTitle: "Cancel")
        switch alert.runModal() {
        case .alertFirstButtonReturn: save(); return true
        case .alertSecondButtonReturn: dirty = false; return true
        default: return false
        }
    }

    private func clearSelection() {
        selectionLabel = nil
        fill = SVGPaint()
        stroke = SVGPaint()
        strokeWidth = 0
    }

    // MARK: - Commands

    func apply(_ kind: String) {
        let paint = kind == "fill" ? fill : stroke
        guard let data = try? JSONSerialization.data(withJSONObject: paint.json) else { return }
        webView.evaluateJavaScript("pf.apply('\(kind)', \(String(decoding: data, as: UTF8.self)))")
    }

    func applyStrokeWidth() { webView.evaluateJavaScript("pf.strokeWidth(\(strokeWidth))") }
    func selectGroup() { webView.evaluateJavaScript("pf.selectParent()") }
    func selectSameColor() { webView.evaluateJavaScript("pf.selectSame()") }
    func selectColor(_ hex: String) { webView.evaluateJavaScript("pf.selectColor('\(hex)')") }
    func deselect() { webView.evaluateJavaScript("pf.select([])") }
    func undo() { webView.evaluateJavaScript("pf.undo()") }

    func revert() {
        guard let file, let folder, let text = try? String(contentsOf: folder.appendingPathComponent(file), encoding: .utf8) else { return }
        dirty = false
        clearSelection()
        load(text)
    }

    func save() {
        guard let file, let folder else { return }
        let url = folder.appendingPathComponent(file)
        webView.evaluateJavaScript("pf.serialize()") { [weak self] result, _ in
            MainActor.assumeIsolated {
                guard let self, let text = result as? String, !text.isEmpty else { return }
                do {
                    try text.write(to: url, atomically: true, encoding: .utf8)
                    self.dirty = false
                    self.onSaved?()
                } catch {
                    let alert = NSAlert()
                    alert.messageText = "\(file) couldn’t be saved."
                    alert.informativeText = error.localizedDescription
                    alert.runModal()
                }
            }
        }
    }

    // MARK: - Messages from the page

    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        MainActor.assumeIsolated {
            switch type {
            case "ready":
                ready = true
                if let text = pendingText { pendingText = nil; load(text) }
            case "selection":
                selectionLabel = body["label"] as? String
                fill = SVGPaint(body["fill"] as? [String: Any])
                stroke = SVGPaint(body["stroke"] as? [String: Any])
                strokeWidth = (body["strokeWidth"] as? NSNumber)?.doubleValue ?? 0
            case "palette":
                palette = (body["colors"] as? [[String: Any]] ?? []).compactMap {
                    guard let hex = $0["hex"] as? String else { return nil }
                    return Swatch(hex: hex, count: ($0["count"] as? NSNumber)?.intValue ?? 0)
                }
            case "changed":
                dirty = true
                canUndo = body["canUndo"] as? Bool ?? true
            case "undo":
                canUndo = body["canUndo"] as? Bool ?? false
                dirty = true
            default: break
            }
        }
    }

    // MARK: - The page

    /// The editing page: the SVG, parsed and shown as-is (sizing is page
    /// CSS only, so nothing about the file changes but the paint edited);
    /// clicks select shapes, outlined in orange.
    private static let page = #"""
    <!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;min-height:100%;background:#ececec;-webkit-user-select:none;font:12px -apple-system}
    #host{box-sizing:border-box;min-height:100vh;padding:28px;display:flex;align-items:center;justify-content:center}
    #host svg{display:block;max-width:100%;max-height:calc(100vh - 56px);height:auto;width:auto;cursor:crosshair;
      background:repeating-conic-gradient(#fff 0 25%,#f4f4f4 0 50%) 0 0/16px 16px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
    #host.zoomed svg{max-width:none;max-height:none}
    .mark{position:absolute;pointer-events:none;border:1.5px solid #ff6a1f;background:rgba(255,106,31,.06);border-radius:2px}
    .hover{position:absolute;pointer-events:none;border:1px dashed rgba(255,106,31,.8);border-radius:2px;display:none}
    </style></head><body><div id="host"></div><div id="marks"></div><div class="hover" id="hover"></div><script>
    (() => {
      const NS = 'http://www.w3.org/2000/svg'
      const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line,text,use'
      const host = document.getElementById('host'), marks = document.getElementById('marks'), hover = document.getElementById('hover')
      let svg = null, natural = null, picked = [], targets = { fill: [], stroke: [] }, history = [], lastSnap = 0, seq = 0
      const post = (type, body = {}) => window.webkit.messageHandlers.svgPaint.postMessage({ type, ...body })
      const inert = el => !!el.closest('defs,clipPath,mask,pattern,marker,symbol')
      const isShape = el => el.matches(SHAPES)
      const shapesIn = el => isShape(el) ? [el] : [...el.querySelectorAll(SHAPES)].filter(n => !inert(n))
      const area = el => { try { const b = el.getBBox(); return b.width * b.height } catch { return 0 } }
      const byId = id => svg.querySelector('[id="' + id.replace(/"/g, '') + '"]')

      // CSS colour → { hex, alpha }
      const cv = document.createElement('canvas').getContext('2d')
      const toHex = c => {
        if (!c || c === 'none' || c === 'transparent') return null
        cv.fillStyle = '#000'; cv.fillStyle = c
        const v = cv.fillStyle
        if (v[0] === '#') return { hex: v, alpha: 1 }
        const m = v.match(/[\d.]+/g)
        if (!m) return null
        return { hex: '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join(''), alpha: m[3] != null ? +m[3] : 1 }
      }
      const rawPaint = (el, kind) => el.style.getPropertyValue(kind) || el.getAttribute(kind) || getComputedStyle(el)[kind] || ''
      const refOf = (el, kind) => { const m = /url\(\s*["']?#([^"')]+)/.exec(rawPaint(el, kind)); return m ? m[1] : null }
      const num = (v, d) => { if (v == null || v === '') return d; v = String(v).trim(); return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) }

      function stopsOf(g) {
        let src = g
        for (let i = 0; i < 4 && src && !src.querySelector('stop'); i++) {
          const h = src.getAttribute('href') || src.getAttribute('xlink:href')
          src = h ? byId(h.slice(1)) : null
        }
        return src ? [...src.querySelectorAll('stop')].map(s => {
          const cs = getComputedStyle(s)
          const c = toHex(s.getAttribute('stop-color') || s.style.stopColor || cs.stopColor) || { hex: '#000000', alpha: 1 }
          return { offset: num(s.getAttribute('offset'), 0), color: c.hex, opacity: num(s.getAttribute('stop-opacity') ?? cs.stopOpacity, 1) * c.alpha }
        }) : []
      }

      function paintOf(el, kind) {
        if (!el) return { type: 'none' }
        const id = refOf(el, kind)
        if (id) {
          const g = byId(id)
          if (g && /gradient/i.test(g.tagName)) {
            const p = { type: /radial/i.test(g.tagName) ? 'radial' : 'linear', stops: stopsOf(g) }
            if (p.type === 'linear') {
              const x1 = num(g.getAttribute('x1'), 0), y1 = num(g.getAttribute('y1'), 0), x2 = num(g.getAttribute('x2'), 1), y2 = num(g.getAttribute('y2'), 0)
              p.angle = Math.round(((Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) + 360) % 360)
            } else if ((g.getAttribute('gradientUnits') || 'objectBoundingBox') === 'objectBoundingBox') {
              p.cx = num(g.getAttribute('cx'), .5); p.cy = num(g.getAttribute('cy'), .5); p.r = num(g.getAttribute('r'), .5)
            }
            return p
          }
        }
        const c = toHex(rawPaint(el, kind))
        if (!c) return { type: 'none' }
        const op = num(el.getAttribute(kind + '-opacity') ?? getComputedStyle(el)[kind + 'Opacity'], 1)
        return { type: 'solid', color: c.hex, opacity: +(op * c.alpha).toFixed(3) }
      }
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

      // ── selection ──
      function select(list, additive) {
        picked = additive ? [...new Set([...picked, ...list])] : list
        // A group recolours its shapes that share its main shape's paint
        // (so a leaf's body changes, not the text on it).
        const pick = kind => {
          const out = new Set()
          for (const el of picked) {
            const shapes = shapesIn(el)
            if (shapes.length <= 1 || isShape(el)) { shapes.forEach(s => out.add(s)); continue }
            const main = shapes.filter(s => paintOf(s, kind).type !== 'none').sort((a, b) => area(b) - area(a))[0]
            if (!main) continue
            const p = paintOf(main, kind)
            shapes.filter(s => same(paintOf(s, kind), p)).forEach(s => out.add(s))
          }
          return [...out]
        }
        targets = { fill: pick('fill'), stroke: pick('stroke') }
        if (!targets.stroke.length) targets.stroke = targets.fill.slice()
        draw()
        report()
      }
      function report() {
        const first = targets.fill[0] || targets.stroke[0]
        if (!picked.length) return post('selection', {})
        const one = picked.length === 1 ? picked[0] : null
        const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        const label = one ? name(one) + (targets.fill.length > 1 ? ' — ' + targets.fill.length + ' shapes' : '')
                          : picked.length + ' selected — ' + targets.fill.length + ' shapes'
        post('selection', { label, fill: paintOf(targets.fill[0], 'fill'), stroke: paintOf(targets.stroke[0], 'stroke'),
                            strokeWidth: first ? num(first.getAttribute('stroke-width') ?? getComputedStyle(first).strokeWidth, 0) : 0 })
      }
      function box(el, cls) {
        const r = el.getBoundingClientRect(), d = document.createElement('div')
        d.className = cls
        Object.assign(d.style, { left: r.left + scrollX - 2 + 'px', top: r.top + scrollY - 2 + 'px', width: r.width + 'px', height: r.height + 'px' })
        return d
      }
      function draw() { marks.replaceChildren(...targets.fill.slice(0, 400).map(el => box(el, 'mark'))) }
      addEventListener('scroll', draw); addEventListener('resize', draw)

      host.addEventListener('click', e => {
        if (!svg) return
        const el = e.target.closest ? e.target : null
        if (!el || el === svg || !svg.contains(el) || inert(el)) { if (!e.shiftKey) select([]); return }
        if (e.shiftKey && picked.includes(el)) return select(picked.filter(p => p !== el))
        select([el], e.shiftKey)
      })
      host.addEventListener('mousemove', e => {
        const el = e.target
        if (!svg || el === svg || !svg.contains(el) || inert(el)) { hover.style.display = 'none'; return }
        const r = el.getBoundingClientRect()
        Object.assign(hover.style, { display: 'block', left: r.left + scrollX - 2 + 'px', top: r.top + scrollY - 2 + 'px', width: r.width + 'px', height: r.height + 'px' })
      })
      host.addEventListener('mouseleave', () => { hover.style.display = 'none' })

      // ── edits ──
      function snapshot() {
        const now = Date.now()
        if (now - lastSnap > 700) { history.push(new XMLSerializer().serializeToString(svg)); if (history.length > 40) history.shift() }
        lastSnap = now
      }
      const users = id => [...svg.querySelectorAll('*')].filter(n => ['fill', 'stroke'].some(k => (n.getAttribute(k) || n.style.getPropertyValue(k) || '').includes('#' + id + ')')))
      function defs() {
        let d = svg.querySelector(':scope > defs')
        if (!d) { d = document.createElementNS(NS, 'defs'); svg.insertBefore(d, svg.firstChild) }
        return d
      }
      function gradient(id, p) {
        const g = document.createElementNS(NS, p.type === 'radial' ? 'radialGradient' : 'linearGradient')
        g.setAttribute('id', id)
        if (p.type === 'radial') { g.setAttribute('cx', p.cx); g.setAttribute('cy', p.cy); g.setAttribute('r', p.r) }
        else {
          const a = p.angle * Math.PI / 180, c = Math.cos(a) / 2, s = Math.sin(a) / 2
          g.setAttribute('x1', +(0.5 - c).toFixed(4)); g.setAttribute('y1', +(0.5 - s).toFixed(4))
          g.setAttribute('x2', +(0.5 + c).toFixed(4)); g.setAttribute('y2', +(0.5 + s).toFixed(4))
        }
        for (const st of p.stops) {
          const s = document.createElementNS(NS, 'stop')
          s.setAttribute('offset', +st.offset.toFixed(4)); s.setAttribute('stop-color', st.color)
          if (st.opacity < 1) s.setAttribute('stop-opacity', +st.opacity.toFixed(3))
          g.appendChild(s)
        }
        return g
      }
      function set(el, kind, value) { el.style.removeProperty(kind); el.setAttribute(kind, value) }

      window.pf = {
        load(text) {
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
          const root = doc.documentElement
          if (!root || root.tagName.toLowerCase() !== 'svg') { host.textContent = 'This file couldn’t be read as SVG.'; return }
          svg = document.importNode(root, true)
          host.replaceChildren(svg)
          natural = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal.width : (parseFloat(svg.getAttribute('width')) || 800)
          history = []; picked = []; targets = { fill: [], stroke: [] }
          draw(); post('selection', {}); pf.palette()
        },
        zoom(z) {
          if (!svg) return
          host.classList.toggle('zoomed', z > 0)
          svg.style.width = z > 0 ? natural * z + 'px' : ''
          requestAnimationFrame(draw)
        },
        select(list) { select(list) },
        selectParent() {
          if (!picked.length) return
          const up = [...new Set(picked.map(el => el.parentElement && el.parentElement !== svg ? el.parentElement : el))]
          select(up)
        },
        selectSame() {
          const p = paintOf(targets.fill[0], 'fill')
          if (p.type === 'none') return
          select([...svg.querySelectorAll(SHAPES)].filter(n => !inert(n) && same(paintOf(n, 'fill'), p)))
        },
        selectColor(hex) {
          select([...svg.querySelectorAll(SHAPES)].filter(n => { if (inert(n)) return false; const p = paintOf(n, 'fill'); return p.type === 'solid' && p.color === hex }))
        },
        apply(kind, p) {
          const list = targets[kind]
          if (!svg || !list.length) return
          snapshot()
          if (p.type === 'none') list.forEach(el => { set(el, kind, 'none'); el.removeAttribute(kind + '-opacity') })
          else if (p.type === 'solid') list.forEach(el => {
            set(el, kind, p.color)
            el.style.removeProperty(kind + '-opacity')
            if (p.opacity < 1) el.setAttribute(kind + '-opacity', +p.opacity.toFixed(3)); else el.removeAttribute(kind + '-opacity')
          })
          else {
            // Reuse the gradient these shapes already share when nothing
            // else uses it; otherwise make one for them.
            const ids = [...new Set(list.map(el => refOf(el, kind)))]
            let id = ids.length === 1 && ids[0] && users(ids[0]).every(u => list.includes(u)) ? ids[0] : null
            const old = id && byId(id)
            if (!id) id = 'pf-' + Date.now().toString(36) + (seq++)
            const g = gradient(id, p)
            if (old && /gradient/i.test(old.tagName)) old.replaceWith(g); else defs().appendChild(g)
            list.forEach(el => { set(el, kind, 'url(#' + id + ')'); el.removeAttribute(kind + '-opacity') })
          }
          post('changed', { canUndo: history.length > 0 })
          draw()
        },
        strokeWidth(w) {
          if (!svg || !targets.stroke.length) return
          snapshot()
          targets.stroke.forEach(el => { el.style.removeProperty('stroke-width'); w > 0 ? el.setAttribute('stroke-width', w) : el.removeAttribute('stroke-width') })
          post('changed', { canUndo: history.length > 0 })
        },
        undo() {
          const prev = history.pop()
          if (!prev) return
          // Keep the selection: each picked element by its place in the tree.
          const pathOf = el => { const p = []; for (let e = el; e && e !== svg; e = e.parentElement) p.unshift([...e.parentElement.children].indexOf(e)); return p }
          const keep = picked.map(pathOf)
          const z = svg.style.width
          svg = document.importNode(new DOMParser().parseFromString(prev, 'image/svg+xml').documentElement, true)
          svg.style.width = z
          host.replaceChildren(svg)
          lastSnap = 0
          select(keep.map(p => p.reduce((e, i) => e && e.children[i], svg)).filter(Boolean))
          post('undo', { canUndo: history.length > 0 }); pf.palette()
        },
        palette() {
          if (!svg) return
          const counts = new Map()
          for (const n of svg.querySelectorAll(SHAPES)) {
            if (inert(n)) continue
            const p = paintOf(n, 'fill')
            if (p.type === 'solid') counts.set(p.color, (counts.get(p.color) || 0) + 1)
          }
          post('palette', { colors: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 48).map(([hex, count]) => ({ hex, count })) })
        },
        serialize() {
          if (!svg) return ''
          // Gradients this editor made that nothing uses any more go.
          svg.querySelectorAll('[id^="pf-"]').forEach(g => { if (/gradient/i.test(g.tagName) && !users(g.id).length) g.remove() })
          const out = svg.cloneNode(true)
          out.style.removeProperty('width')
          if (!out.getAttribute('style')) out.removeAttribute('style')
          pf.palette()
          return new XMLSerializer().serializeToString(out) + '\n'
        },
      }
      post('ready')
    })()
    </script></body></html>
    """#
}

/// Passes script messages on without keeping their target alive.
private final class WeakRelay: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

// MARK: - Views

/// Colors mode of the Lab: the piece's SVG files, the open one, and its paint.
struct SVGColorEditorView: View {
    @ObservedObject var editor: SVGPaintEditor

    var body: some View {
        HStack(spacing: 0) {
            List(selection: Binding(get: { editor.file }, set: { if let f = $0 { editor.open(f) } })) {
                Section("SVG files") {
                    ForEach(editor.files, id: \.self) { f in
                        Label(f, systemImage: "scribble.variable").lineLimit(1).truncationMode(.middle).tag(f)
                    }
                }
            }
            .listStyle(.sidebar)
            .frame(width: 200)
            .overlay {
                if editor.files.isEmpty {
                    Text("This piece has no SVG files.").font(.callout).foregroundStyle(.secondary).padding()
                }
            }
            Divider()
            WebViewHost(webView: editor.webView)
            Divider()
            SVGPaintPanel(editor: editor)
                .frame(width: 300)
        }
    }
}

private struct SVGPaintPanel: View {
    @ObservedObject var editor: SVGPaintEditor

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Text(editor.file ?? "No file").font(.headline).lineLimit(1).truncationMode(.middle)
                if editor.dirty { Circle().fill(.orange).frame(width: 6, height: 6).help("Unsaved changes") }
                Spacer()
                Button { editor.undo() } label: { Image(systemName: "arrow.uturn.backward") }
                    .disabled(!editor.canUndo).help("Undo")
                Button("Revert") { editor.revert() }.disabled(!editor.dirty)
                Button("Save") { editor.save() }.buttonStyle(.borderedProminent).disabled(!editor.dirty)
            }
            .controlSize(.small)
            .padding(12)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Zoom", selection: $editor.zoom) {
                        Text("Fit").tag(0.0); Text("50%").tag(0.5); Text("100%").tag(1.0); Text("200%").tag(2.0)
                    }
                    .pickerStyle(.segmented)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(editor.selectionLabel ?? "Click a shape to select it. Shift-click adds more.")
                            .font(.callout).foregroundStyle(editor.selectionLabel == nil ? .secondary : .primary)
                        HStack {
                            Button("Group") { editor.selectGroup() }.help("Select the group the selection is in")
                            Button("Same Color") { editor.selectSameColor() }.help("Select every shape with this fill")
                            Button("Deselect") { editor.deselect() }
                        }
                        .controlSize(.small)
                        .disabled(editor.selectionLabel == nil)
                    }

                    if editor.selectionLabel != nil {
                        PaintEditor(title: "Fill", paint: $editor.fill) { editor.apply("fill") }
                        PaintEditor(title: "Stroke", paint: $editor.stroke) { editor.apply("stroke") }
                        if editor.stroke.kind != .none {
                            HStack {
                                Text("Stroke width").font(.callout)
                                Slider(value: Binding(get: { editor.strokeWidth }, set: { editor.strokeWidth = $0; editor.applyStrokeWidth() }), in: 0...40)
                                Text(String(format: "%.1f", editor.strokeWidth)).monospacedDigit().frame(width: 34, alignment: .trailing)
                            }
                        }
                    }

                    if !editor.palette.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Colors in this file").font(.subheadline.weight(.semibold))
                            Text("Click one to select every shape filled with it.").font(.caption).foregroundStyle(.secondary)
                            LazyVGrid(columns: Array(repeating: GridItem(.fixed(28), spacing: 6), count: 8), spacing: 6) {
                                ForEach(editor.palette) { s in
                                    Button { editor.selectColor(s.hex) } label: {
                                        RoundedRectangle(cornerRadius: 5).fill(SVGColor.color(s.hex))
                                            .frame(width: 28, height: 28)
                                            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color.primary.opacity(0.15)))
                                    }
                                    .buttonStyle(.plain)
                                    .help("\(s.hex) — \(s.count) shape\(s.count == 1 ? "" : "s")")
                                }
                            }
                        }
                    }
                }
                .padding(12)
            }
        }
        .background(.background)
    }
}

/// One paint (fill or stroke): kind, then a colour or a gradient's stops,
/// angle or centre. Every change is applied at once.
private struct PaintEditor: View {
    let title: String
    @Binding var paint: SVGPaint
    let changed: () -> Void

    private func update(_ change: (inout SVGPaint) -> Void) {
        change(&paint)
        changed()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline.weight(.semibold))
            Picker(title, selection: Binding(get: { paint.kind }, set: { k in update { $0.become(k) } })) {
                ForEach(SVGPaint.Kind.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            switch paint.kind {
            case .none:
                EmptyView()
            case .solid:
                ColorPicker("Color", selection: Binding(
                    get: { SVGColor.color(paint.color, paint.opacity) },
                    set: { c in let (h, a) = SVGColor.hex(c); update { $0.color = h; $0.opacity = a } }))
                Text(paint.color + (paint.opacity < 1 ? String(format: " · %.0f%%", paint.opacity * 100) : ""))
                    .font(.caption.monospaced()).foregroundStyle(.secondary)
            case .linear, .radial:
                gradientPreview
                if paint.kind == .linear {
                    slider("Angle", value: \.angle, in: 0...360, format: "%.0f°")
                } else {
                    slider("Center X", value: \.cx, in: 0...1, format: "%.2f")
                    slider("Center Y", value: \.cy, in: 0...1, format: "%.2f")
                    slider("Radius", value: \.r, in: 0.05...1.5, format: "%.2f")
                }
                Text("Stops").font(.caption).foregroundStyle(.secondary)
                ForEach(paint.stops.indices, id: \.self) { i in
                    HStack(spacing: 6) {
                        ColorPicker("", selection: Binding(
                            get: { SVGColor.color(paint.stops[i].color, paint.stops[i].opacity) },
                            set: { c in let (h, a) = SVGColor.hex(c); update { $0.stops[i].color = h; $0.stops[i].opacity = a } }))
                            .labelsHidden()
                        Slider(value: Binding(get: { paint.stops[i].offset }, set: { v in update { $0.stops[i].offset = v } }), in: 0...1)
                        Text(String(format: "%.0f%%", paint.stops[i].offset * 100)).monospacedDigit().frame(width: 36, alignment: .trailing)
                        Button { update { $0.stops.remove(at: i) } } label: { Image(systemName: "minus.circle") }
                            .buttonStyle(.borderless).disabled(paint.stops.count <= 2)
                    }
                }
                Button {
                    update { p in
                        let sorted = p.stops.sorted { $0.offset < $1.offset }
                        let mid = sorted.count >= 2 ? (sorted[sorted.count - 2].offset + sorted[sorted.count - 1].offset) / 2 : 0.5
                        p.stops.append(.init(offset: mid, color: sorted.last?.color ?? "#ffffff", opacity: 1))
                    }
                } label: { Label("Add Stop", systemImage: "plus") }
                .controlSize(.small)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.06)))
    }

    private var gradientPreview: some View {
        let stops = paint.stops.sorted { $0.offset < $1.offset }.map { Gradient.Stop(color: SVGColor.color($0.color, $0.opacity), location: $0.offset) }
        let shape = RoundedRectangle(cornerRadius: 6)
        return Group {
            if paint.kind == .linear {
                let a = paint.angle * .pi / 180
                shape.fill(LinearGradient(stops: stops, startPoint: UnitPoint(x: 0.5 - cos(a) / 2, y: 0.5 - sin(a) / 2),
                                          endPoint: UnitPoint(x: 0.5 + cos(a) / 2, y: 0.5 + sin(a) / 2)))
            } else {
                shape.fill(RadialGradient(stops: stops, center: UnitPoint(x: paint.cx, y: paint.cy), startRadius: 0, endRadius: 60 * paint.r * 2))
            }
        }
        .frame(height: 36)
        .overlay(shape.stroke(Color.primary.opacity(0.12)))
    }

    private func slider(_ label: String, value: WritableKeyPath<SVGPaint, Double>, in range: ClosedRange<Double>, format: String) -> some View {
        HStack {
            Text(label).font(.callout).frame(width: 64, alignment: .leading)
            Slider(value: Binding(get: { paint[keyPath: value] }, set: { v in update { $0[keyPath: value] = v } }), in: range)
            Text(String(format: format, paint[keyPath: value])).monospacedDigit().frame(width: 40, alignment: .trailing)
        }
    }
}
