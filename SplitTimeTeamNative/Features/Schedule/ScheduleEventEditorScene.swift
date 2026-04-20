import SwiftUI
import MapKit

enum ScheduleEventEditorMode {
    case create
    case editEvent(eventID: String)
    case editOccurrence(eventID: String, occurrenceStartsAt: Date)
}

struct ScheduleEventEditorInitialValues {
    let type: ScheduleEventType
    let title: String
    let category: String
    let startsAt: Date
    let endsAt: Date?
    let notes: String?
    let isRecurring: Bool
    let recurrenceDays: [Int]
    let recurrenceEndsAt: Date?
    let location: SelectedScheduleLocation?
}

struct ScheduleEventEditorScene: View {
    let scheduleService: any ScheduleServiceProtocol
    let mode: ScheduleEventEditorMode
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var eventType: ScheduleEventType
    @State private var title: String
    @State private var category: String
    @State private var startsAt: Date
    @State private var hasEndTime: Bool
    @State private var endsAt: Date
    @State private var notes: String
    @State private var isRecurring: Bool
    @State private var recurrenceDays: Set<Int>
    @State private var recurrenceEndsAt: Date
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var selectedLocation: SelectedScheduleLocation? = nil
    @State private var showLocationPicker = false

    init(
        scheduleService: any ScheduleServiceProtocol,
        mode: ScheduleEventEditorMode = .create,
        initialValues: ScheduleEventEditorInitialValues? = nil,
        onSaved: @escaping () -> Void
    ) {
        let defaultStart = Date()
        let seededStart = initialValues?.startsAt ?? defaultStart
        let seededEnd = initialValues?.endsAt ?? (Calendar.current.date(byAdding: .hour, value: 1, to: seededStart) ?? seededStart)
        self.scheduleService = scheduleService
        self.mode = mode
        self.onSaved = onSaved
        _eventType = State(initialValue: initialValues?.type ?? .practice)
        _title = State(initialValue: initialValues?.title ?? "")
        _category = State(initialValue: initialValues?.category ?? "")
        _startsAt = State(initialValue: seededStart)
        _hasEndTime = State(initialValue: initialValues?.endsAt != nil)
        _endsAt = State(initialValue: seededEnd)
        _notes = State(initialValue: initialValues?.notes ?? "")
        _isRecurring = State(initialValue: initialValues?.isRecurring ?? false)
        _recurrenceDays = State(initialValue: Set(initialValues?.recurrenceDays ?? []))
        _recurrenceEndsAt = State(initialValue: initialValues?.recurrenceEndsAt ?? (Calendar.current.date(byAdding: .month, value: 1, to: seededStart) ?? seededStart))
        _selectedLocation = State(initialValue: initialValues?.location)
    }

    var body: some View {
        Form {
            eventTypeSection
            basicDetailsSection
            recurrenceSection
            notesSection

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                }
            }

            Section {
                Button {
                    Task {
                        await save()
                    }
                } label: {
                    if isSaving {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else {
                        Text(saveButtonTitle)
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(!canSave || isSaving)
            }
        }
        .navigationTitle(screenTitle)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: eventType) { _, newValue in
            let validOptions = scheduleCategoryOptions(for: newValue)
            if !validOptions.contains(category) {
                category = ""
            }
        }
        .onChange(of: isRecurring) { _, enabled in
            guard enabled, recurrenceDays.isEmpty else { return }
            recurrenceDays = [weekdayIndex(for: startsAt)]
        }
        .onChange(of: startsAt) { _, newValue in
            if hasEndTime, endsAt < newValue {
                endsAt = Calendar.current.date(byAdding: .hour, value: 1, to: newValue) ?? newValue
            }
            if recurrenceEndsAt < newValue {
                recurrenceEndsAt = newValue
            }
        }
        .fullScreenCover(isPresented: $showLocationPicker) {
            ScheduleLocationPickerScene(initialSelection: selectedLocation) { location in
                selectedLocation = location
            }
        }
    }

    private var eventTypeSection: some View {
        Section("Event Type") {
            Picker("Event Type", selection: $eventType) {
                Text("Practice").tag(ScheduleEventType.practice)
                Text("Race").tag(ScheduleEventType.race)
            }
            .pickerStyle(.segmented)
        }
    }

    private var basicDetailsSection: some View {
        Section("Details") {
            TextField("Event Name", text: $title)

            Picker("Category", selection: $category) {
                Text("Select category").tag("")
                ForEach(scheduleCategoryOptions(for: eventType), id: \.self) { option in
                    Text(option).tag(option)
                }
            }

            DatePicker("Date", selection: $startsAt, displayedComponents: [.date])
            DatePicker("Start Time", selection: $startsAt, displayedComponents: [.hourAndMinute])

            Toggle("Include End Time", isOn: $hasEndTime)

            if hasEndTime {
                DatePicker("End Time", selection: $endsAt, in: startsAt..., displayedComponents: [.hourAndMinute])
            }

            Button {
                showLocationPicker = true
            } label: {
                HStack {
                    Text("Location")
                        .foregroundStyle(AppTheme.Palette.textPrimary)
                    Spacer()
                    if let selectedLocation {
                        Text(selectedLocation.title)
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                            .lineLimit(1)
                    } else {
                        Text("Select location")
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    }
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.Palette.muted)
                }
            }
        }
    }

    private var recurrenceSection: some View {
        Section("Recurring") {
            Toggle("Repeats", isOn: $isRecurring)

            if isRecurring {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Repeat On")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        ForEach([1, 2, 3, 4, 5, 6, 0], id: \.self) { day in
                            Button {
                                toggleRecurrenceDay(day)
                            } label: {
                                Text(weekdayShortLabel(for: day) ?? "?")
                                    .font(.subheadline.weight(.semibold))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 36)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .fill(recurrenceDays.contains(day) ? AppTheme.Palette.primary.opacity(0.14) : AppTheme.Palette.surface)
                                    )
                                    .foregroundStyle(recurrenceDays.contains(day) ? AppTheme.Palette.primary : AppTheme.Palette.textPrimary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                DatePicker("Repeat Until", selection: $recurrenceEndsAt, in: startsAt..., displayedComponents: [.date])
            }
        }
    }

    private var notesSection: some View {
        Section("Notes") {
            TextEditor(text: $notes)
                .frame(minHeight: 140)
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func toggleRecurrenceDay(_ day: Int) {
        if recurrenceDays.contains(day) {
            recurrenceDays.remove(day)
        } else {
            recurrenceDays.insert(day)
        }
    }

    private func weekdayIndex(for date: Date) -> Int {
        (Calendar.current.component(.weekday, from: date) + 6) % 7
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        do {
            let draft = ScheduleEventDraft(
                type: eventType,
                category: category,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                startsAt: startsAt,
                endsAt: hasEndTime ? endsAt : nil,
                location: selectedLocation?.storageValue,
                locationLatitude: selectedLocation?.latitude,
                locationLongitude: selectedLocation?.longitude,
                notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                isRecurring: isRecurring,
                recurrenceDays: isRecurring ? recurrenceDays.sorted() : [],
                recurrenceEndsAt: isRecurring ? recurrenceEndsAt : nil
            )

            switch mode {
            case .create:
                _ = try await scheduleService.createEvent(draft)
            case let .editEvent(eventID):
                _ = try await scheduleService.updateEvent(eventID: eventID, draft: draft)
            case let .editOccurrence(eventID, occurrenceStartsAt):
                try await scheduleService.updateOccurrence(
                    eventID: eventID,
                    occurrenceStartsAt: occurrenceStartsAt,
                    draft: draft
                )
            }
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private var screenTitle: String {
        switch mode {
        case .create:
            return "New Event"
        case .editEvent, .editOccurrence:
            return "Edit Event"
        }
    }

    private var saveButtonTitle: String {
        switch mode {
        case .create:
            return "Save Event"
        case .editEvent, .editOccurrence:
            return "Save Changes"
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

struct SelectedScheduleLocation: Equatable {
    let title: String
    let address: String
    let latitude: Double
    let longitude: Double

    var storageValue: String {
        address.isEmpty ? title : "\(title), \(address)"
    }
}

@MainActor
private final class LocationSearchViewModel: NSObject, ObservableObject {
    @Published var query = ""
    @Published private(set) var suggestions: [LocationSuggestion] = []
    @Published private(set) var isSearching = false
    @Published var selectedLocation: SelectedScheduleLocation?

    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = [.address, .pointOfInterest]
    }

    func updateQuery(_ query: String) {
        self.query = query
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            suggestions = []
            return
        }
        completer.queryFragment = trimmed
    }

    func select(_ suggestion: LocationSuggestion) async {
        isSearching = true
        defer { isSearching = false }

        let request = MKLocalSearch.Request(completion: suggestion.completion)

        do {
            let response = try await MKLocalSearch(request: request).start()
            guard let item = response.mapItems.first else { return }
            let title = item.name ?? suggestion.title
            let address = formattedAddress(from: item.placemark)
            selectedLocation = SelectedScheduleLocation(
                title: title,
                address: address,
                latitude: item.placemark.coordinate.latitude,
                longitude: item.placemark.coordinate.longitude
            )
            query = selectedLocation?.storageValue ?? suggestion.title
        } catch {
            return
        }
    }

    private func formattedAddress(from placemark: MKPlacemark) -> String {
        let pieces = [
            placemark.thoroughfare,
            placemark.locality,
            placemark.administrativeArea,
            placemark.postalCode,
            placemark.country
        ]
        return pieces.compactMap { $0 }.joined(separator: ", ")
    }
}

extension LocationSearchViewModel: @preconcurrency MKLocalSearchCompleterDelegate {
    func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let unique = Dictionary(
            completer.results.map { result in
                ("\(result.title)|\(result.subtitle)", LocationSuggestion(title: result.title, subtitle: result.subtitle, completion: result))
            },
            uniquingKeysWith: { first, _ in first }
        )
        suggestions = Array(unique.values)
    }

    func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        suggestions = []
    }
}

private struct LocationSuggestion: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let completion: MKLocalSearchCompletion
}

private struct ScheduleLocationPickerScene: View {
    let initialSelection: SelectedScheduleLocation?
    let onSave: (SelectedScheduleLocation?) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = LocationSearchViewModel()
    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(AppTheme.Palette.muted)

                    TextField("Search address or place", text: Binding(
                        get: { viewModel.query },
                        set: { viewModel.updateQuery($0) }
                    ))
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(AppTheme.Palette.surface)
                )
                .padding(.horizontal, AppTheme.Metrics.screenPadding)
                .padding(.top, 12)

                Group {
                    if let selectedLocation = viewModel.selectedLocation {
                        Map(position: $position) {
                            Marker(selectedLocation.title, coordinate: CLLocationCoordinate2D(latitude: selectedLocation.latitude, longitude: selectedLocation.longitude))
                        }
                        .onAppear {
                            position = .region(
                                MKCoordinateRegion(
                                    center: CLLocationCoordinate2D(latitude: selectedLocation.latitude, longitude: selectedLocation.longitude),
                                    span: MKCoordinateSpan(latitudeDelta: 0.015, longitudeDelta: 0.015)
                                )
                            )
                        }
                    } else {
                        VStack(spacing: 10) {
                            if viewModel.isSearching {
                                ProgressView()
                            } else {
                                Image(systemName: "mappin.and.ellipse")
                                    .font(.system(size: 28))
                                    .foregroundStyle(AppTheme.Palette.primary)
                                Text("Search for a place to preview it on the map.")
                                    .font(.subheadline)
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(height: 220)
                .background(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(AppTheme.Palette.surface)
                )
                .padding(AppTheme.Metrics.screenPadding)

                if viewModel.suggestions.isEmpty {
                    Spacer()
                } else {
                    List(viewModel.suggestions) { suggestion in
                        Button {
                            Task {
                                await viewModel.select(suggestion)
                            }
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: viewModel.selectedLocation?.title == suggestion.title ? "location.fill" : "location")
                                    .foregroundStyle(AppTheme.Palette.primary)
                                    .frame(width: 18, height: 18)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(suggestion.title)
                                        .font(.headline)
                                        .foregroundStyle(AppTheme.Palette.textPrimary)
                                    if !suggestion.subtitle.isEmpty {
                                        Text(suggestion.subtitle)
                                            .font(.subheadline)
                                            .foregroundStyle(AppTheme.Palette.textSecondary)
                                    }
                                }
                            }
                            .padding(.vertical, 6)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(AppTheme.Palette.background)
            .navigationTitle("Choose Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        onSave(viewModel.selectedLocation)
                        dismiss()
                    }
                    .disabled(viewModel.selectedLocation == nil)
                }
            }
            .onAppear {
                if let initialSelection {
                    viewModel.selectedLocation = initialSelection
                    viewModel.updateQuery(initialSelection.storageValue)
                    position = .region(
                        MKCoordinateRegion(
                            center: CLLocationCoordinate2D(latitude: initialSelection.latitude, longitude: initialSelection.longitude),
                            span: MKCoordinateSpan(latitudeDelta: 0.015, longitudeDelta: 0.015)
                        )
                    )
                }
            }
        }
    }
}
