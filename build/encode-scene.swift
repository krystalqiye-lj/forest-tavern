import AVFoundation
import Foundation

let width = Int(CommandLine.arguments[1])!
let height = Int(CommandLine.arguments[2])!
let output = URL(fileURLWithPath: CommandLine.arguments[3])
let video = try AVAssetWriter(outputURL: output, fileType: .mp4)
let track = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 2_700_000, AVVideoMaxKeyFrameIntervalKey: 60],
])
let frames = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: track, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
    kCVPixelBufferIOSurfacePropertiesKey as String: [:],
])
video.shouldOptimizeForNetworkUse = true
video.add(track)
guard video.startWriting() else { throw video.error! }
video.startSession(atSourceTime: .zero)
let pipe = FileHandle.standardInput
let rowBytes = width * 4
let size = rowBytes * height
var index: Int64 = 0

while true {
    guard var data = try pipe.read(upToCount: size), !data.isEmpty else { break }
    while data.count < size {
        guard let tail = try pipe.read(upToCount: size - data.count), !tail.isEmpty else {
            fatalError("Incomplete video frame")
        }
        data.append(tail)
    }
    while !track.isReadyForMoreMediaData && video.status == .writing {
        Thread.sleep(forTimeInterval: 0.002)
    }
    guard video.status == .writing else { throw video.error! }
    var pixel: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, frames.pixelBufferPool!, &pixel)
    let buffer = pixel!
    CVPixelBufferLockBaseAddress(buffer, [])
    let base = CVPixelBufferGetBaseAddress(buffer)!
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    data.withUnsafeBytes { source in
        if stride == rowBytes {
            base.copyMemory(from: source.baseAddress!, byteCount: size)
        } else {
            for y in 0..<height {
                (base + y * stride).copyMemory(from: source.baseAddress! + y * rowBytes, byteCount: rowBytes)
            }
        }
    }
    CVPixelBufferUnlockBaseAddress(buffer, [])
    guard frames.append(buffer, withPresentationTime: CMTime(value: index, timescale: 24)) else {
        throw video.error ?? CocoaError(.fileWriteUnknown)
    }
    index += 1
}
video.endSession(atSourceTime: CMTime(value: index, timescale: 24))
track.markAsFinished()
let done = DispatchSemaphore(value: 0)
video.finishWriting { done.signal() }
done.wait()
if let failure = video.error { throw failure }
