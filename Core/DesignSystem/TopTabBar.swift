import SwiftUI

struct TopTabBar<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String
    let statusColor: ((Option) -> Color?)?

    init(
        options: [Option],
        selection: Binding<Option>,
        title: @escaping (Option) -> String,
        statusColor: ((Option) -> Color?)? = nil
    ) {
        self.options = options
        self._selection = selection
        self.title = title
        self.statusColor = statusColor
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { option in
                Button {
                    selection = option
                } label: {
                    ZStack(alignment: .bottom) {
                        HStack(spacing: 8) {
                            if let color = statusColor?(option) {
                                Circle()
                                    .fill(color)
                                    .frame(width: 8, height: 8)
                            }

                            Text(title(option))
                                .font(.system(size: 16, weight: selection == option ? .bold : .semibold))
                                .foregroundStyle(selection == option ? AppTheme.Palette.textPrimary : AppTheme.Palette.textSecondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

                        Rectangle()
                            .fill(selection == option ? AppTheme.Palette.primary : .clear)
                            .frame(height: 2)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                }
                .buttonStyle(.plain)
            }
        }
        .background(AppTheme.Palette.elevatedSurface)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(AppTheme.Palette.border)
                .frame(height: 1)
        }
    }
}
