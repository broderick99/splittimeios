import SwiftUI

struct FloatingAddButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 58, height: 58)
                .background(
                    Circle()
                        .fill(AppTheme.Palette.primary)
                        .shadow(color: .black.opacity(0.16), radius: 16, x: 0, y: 10)
                )
        }
        .buttonStyle(.plain)
    }
}
