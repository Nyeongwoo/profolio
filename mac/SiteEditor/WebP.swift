import Accelerate
import Foundation
import ImageIO

/// PNG → lossless WebP with the bundled libwebp (macOS can't write WebP).
/// The site's images are WebP; uploads follow suit.
enum WebP {
    /// Lossless WebP of a single-frame PNG, in sRGB; nil when `data` isn't
    /// one (animated PNGs stay PNG) or encoding fails.
    static func lossless(fromPNG data: Data) -> Data? {
        guard data.starts(with: [0x89, 0x50, 0x4E, 0x47]),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) == 1,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let srgb = CGColorSpace(name: CGColorSpace.sRGB),
              // Unpremultiplied RGBA, as libwebp takes it.
              let format = vImage_CGImageFormat(bitsPerComponent: 8, bitsPerPixel: 32, colorSpace: srgb,
                                                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue)),
              var buffer = try? vImage_Buffer(cgImage: image, format: format) else { return nil }
        defer { buffer.free() }

        var config = WebPConfig()
        guard WebPConfigInit(&config) != 0, WebPConfigLosslessPreset(&config, 6) != 0 else { return nil }
        var picture = WebPPicture()
        guard WebPPictureInit(&picture) != 0 else { return nil }
        defer { WebPPictureFree(&picture) }
        picture.use_argb = 1
        picture.width = Int32(buffer.width)
        picture.height = Int32(buffer.height)
        guard WebPPictureImportRGBA(&picture, buffer.data.assumingMemoryBound(to: UInt8.self), Int32(buffer.rowBytes)) != 0 else { return nil }

        var writer = WebPMemoryWriter()
        WebPMemoryWriterInit(&writer)
        defer { WebPMemoryWriterClear(&writer) }
        return withUnsafeMutablePointer(to: &writer) { w -> Data? in
            picture.writer = WebPMemoryWrite
            picture.custom_ptr = UnsafeMutableRawPointer(w)
            guard WebPEncode(&config, &picture) != 0, let bytes = w.pointee.mem else { return nil }
            return Data(bytes: bytes, count: w.pointee.size)
        }
    }

    /// An editor-API upload body ({ name: "x.png", data: base64, … }) with
    /// the PNG swapped for WebP; anything else comes back unchanged.
    static func convertingUpload(_ body: Data?) -> Data? {
        guard let body, var json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
              let name = json["name"] as? String, name.lowercased().hasSuffix(".png"),
              let base64 = json["data"] as? String, let png = Data(base64Encoded: base64),
              let webp = lossless(fromPNG: png) else { return body }
        json["name"] = String(name.dropLast(4)) + ".webp"
        json["data"] = webp.base64EncodedString()
        return (try? JSONSerialization.data(withJSONObject: json)) ?? body
    }
}
