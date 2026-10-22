import AppKit
import WebKit

/// A whole web page as one image, from a web view as it is now (its state,
/// tuning panel and all). WebKit only renders what is on screen, so the page
/// is scrolled a screen at a time and the shots stacked; resizing the view to
/// the page's height instead would stretch anything sized in vh.
@MainActor
enum PageCapture {
    struct Failure: LocalizedError {
        let errorDescription: String?
    }

    /// The image, and whether the page ran past the height limit and was cut.
    struct Result {
        let image: CGImage
        let truncated: Bool
    }

    /// Pages are captured down to `maxHeight` CSS pixels; the image is at
    /// most `maxPixelHeight` tall (taller pages come out at a lower scale).
    static let maxHeight = 60_000.0
    static let maxPixelHeight = 30_000.0

    static func fullPage(of webView: WKWebView) async throws -> Result {
        let metrics = try await webView.callAsyncJavaScript(prepareScript, contentWorld: .page) as? [Double]
        guard let metrics, metrics.count == 3, metrics[0] > 0, metrics[1] > 0 else {
            throw Failure(errorDescription: "The page has nothing to capture yet.")
        }
        let (width, viewport, pageHeight) = (metrics[0], metrics[1], metrics[2])
        let total = min(pageHeight, maxHeight)
        // Pixels per CSS pixel: the screen's scale, less for very tall pages.
        let backing = webView.window?.backingScaleFactor ?? 2
        let scale = min(backing, maxPixelHeight / max(total, 1))

        do {
            var tiles: [(y: Double, image: CGImage)] = []
            var target = 0.0
            while true {
                let y = try await scroll(webView, to: min(target, max(0, total - viewport)))
                // Lazy images, fonts and reveal-on-scroll effects settle.
                try await Task.sleep(nanoseconds: 300_000_000)
                tiles.append((y, try await snapshot(webView, width: width * scale / backing)))
                if tiles.count == 1 {
                    // Headers and other bars pinned to the screen would show
                    // in every shot; keep them in the first one only.
                    _ = try await webView.callAsyncJavaScript(hidePinnedScript, contentWorld: .page)
                }
                // Done at the bottom, or when the page doesn't scroll (its
                // content lives in an inner scrolling box).
                if y + viewport >= total - 0.5 || (tiles.count > 1 && y <= tiles[tiles.count - 2].y) { break }
                target = y + viewport
            }
            _ = try? await webView.callAsyncJavaScript(restoreScript, contentWorld: .page)
            let height = min(total, (tiles.map { $0.y }.max() ?? 0) + viewport)
            return Result(image: try stitch(tiles, cssHeight: height, cssWidth: width), truncated: pageHeight > maxHeight)
        } catch {
            _ = try? await webView.callAsyncJavaScript(restoreScript, contentWorld: .page)
            throw error
        }
    }

    /// Scrolls, waits two frames for the page to paint, returns where it got to.
    private static func scroll(_ webView: WKWebView, to y: Double) async throws -> Double {
        let result = try await webView.callAsyncJavaScript(
            "scrollTo(0, y); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return scrollY",
            arguments: ["y": y], contentWorld: .page)
        return (result as? Double) ?? y
    }

    private static func snapshot(_ webView: WKWebView, width: Double) async throws -> CGImage {
        let config = WKSnapshotConfiguration()
        config.rect = webView.bounds
        config.snapshotWidth = NSNumber(value: width)
        config.afterScreenUpdates = true
        let image = try await webView.takeSnapshot(configuration: config)
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            throw Failure(errorDescription: "The preview couldn’t be captured.")
        }
        return cg
    }

    private static func stitch(_ tiles: [(y: Double, image: CGImage)], cssHeight: Double, cssWidth: Double) throws -> CGImage {
        guard let first = tiles.first?.image else { throw Failure(errorDescription: "Nothing was captured.") }
        let pixelsPerCSS = Double(first.width) / cssWidth
        let width = first.width
        let height = Int((cssHeight * pixelsPerCSS).rounded())
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw Failure(errorDescription: "The page is too large to capture.")
        }
        // Core Graphics counts from the bottom; later shots go over the
        // overlap the last one may have with the one before.
        for tile in tiles {
            let top = tile.y * pixelsPerCSS
            context.draw(tile.image, in: CGRect(x: 0, y: Double(height) - top - Double(tile.image.height),
                                                width: Double(tile.image.width), height: Double(tile.image.height)))
        }
        guard let image = context.makeImage() else { throw Failure(errorDescription: "The capture couldn’t be put together.") }
        return image
    }

    static func png(_ image: CGImage) -> Data? {
        NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
    }

    // Remembers the scroll position and turns smooth scrolling off; returns
    // [viewport width, viewport height, page height] in CSS pixels.
    private static let prepareScript = """
        const d = document.documentElement, b = document.body;
        window.__pfCapture = { x: scrollX, y: scrollY, behavior: d.style.scrollBehavior };
        d.style.scrollBehavior = 'auto';
        return [innerWidth, innerHeight, Math.max(d.scrollHeight, b ? b.scrollHeight : 0)];
        """

    // Pinned bars (fixed or sticky, under half the screen tall); large
    // pinned backgrounds stay, as they belong in every part of the page.
    private static let hidePinnedScript = """
        for (const el of document.querySelectorAll('body *')) {
          const s = getComputedStyle(el);
          if ((s.position === 'fixed' || s.position === 'sticky') && el.getBoundingClientRect().height < innerHeight / 2) {
            el.dataset.pfCaptureVisibility = el.style.visibility;
            el.style.visibility = 'hidden';
          }
        }
        """

    private static let restoreScript = """
        for (const el of document.querySelectorAll('[data-pf-capture-visibility]')) {
          el.style.visibility = el.dataset.pfCaptureVisibility;
          delete el.dataset.pfCaptureVisibility;
        }
        const s = window.__pfCapture;
        if (s) {
          scrollTo(s.x, s.y);
          document.documentElement.style.scrollBehavior = s.behavior;
          delete window.__pfCapture;
        }
        """
}
