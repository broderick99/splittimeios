import MapKit
import SwiftUI

@MainActor
final class ScheduleViewModel: ObservableObject {
    @Published private(set) var snapshot: ScheduleSnapshot = .empty
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let scheduleService: any ScheduleServiceProtocol

    init(scheduleService: any ScheduleServiceProtocol) {
        self.scheduleService = scheduleService
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            snapshot = try await scheduleService.fetchSchedule()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct ScheduleScene: View {
    let role: UserRole
    @StateObject private var viewModel: ScheduleViewModel
    private let scheduleService: any ScheduleServiceProtocol
    @State private var showNewEvent = false
    @State private var activeFilter: ScheduleFilter = .all

    init(role: UserRole, scheduleService: any ScheduleServiceProtocol) {
        self.role = role
        self.scheduleService = scheduleService
        _viewModel = StateObject(wrappedValue: ScheduleViewModel(scheduleService: scheduleService))
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.Palette.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .appCard()
                    }

                    ScheduleSummaryBlock(
                        role: role,
                        activeFilter: $activeFilter,
                        nextOccurrence: occurrences.first,
                        recurringEventCount: recurringEventCount
                    )

                    if occurrences.isEmpty && !viewModel.isLoading {
                        ContentUnavailableView(
                            "No Schedule Yet",
                            systemImage: "calendar.badge.clock",
                            description: Text(
                                role == .coach
                                    ? "Tap the plus button to add a practice, race, or recurring team event."
                                    : "Your schedule will appear here once events are synced from the coach account."
                            )
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 36)
                    } else {
                        ForEach(groupedOccurrences) { month in
                            VStack(alignment: .leading, spacing: 14) {
                                Text(month.label)
                                    .font(.headline.weight(.heavy))
                                    .foregroundStyle(AppTheme.Palette.textPrimary)

                                ForEach(month.weeks) { week in
                                    VStack(alignment: .leading, spacing: 10) {
                                        Text(week.label)
                                            .font(.subheadline.weight(.heavy))
                                            .foregroundStyle(AppTheme.Palette.textSecondary)

                                        VStack(spacing: 0) {
                                            ForEach(Array(week.occurrences.enumerated()), id: \.element.id) { index, occurrence in
                                                NavigationLink {
                                                    if let event = eventByID[occurrence.eventID] {
                                                        ScheduleEventDetailView(
                                                            event: event,
                                                            occurrence: occurrence,
                                                            role: role,
                                                            scheduleService: scheduleService
                                                        ) {
                                                            Task {
                                                                await viewModel.refresh()
                                                            }
                                                        }
                                                    }
                                                } label: {
                                                    ScheduleEventRow(
                                                        occurrence: occurrence,
                                                        showsDivider: index < week.occurrences.count - 1
                                                    )
                                                }
                                                .buttonStyle(.plain)
                                            }
                                        }
                                        .appCard()
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, AppTheme.Metrics.screenPadding)
                .padding(.top, 10)
                .padding(.bottom, 110)
            }
            .background(AppTheme.Palette.background)
            .refreshable {
                await viewModel.refresh()
            }

            if role == .coach {
                FloatingAddButton {
                    showNewEvent = true
                }
                .padding(.trailing, 20)
                .padding(.bottom, 18)
            }
        }
        .task {
            if viewModel.snapshot.events.isEmpty {
                await viewModel.refresh()
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            topNavigationBar
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $showNewEvent) {
            ScheduleEventEditorScene(scheduleService: scheduleService) {
                Task {
                    await viewModel.refresh()
                }
            }
        }
    }

    private var topNavigationBar: some View {
        HStack(spacing: 12) {
            Color.clear
                .frame(width: 34, height: 34)

            Spacer(minLength: 8)

            Text("Schedule")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)

            Spacer(minLength: 8)

            Color.clear
                .frame(width: 34, height: 34)
        }
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
        .padding(.top, 4)
        .padding(.bottom, 2)
        .background(
            AppTheme.Palette.elevatedSurface
                .ignoresSafeArea(edges: .top)
        )
    }

    private var eventByID: [String: ScheduleEvent] {
        Dictionary(uniqueKeysWithValues: viewModel.snapshot.events.map { ($0.id, $0) })
    }

    private var filteredEvents: [ScheduleEvent] {
        switch activeFilter {
        case .all:
            return viewModel.snapshot.events
        case .practice:
            return viewModel.snapshot.events.filter { $0.type == .practice }
        case .race:
            return viewModel.snapshot.events.filter { $0.type == .race }
        }
    }

    private var occurrences: [ScheduleOccurrence] {
        buildUpcomingOccurrences(
            events: filteredEvents,
            overrides: viewModel.snapshot.overrides
        )
    }

    private var recurringEventCount: Int {
        viewModel.snapshot.events.filter(\.isRecurring).count
    }

    private var groupedOccurrences: [ScheduleMonthGroup] {
        var monthGroups: [ScheduleMonthGroup] = []

        for occurrence in occurrences {
            let monthLabel = formatScheduleMonthYear(occurrence.startsAt)
            let weekStart = startOfScheduleWeek(for: occurrence.startsAt)
            let weekID = "\(monthLabel)-\(weekStart.timeIntervalSince1970)"
            let weekLabel = formatScheduleWeekLabel(weekStart)

            if monthGroups.last?.id != monthLabel {
                monthGroups.append(
                    ScheduleMonthGroup(
                        id: monthLabel,
                        label: monthLabel,
                        weeks: []
                    )
                )
            }

            if monthGroups[monthGroups.count - 1].weeks.last?.id != weekID {
                monthGroups[monthGroups.count - 1].weeks.append(
                    ScheduleWeekGroup(
                        id: weekID,
                        label: weekLabel,
                        occurrences: []
                    )
                )
            }

            monthGroups[monthGroups.count - 1].weeks[monthGroups[monthGroups.count - 1].weeks.count - 1]
                .occurrences
                .append(occurrence)
        }

        return monthGroups
    }
}

private enum ScheduleFilter: String, CaseIterable, Identifiable {
    case all
    case practice
    case race

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "All Events"
        case .practice:
            return "Practices"
        case .race:
            return "Races"
        }
    }
}

private struct ScheduleMonthGroup: Identifiable {
    let id: String
    let label: String
    var weeks: [ScheduleWeekGroup]
}

private struct ScheduleWeekGroup: Identifiable {
    let id: String
    let label: String
    var occurrences: [ScheduleOccurrence]
}

private struct ScheduleSummaryBlock: View {
    let role: UserRole
    @Binding var activeFilter: ScheduleFilter
    let nextOccurrence: ScheduleOccurrence?
    let recurringEventCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                ForEach(ScheduleFilter.allCases) { filter in
                    Button {
                        activeFilter = filter
                    } label: {
                        Text(filter.title)
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(activeFilter == filter ? AppTheme.Palette.primary : AppTheme.Palette.textSecondary)
                            .padding(.horizontal, 14)
                            .frame(height: 38)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(activeFilter == filter ? AppTheme.Palette.primary.opacity(0.12) : AppTheme.Palette.surface)
                            )
                            .overlay(
                                Capsule(style: .continuous)
                                    .stroke(activeFilter == filter ? AppTheme.Palette.primary.opacity(0.22) : AppTheme.Palette.border, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Next Up")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.Palette.muted)
                        .textCase(.uppercase)

                    Text(nextOccurrence?.title ?? "Nothing yet")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(AppTheme.Palette.textPrimary)
                        .lineLimit(2)

                    Text(
                        nextOccurrence.map { $0.startsAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()) }
                            ?? (role == .coach ? "Add your first event" : "Waiting on coach updates")
                    )
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
                    .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .appCard()

                VStack(alignment: .leading, spacing: 6) {
                    Text("Recurring")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.Palette.muted)
                        .textCase(.uppercase)

                    Text("\(recurringEventCount)")
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .foregroundStyle(AppTheme.Palette.textPrimary)

                    Text("Active weekly events")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .appCard()
            }
        }
    }
}

private struct ScheduleEventRow: View {
    let occurrence: ScheduleOccurrence
    let showsDivider: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(spacing: 4) {
                Text(dayNumber)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                Text(weekday)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
                    .textCase(.uppercase)
            }
            .frame(width: 64, height: 64)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(occurrence.type == .practice ? AppTheme.Palette.primary : Color.orange)
                        .frame(width: 8, height: 8)

                    Text(timeText)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(AppTheme.Palette.textPrimary)
                }

                Text(occurrence.title)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .lineLimit(2)

                if !occurrence.category.isEmpty {
                    Text(occurrence.category.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.Palette.muted)
                }

                if let location = occurrence.location, !location.isEmpty {
                    Text(getLocationDisplayName(location))
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            if showsDivider {
                Rectangle()
                    .fill(AppTheme.Palette.border)
                    .frame(height: 1)
                    .padding(.leading, 72)
            }
        }
    }

    private var dayNumber: String {
        occurrence.startsAt.formatted(.dateTime.day())
    }

    private var weekday: String {
        occurrence.startsAt.formatted(.dateTime.weekday(.abbreviated))
    }

    private var timeText: String {
        if let endsAt = occurrence.endsAt {
            return "\(occurrence.startsAt.formatted(date: .omitted, time: .shortened)) - \(endsAt.formatted(date: .omitted, time: .shortened))"
        }

        return occurrence.startsAt.formatted(date: .omitted, time: .shortened)
    }
}

private struct ScheduleEventDetailView: View {
    let event: ScheduleEvent
    let occurrence: ScheduleOccurrence
    let role: UserRole
    let scheduleService: any ScheduleServiceProtocol
    let onEventUpdated: () -> Void
    @Environment(\.openURL) private var openURL
    @State private var showEditEvent = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let coordinate = displayCoordinate {
                    Map(initialPosition: .region(region(for: coordinate)), interactionModes: [.zoom, .pan]) {
                        Marker(displayTitle, coordinate: coordinate)
                    }
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text(displayType.rawValue.capitalized)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule(style: .continuous)
                                .fill(AppTheme.Palette.primary.opacity(0.12))
                        )

                    Text(displayTitle)
                        .font(.largeTitle.weight(.bold))

                    if !displayCategory.isEmpty {
                        Text(displayCategory.uppercased())
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    }

                    Text(displayStartsAt.formatted(.dateTime.weekday(.wide).month(.wide).day().year()))
                        .font(.title3)
                        .foregroundStyle(AppTheme.Palette.textSecondary)

                    Text(timeRange)
                        .font(.title3.weight(.semibold))
                }

                if let location = displayLocation, !location.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Location")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textSecondary)

                        Text(location)
                            .font(.body)

                        if let coordinate = displayCoordinate {
                            HStack(spacing: 12) {
                                Button("Open in Apple Maps") {
                                    openAppleMaps(with: coordinate, name: displayTitle)
                                }
                                .buttonStyle(SecondaryButtonStyle())

                                Button("Open in Google Maps") {
                                    openGoogleMaps(with: coordinate)
                                }
                                .buttonStyle(SecondaryButtonStyle())
                            }
                        }
                    }
                    .appCard()
                }

                if event.isRecurring {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Repeats")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textSecondary)

                        Text(recurrenceSummary)
                            .font(.body)
                    }
                    .appCard()
                }

                if let notes = displayNotes, !notes.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Notes")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textSecondary)

                        Text(notes)
                            .font(.body)
                    }
                    .appCard()
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
        }
        .background(AppTheme.Palette.background)
        .navigationTitle("Event Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if role == .coach {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") {
                        showEditEvent = true
                    }
                    .font(.headline)
                    .foregroundStyle(AppTheme.Palette.primary)
                }
            }
        }
        .sheet(isPresented: $showEditEvent) {
            NavigationStack {
                ScheduleEventEditorScene(
                    scheduleService: scheduleService,
                    mode: editorMode,
                    initialValues: editorInitialValues
                ) {
                    onEventUpdated()
                }
            }
        }
    }

    private var timeRange: String {
        if let endsAt = displayEndsAt {
            return "\(displayStartsAt.formatted(date: .omitted, time: .shortened)) - \(endsAt.formatted(date: .omitted, time: .shortened))"
        }

        return displayStartsAt.formatted(date: .omitted, time: .shortened)
    }

    private var displayType: ScheduleEventType {
        occurrence.type
    }

    private var displayCategory: String {
        occurrence.category
    }

    private var displayTitle: String {
        occurrence.title
    }

    private var displayStartsAt: Date {
        occurrence.startsAt
    }

    private var displayEndsAt: Date? {
        occurrence.endsAt
    }

    private var displayLocation: String? {
        occurrence.location
    }

    private var displayCoordinate: CLLocationCoordinate2D? {
        occurrence.coordinate ?? event.coordinate
    }

    private var displayNotes: String? {
        occurrence.notes
    }

    private var recurrenceSummary: String {
        let abbreviations = formatRecurrenceDaysLabel(event.recurrenceDays) ?? event.recurrenceDays.map(dayLabel(for:)).joined(separator: ", ")
        if let endsAt = event.recurrenceEndsAt {
            return "Repeats \(abbreviations) until \(endsAt.formatted(.dateTime.month(.abbreviated).day().year()))"
        }
        return "Repeats \(abbreviations)"
    }

    private var editorMode: ScheduleEventEditorMode {
        if event.isRecurring {
            return .editOccurrence(eventID: event.id, occurrenceStartsAt: occurrence.startsAt)
        }
        return .editEvent(eventID: event.id)
    }

    private var editorInitialValues: ScheduleEventEditorInitialValues {
        ScheduleEventEditorInitialValues(
            type: displayType,
            title: displayTitle,
            category: displayCategory,
            startsAt: displayStartsAt,
            endsAt: displayEndsAt,
            notes: displayNotes,
            isRecurring: event.isRecurring,
            recurrenceDays: event.recurrenceDays,
            recurrenceEndsAt: event.recurrenceEndsAt,
            location: selectedLocationForEditor
        )
    }

    private var selectedLocationForEditor: SelectedScheduleLocation? {
        guard let coordinate = displayCoordinate,
              let rawLocation = displayLocation,
              rawLocation.isEmpty == false else {
            return nil
        }

        let segments = rawLocation.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false)
        let title = segments.first.map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) } ?? rawLocation
        let address: String
        if segments.count > 1 {
            address = String(segments[1]).trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            address = ""
        }

        return SelectedScheduleLocation(
            title: title.isEmpty ? rawLocation : title,
            address: address,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
        )
    }

    private func dayLabel(for day: Int) -> String {
        let labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        guard labels.indices.contains(day) else { return "?" }
        return labels[day]
    }

    private func region(for coordinate: CLLocationCoordinate2D) -> MKCoordinateRegion {
        MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        )
    }

    private func openAppleMaps(with coordinate: CLLocationCoordinate2D, name: String) {
        let placemark = MKPlacemark(coordinate: coordinate)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = name
        mapItem.openInMaps()
    }

    private func openGoogleMaps(with coordinate: CLLocationCoordinate2D) {
        let urlString = "comgooglemaps://?q=\(coordinate.latitude),\(coordinate.longitude)&zoom=15"
        guard let url = URL(string: urlString) else { return }
        openURL(url)
    }
}
