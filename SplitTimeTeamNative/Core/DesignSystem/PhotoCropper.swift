import SwiftUI
import UIKit

enum PhotoCropShapeStyle: Hashable {
    case circle
    case roundedRect(cornerRadius: CGFloat)
}

struct PhotoCropperConfiguration: Hashable {
    let title: String
    let subtitle: String
    let cropShape: PhotoCropShapeStyle
    let outputSize: CGSize
    let confirmTitle: String

    static let profile = PhotoCropperConfiguration(
        title: "Adjust Photo",
        subtitle: "Pinch and drag to center it in the circle.",
        cropShape: .circle,
        outputSize: CGSize(width: 1200, height: 1200),
        confirmTitle: "Use Photo"
    )

    static let teamLogo = PhotoCropperConfiguration(
        title: "Adjust Team Logo",
        subtitle: "Pinch and drag to frame the logo well.",
        cropShape: .roundedRect(cornerRadius: 30),
        outputSize: CGSize(width: 1400, height: 1400),
        confirmTitle: "Use Logo"
    )

    static let chatAttachment = PhotoCropperConfiguration(
        title: "Adjust Photo",
        subtitle: "Pinch and drag to frame the image before sending.",
        cropShape: .roundedRect(cornerRadius: 28),
        outputSize: CGSize(width: 1600, height: 1600),
        confirmTitle: "Use Photo"
    )
}

struct PhotoCropperScene: View {
    let image: UIImage
    let configuration: PhotoCropperConfiguration
    let onCancel: () -> Void
    let onSave: (UIImage) -> Void

    @State private var zoomScale: CGFloat = 1
    @State private var lastZoomScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        GeometryReader { geometry in
            let cropSide = resolvedCropSide(for: geometry.size)

            VStack(spacing: 0) {
                header
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
                    .padding(.top, 18)
                    .padding(.bottom, 18)

                Spacer(minLength: 24)

                cropCanvas(cropSide: cropSide)

                Spacer(minLength: 24)

                VStack(spacing: 16) {
                    Text(configuration.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Color.white.opacity(0.72))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)

                    HStack(spacing: 12) {
                        Button("Reset") {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                                zoomScale = 1
                                lastZoomScale = 1
                                offset = .zero
                                lastOffset = .zero
                            }
                        }
                        .buttonStyle(SecondaryButtonStyle())

                        Button(configuration.confirmTitle) {
                            guard let cropped = renderCroppedImage(cropSide: cropSide) else { return }
                            onSave(cropped)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
                    .padding(.bottom, 24)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black.ignoresSafeArea())
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            Button {
                onCancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.12))
                    )
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 4) {
                Text(configuration.title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.white)
                Text("Move and scale the image until it looks right.")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.62))
            }

            Spacer()
        }
    }

    private func cropCanvas(cropSide: CGFloat) -> some View {
        let baseSize = baseDisplaySize(for: cropSide)
        let totalSize = CGSize(width: baseSize.width * zoomScale, height: baseSize.height * zoomScale)
        let cropShape = PhotoCropMaskShape(style: configuration.cropShape)

        return ZStack {
            Color.white.opacity(0.04)
                .frame(width: cropSide, height: cropSide)
                .clipShape(cropShape)

            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .antialiased(true)
                .frame(width: totalSize.width, height: totalSize.height)
                .offset(offset)
                .frame(width: cropSide, height: cropSide)
                .clipShape(cropShape)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            offset = clampedOffset(
                                CGSize(
                                    width: lastOffset.width + value.translation.width,
                                    height: lastOffset.height + value.translation.height
                                ),
                                cropSide: cropSide,
                                zoomScale: zoomScale
                            )
                        }
                        .onEnded { _ in
                            lastOffset = offset
                        }
                )
                .simultaneousGesture(
                    MagnificationGesture()
                        .onChanged { value in
                            zoomScale = clampedScale(lastZoomScale * value)
                            offset = clampedOffset(offset, cropSide: cropSide, zoomScale: zoomScale)
                        }
                        .onEnded { _ in
                            lastZoomScale = zoomScale
                            offset = clampedOffset(offset, cropSide: cropSide, zoomScale: zoomScale)
                            lastOffset = offset
                        }
                )

            cropGuides
                .frame(width: cropSide, height: cropSide)
                .mask(cropShape)
                .allowsHitTesting(false)

            cropShape
                .stroke(Color.white.opacity(0.9), lineWidth: 1.5)
                .frame(width: cropSide, height: cropSide)
                .allowsHitTesting(false)
        }
        .frame(width: cropSide, height: cropSide)
        .shadow(color: .black.opacity(0.28), radius: 24, y: 14)
    }

    private var cropGuides: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height

            Path { path in
                let thirdsX = width / 3
                let thirdsY = height / 3

                path.move(to: CGPoint(x: thirdsX, y: 0))
                path.addLine(to: CGPoint(x: thirdsX, y: height))

                path.move(to: CGPoint(x: thirdsX * 2, y: 0))
                path.addLine(to: CGPoint(x: thirdsX * 2, y: height))

                path.move(to: CGPoint(x: 0, y: thirdsY))
                path.addLine(to: CGPoint(x: width, y: thirdsY))

                path.move(to: CGPoint(x: 0, y: thirdsY * 2))
                path.addLine(to: CGPoint(x: width, y: thirdsY * 2))
            }
            .stroke(Color.white.opacity(0.18), lineWidth: 1)
        }
    }

    private func resolvedCropSide(for size: CGSize) -> CGFloat {
        min(size.width - 44, max(240, min(size.height * 0.42, 360)))
    }

    private func baseDisplaySize(for cropSide: CGFloat) -> CGSize {
        let imageSize = image.size
        guard imageSize.width > 0, imageSize.height > 0 else {
            return CGSize(width: cropSide, height: cropSide)
        }

        let scale = max(cropSide / imageSize.width, cropSide / imageSize.height)
        return CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
    }

    private func clampedScale(_ value: CGFloat) -> CGFloat {
        min(max(value, 1), 4)
    }

    private func clampedOffset(_ proposed: CGSize, cropSide: CGFloat, zoomScale: CGFloat) -> CGSize {
        let base = baseDisplaySize(for: cropSide)
        let displayed = CGSize(width: base.width * zoomScale, height: base.height * zoomScale)
        let maxX = max(0, (displayed.width - cropSide) / 2)
        let maxY = max(0, (displayed.height - cropSide) / 2)

        return CGSize(
            width: min(max(proposed.width, -maxX), maxX),
            height: min(max(proposed.height, -maxY), maxY)
        )
    }

    private func renderCroppedImage(cropSide: CGFloat) -> UIImage? {
        let outputSize = configuration.outputSize
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: outputSize, format: format)

        return renderer.image { _ in
            image.draw(in: renderedImageRect(cropSide: cropSide, outputSize: outputSize))
        }
    }

    private func renderedImageRect(cropSide: CGFloat, outputSize: CGSize) -> CGRect {
        let base = baseDisplaySize(for: cropSide)
        let displayed = CGSize(width: base.width * zoomScale, height: base.height * zoomScale)
        let scaleX = outputSize.width / cropSide
        let scaleY = outputSize.height / cropSide

        let outputDisplayed = CGSize(width: displayed.width * scaleX, height: displayed.height * scaleY)
        let translatedOffset = CGSize(width: offset.width * scaleX, height: offset.height * scaleY)

        return CGRect(
            x: (outputSize.width - outputDisplayed.width) / 2 + translatedOffset.width,
            y: (outputSize.height - outputDisplayed.height) / 2 + translatedOffset.height,
            width: outputDisplayed.width,
            height: outputDisplayed.height
        )
    }
}

private struct PhotoCropMaskShape: Shape {
    let style: PhotoCropShapeStyle

    func path(in rect: CGRect) -> Path {
        switch style {
        case .circle:
            return Circle().path(in: rect)
        case let .roundedRect(cornerRadius):
            return RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).path(in: rect)
        }
    }
}
