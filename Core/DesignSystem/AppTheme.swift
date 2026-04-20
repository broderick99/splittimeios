import SwiftUI
import UIKit

enum AppTheme {
    enum Palette {
        static let primary = Color(red: 0.17, green: 0.39, blue: 0.95)
        static let success = Color(red: 0.20, green: 0.62, blue: 0.35)
        static let danger = Color(red: 0.88, green: 0.24, blue: 0.25)
        static let background = Color(UIColor.systemGroupedBackground)
        static let surface = Color(UIColor.secondarySystemGroupedBackground)
        static let elevatedSurface = Color(UIColor.systemBackground)
        static let border = Color.black.opacity(0.08)
        static let textPrimary = Color.primary
        static let textSecondary = Color.secondary
        static let muted = Color(.tertiaryLabel)
    }

    enum Metrics {
        static let screenPadding: CGFloat = 20
        static let cornerRadius: CGFloat = 20
        static let rowCornerRadius: CGFloat = 16
        static let controlHeight: CGFloat = 50
        static let tabBarIconSize: CGFloat = 22
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: AppTheme.Metrics.controlHeight)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(AppTheme.Palette.primary.opacity(configuration.isPressed ? 0.84 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(AppTheme.Palette.textPrimary)
            .frame(maxWidth: .infinity)
            .frame(height: AppTheme.Metrics.controlHeight)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(AppTheme.Palette.surface.opacity(configuration.isPressed ? 0.84 : 1))
            )
    }
}

struct AppCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Metrics.cornerRadius, style: .continuous)
                    .fill(AppTheme.Palette.elevatedSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Metrics.cornerRadius, style: .continuous)
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
            )
    }
}

extension View {
    func appCard() -> some View {
        modifier(AppCardModifier())
    }
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)

        let red, green, blue: Double
        switch cleaned.count {
        case 6:
            red = Double((value >> 16) & 0xFF) / 255
            green = Double((value >> 8) & 0xFF) / 255
            blue = Double(value & 0xFF) / 255
        default:
            red = 0.67
            green = 0.69
            blue = 0.75
        }

        self.init(red: red, green: green, blue: blue)
    }
}
