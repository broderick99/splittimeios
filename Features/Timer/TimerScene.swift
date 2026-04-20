import SwiftUI
import UIKit

struct TimerScene: View {
    @ObservedObject var localStore: LocalStore
    @ObservedObject var timerRuntimeStore: TimerRuntimeStore

    @State private var showAthletePicker = false
    @State private var showTemplateChooser = false
    @State private var showGroupWorkoutSetup = false
    @State private var selectedAthleteIDs: Set<String> = []
    @State private var showSavePrompt = false
    @State private var workoutName = ""
    @State private var showExitPrompt = false
    @State private var showDiscardWorkoutAlert = false
    @State private var selectedGroupID = ""
    @State private var showSettings = false

    private var groupedTimers: [GroupTimerBlock] {
        timerRuntimeStore.groupedTimers(autoReorder: localStore.timerPreferences.autoReorderAthletes)
    }

    private var topChromeBackground: Color {
        AppTheme.Palette.elevatedSurface
    }

    var body: some View {
        Group {
            if timerRuntimeStore.isActive {
                activeWorkoutView
            } else {
                preWorkoutView
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            timerControlsBar
        }
        .background(AppTheme.Palette.background)
        .toolbar(.hidden, for: .navigationBar)
        .onChange(of: groupedTimers.map(\.id)) { _, ids in
            guard let first = ids.first else { return }
            if !ids.contains(selectedGroupID) {
                selectedGroupID = first
            }
        }
        .sheet(isPresented: $showAthletePicker) {
            AthleteSelectionSheet(
                athletes: localStore.athletes,
                groups: localStore.groups,
                selectedAthleteIDs: $selectedAthleteIDs,
                title: "Select Athletes",
                subtitle: "Choose which athletes are running this workout today.",
                onCancel: {
                    showAthletePicker = false
                },
                onConfirm: {
                    beginSelectedWorkout()
                }
            )
        }
        .sheet(isPresented: $showGroupWorkoutSetup) {
            GroupTemplateSetupModal(
                athletes: localStore.athletes,
                groups: localStore.groups,
                templates: localStore.templateSummaries,
                onCancel: {
                    showGroupWorkoutSetup = false
                },
                onStart: { assignments in
                    timerRuntimeStore.startGroupedTemplateWorkout(assignments: assignments)
                    selectedGroupID = groupedTimers.first?.id ?? ""
                    showGroupWorkoutSetup = false
                }
            )
        }
        .alert("Save Workout", isPresented: $showSavePrompt) {
            TextField("Workout name", text: $workoutName)
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                Task {
                    _ = await timerRuntimeStore.saveWorkout(name: workoutName)
                }
            }
        } message: {
            Text("Give this workout a name before saving.")
        }
        .alert("Discard Workout?", isPresented: $showDiscardWorkoutAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Discard Workout", role: .destructive) {
                timerRuntimeStore.discardWorkout()
            }
        } message: {
            Text("Are you sure you want to discard this workout? This cannot be undone.")
        }
        .navigationDestination(isPresented: $showSettings) {
            TimerSettingsScene(localStore: localStore)
        }
    }

    private var timerControlsBar: some View {
        let sideSlotWidth: CGFloat = timerRuntimeStore.isActive ? 78 : 34

        return HStack(spacing: 10) {
            HStack(spacing: 10) {
                if timerRuntimeStore.isActive {
                    Button {
                        timerRuntimeStore.resetWorkout()
                    } label: {
                        topControlIcon("arrow.clockwise")
                    }
                } else {
                    Color.clear
                        .frame(width: 34, height: 34)
                }

                Spacer(minLength: 0)
            }
            .frame(width: sideSlotWidth, alignment: .leading)

            Spacer(minLength: 8)

            Text("Timer")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)

            Spacer(minLength: 8)

            HStack(spacing: 10) {
                Button {
                    showSettings = true
                } label: {
                    topControlIcon("gearshape")
                }

                if timerRuntimeStore.isActive {
                    Button {
                        showExitPrompt = true
                    } label: {
                        topControlIcon("xmark")
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showExitPrompt, attachmentAnchor: .rect(.bounds), arrowEdge: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Button {
                                showExitPrompt = false
                                workoutName = defaultWorkoutName
                                showSavePrompt = true
                            } label: {
                                Label("Save & Exit", systemImage: "square.and.arrow.down")
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)

                            Divider()

                            Button(role: .destructive) {
                                showExitPrompt = false
                                showDiscardWorkoutAlert = true
                            } label: {
                                Label("Discard Workout", systemImage: "trash")
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                        }
                        .frame(minWidth: 200)
                        .padding(.vertical, 6)
                        .presentationCompactAdaptation(.popover)
                    }
                }
            }
            .frame(width: sideSlotWidth, alignment: .trailing)
        }
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
        .padding(.top, 4)
        .padding(.bottom, 8)
        .background(
            topChromeBackground
                .ignoresSafeArea(edges: .top)
        )
    }

    private func topControlIcon(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(AppTheme.Palette.textPrimary)
            .frame(width: 34, height: 34)
            .background(
                Circle()
                    .fill(AppTheme.Palette.elevatedSurface)
            )
            .overlay(
                Circle()
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
            )
    }

    private var preWorkoutView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if localStore.athletes.isEmpty {
                    ContentUnavailableView(
                        "No Athletes on Roster",
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        description: Text("Add athletes in the Team tab to start timing.")
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.top, 50)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Ready to Time")
                            .font(.largeTitle.weight(.bold))
                        Text(readySubtitle)
                            .font(.body)
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    }

                    Button("New Workout") {
                        if localStore.templateSummaries.isEmpty {
                            selectedAthleteIDs = Set(localStore.athletes.map(\.id))
                            showAthletePicker = true
                        } else {
                            showTemplateChooser = true
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .alert("Select workout from template?", isPresented: $showTemplateChooser) {
                        Button("Yes") {
                            showGroupWorkoutSetup = true
                        }
                        Button("No, Start Empty Workout") {
                            selectedAthleteIDs = Set(localStore.athletes.map(\.id))
                            showAthletePicker = true
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("You can choose a different workout template for each group.")
                    }
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
        }
    }

    private var activeWorkoutView: some View {
        VStack(spacing: 0) {
            if groupedTimers.count > 1 {
                TopTabBar(
                    options: groupedTimers.map(\.id),
                    selection: Binding(
                        get: { selectedGroupID.isEmpty ? groupedTimers.first?.id ?? "" : selectedGroupID },
                        set: { selectedGroupID = $0 }
                    ),
                    title: { id in
                        groupedTimers.first(where: { $0.id == id })?.groupName ?? ""
                    },
                    statusColor: { id in
                        guard let block = groupedTimers.first(where: { $0.id == id }) else { return nil }
                        return groupIndicatorColor(for: block)
                    }
                )
            }

            TabView(selection: Binding(
                get: { selectedGroupID.isEmpty ? groupedTimers.first?.id ?? "" : selectedGroupID },
                set: { selectedGroupID = $0 }
            )) {
                ForEach(groupedTimers) { block in
                    GroupWorkoutPage(
                        block: block,
                        elapsedMilliseconds: timerRuntimeStore.elapsedMilliseconds(for: block),
                        displayTick: timerRuntimeStore.displayTick,
                        preferences: localStore.timerPreferences,
                        athleteProgressByID: timerRuntimeStore.athleteProgressByID,
                        structuredSteps: timerRuntimeStore.structuredSteps,
                        structuredStepsByAthleteID: timerRuntimeStore.structuredStepsByAthleteID,
                        onStartGroup: { timerRuntimeStore.startGroup(block.groupID) },
                        onStopGroup: { timerRuntimeStore.stopGroup(block.groupID) },
                        onLapGroup: { timerRuntimeStore.lapGroup(block.groupID) },
                        onAdvanceGroup: { timerRuntimeStore.advanceGroup(block.groupID) },
                        onStartAthlete: { timerRuntimeStore.startAthlete($0) },
                        onStopAthlete: { timerRuntimeStore.stopAthlete($0) },
                        onSplitAthlete: { timerRuntimeStore.recordSplit(for: $0) },
                        onUndoSplit: { timerRuntimeStore.undoLastSplit(for: $0) },
                        onAdvanceAthlete: { timerRuntimeStore.advanceAthlete($0) }
                    )
                    .tag(block.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        }
    }

    private var readySubtitle: String {
        let athleteCount = localStore.athletes.count
        let groupCount = localStore.groups.count
        if groupCount > 0 {
            return "\(athleteCount) athlete\(athleteCount == 1 ? "" : "s") on roster in \(groupCount) group\(groupCount == 1 ? "" : "s")"
        }
        return "\(athleteCount) athlete\(athleteCount == 1 ? "" : "s") on roster"
    }

    private var defaultWorkoutName: String {
        if let templateName = timerRuntimeStore.templateName {
            return "\(templateName) - \(Date().formatted(date: .abbreviated, time: .omitted))"
        }
        return Date().formatted(date: .abbreviated, time: .shortened)
    }

    private func groupIndicatorColor(for block: GroupTimerBlock) -> Color? {
        let hasRecovery = block.athletes.contains { athlete in
            timerRuntimeStore.athleteProgressByID[athlete.athleteID]?.stepStatus == .recoveryCountdown
        }
        if hasRecovery {
            return .orange
        }

        let hasReadyGo = block.athletes.contains { athlete in
            guard let progress = timerRuntimeStore.athleteProgressByID[athlete.athleteID] else { return false }
            return progress.stepStatus == .recoveryWaiting
        }
        if hasReadyGo || block.groupStatus == .running || block.groupStatus == .idle {
            return AppTheme.Palette.success
        }
        return nil
    }

    private func beginSelectedWorkout() {
        let athleteIDs = Array(selectedAthleteIDs)
        timerRuntimeStore.startFreeformWorkout(athleteIDs: athleteIDs)

        selectedGroupID = groupedTimers.first?.id ?? ""
        showAthletePicker = false
    }
}

private struct AthleteSelectionSheet: View {
    let athletes: [Athlete]
    let groups: [TeamGroup]
    @Binding var selectedAthleteIDs: Set<String>
    let title: String
    let subtitle: String
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.title3.weight(.bold))
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(AppTheme.Metrics.screenPadding)

                HStack {
                    Button("Select All") {
                        selectedAthleteIDs = Set(athletes.map(\.id))
                    }
                    .disabled(selectedAthleteIDs.count == athletes.count)

                    Button("Clear") {
                        selectedAthleteIDs.removeAll()
                    }
                    .disabled(selectedAthleteIDs.isEmpty)

                    Spacer()

                    Text("\(selectedAthleteIDs.count) selected")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
                .padding(.horizontal, AppTheme.Metrics.screenPadding)
                .padding(.bottom, 10)

                List(athletes) { athlete in
                    let selected = selectedAthleteIDs.contains(athlete.id)
                    Button {
                        if selected {
                            selectedAthleteIDs.remove(athlete.id)
                        } else {
                            selectedAthleteIDs.insert(athlete.id)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(selected ? AppTheme.Palette.primary : AppTheme.Palette.surface)
                                    .frame(width: 24, height: 24)
                                if selected {
                                    Image(systemName: "checkmark")
                                        .font(.caption.bold())
                                        .foregroundStyle(.white)
                                }
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                Text(athlete.name)
                                    .font(.body.weight(.semibold))
                                if let group = groups.first(where: { $0.id == athlete.groupID }) {
                                    Text(group.name)
                                        .font(.footnote)
                                        .foregroundStyle(AppTheme.Palette.textSecondary)
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)

                HStack(spacing: 12) {
                    Button("Cancel", action: onCancel)
                        .buttonStyle(SecondaryButtonStyle())

                    Button("Start Workout", action: onConfirm)
                        .buttonStyle(TimerSuccessButtonStyle())
                        .disabled(selectedAthleteIDs.isEmpty)
                }
                .padding(AppTheme.Metrics.screenPadding)
            }
            .background(AppTheme.Palette.background)
        }
    }
}

private struct GroupTemplateSetupModal: View {
    let athletes: [Athlete]
    let groups: [TeamGroup]
    let templates: [TemplateSummary]
    let onCancel: () -> Void
    let onStart: ([GroupWorkoutAssignment]) -> Void

    @State private var selectedTabID = ""
    @State private var selectedAthleteIDsByTab: [String: Set<String>] = [:]
    @State private var selectedTemplateIDByTab: [String: String] = [:]
    @State private var didInitialize = false

    private var tabs: [GroupWorkoutSetupTab] {
        let groupedAthletes = Dictionary(grouping: athletes, by: \.groupID)
        var resolved: [GroupWorkoutSetupTab] = groups.compactMap { group in
            let members = groupedAthletes[group.id] ?? []
            guard !members.isEmpty else { return nil }
            return GroupWorkoutSetupTab(id: group.id, groupID: group.id, name: group.name, athletes: members.sorted(by: athleteSort))
        }
        if let unassigned = groupedAthletes[nil], !unassigned.isEmpty {
            resolved.append(
                GroupWorkoutSetupTab(
                    id: "__unassigned",
                    groupID: nil,
                    name: "Unassigned",
                    athletes: unassigned.sorted(by: athleteSort)
                )
            )
        }
        return resolved
    }

    private var selectedTab: GroupWorkoutSetupTab? {
        tabs.first(where: { $0.id == selectedTabID }) ?? tabs.first
    }

    private var selectedAthleteCount: Int {
        selectedAthleteIDsByTab.values.reduce(0) { $0 + $1.count }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if tabs.count > 1 {
                    TopTabBar(
                        options: tabs.map(\.id),
                        selection: Binding(
                            get: { selectedTabID.isEmpty ? (tabs.first?.id ?? "") : selectedTabID },
                            set: { selectedTabID = $0 }
                        ),
                        title: { id in
                            tabs.first(where: { $0.id == id })?.name ?? ""
                        }
                    )
                }

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let selectedTab {
                            HStack {
                                Text("Template")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                                Spacer()
                                Picker("Template", selection: Binding(
                                    get: { selectedTemplateIDByTab[selectedTab.id] ?? "" },
                                    set: { selectedTemplateIDByTab[selectedTab.id] = $0 }
                                )) {
                                    Text("No Template").tag("")
                                    ForEach(templates) { template in
                                        Text(template.name).tag(template.id)
                                    }
                                }
                                .pickerStyle(.menu)
                            }
                            .appCard()

                            HStack {
                                Button("Select All") {
                                    selectedAthleteIDsByTab[selectedTab.id] = Set(selectedTab.athletes.map(\.id))
                                }
                                .disabled((selectedAthleteIDsByTab[selectedTab.id] ?? []).count == selectedTab.athletes.count)

                                Button("Clear") {
                                    selectedAthleteIDsByTab[selectedTab.id] = []
                                }
                                .disabled((selectedAthleteIDsByTab[selectedTab.id] ?? []).isEmpty)

                                Spacer()

                                Text("\((selectedAthleteIDsByTab[selectedTab.id] ?? []).count) selected")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                            .padding(.horizontal, 2)

                            VStack(spacing: 0) {
                                ForEach(selectedTab.athletes) { athlete in
                                    Button {
                                        var selected = selectedAthleteIDsByTab[selectedTab.id] ?? []
                                        if selected.contains(athlete.id) {
                                            selected.remove(athlete.id)
                                        } else {
                                            selected.insert(athlete.id)
                                        }
                                        selectedAthleteIDsByTab[selectedTab.id] = selected
                                    } label: {
                                        HStack(spacing: 12) {
                                            let isSelected = (selectedAthleteIDsByTab[selectedTab.id] ?? []).contains(athlete.id)
                                            ZStack {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(isSelected ? AppTheme.Palette.primary : AppTheme.Palette.surface)
                                                    .frame(width: 24, height: 24)
                                                if isSelected {
                                                    Image(systemName: "checkmark")
                                                        .font(.caption.bold())
                                                        .foregroundStyle(.white)
                                                }
                                            }
                                            Text(athlete.name)
                                                .font(.body.weight(.semibold))
                                                .foregroundStyle(AppTheme.Palette.textPrimary)
                                            Spacer()
                                        }
                                        .padding(.vertical, 12)
                                        .padding(.horizontal, 14)
                                    }
                                    .buttonStyle(.plain)

                                    if athlete.id != selectedTab.athletes.last?.id {
                                        Divider()
                                    }
                                }
                            }
                            .appCard()
                        }
                    }
                    .padding(AppTheme.Metrics.screenPadding)
                    .padding(.bottom, 16)
                }
            }
            .background(AppTheme.Palette.background)
            .navigationTitle("Workout Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") {
                        onStart(makeAssignments())
                    }
                    .disabled(selectedAthleteCount == 0)
                }
            }
            .onAppear {
                guard !didInitialize else { return }
                didInitialize = true
                selectedTabID = tabs.first?.id ?? ""
                selectedAthleteIDsByTab = Dictionary(
                    uniqueKeysWithValues: tabs.map { tab in
                        (tab.id, Set(tab.athletes.map(\.id)))
                    }
                )
                selectedTemplateIDByTab = Dictionary(
                    uniqueKeysWithValues: tabs.map { tab in
                        (tab.id, "")
                    }
                )
            }
        }
    }

    private func makeAssignments() -> [GroupWorkoutAssignment] {
        tabs.compactMap { tab in
            let selected = Array(selectedAthleteIDsByTab[tab.id] ?? [])
            guard !selected.isEmpty else { return nil }
            let templateValue = selectedTemplateIDByTab[tab.id] ?? ""
            return GroupWorkoutAssignment(
                groupID: tab.groupID,
                templateID: templateValue.isEmpty ? nil : templateValue,
                athleteIDs: selected
            )
        }
    }

    private func athleteSort(_ left: Athlete, _ right: Athlete) -> Bool {
        left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
    }
}

private struct GroupWorkoutSetupTab: Identifiable, Hashable {
    let id: String
    let groupID: String?
    let name: String
    let athletes: [Athlete]
}

private struct GroupWorkoutPage: View {
    let block: GroupTimerBlock
    let elapsedMilliseconds: Int
    let displayTick: Int
    let preferences: TimerPreferences
    let athleteProgressByID: [String: AthleteWorkoutProgress]
    let structuredSteps: [ExpandedStep]?
    let structuredStepsByAthleteID: [String: [ExpandedStep]]
    let onStartGroup: () -> Void
    let onStopGroup: () -> Void
    let onLapGroup: () -> Void
    let onAdvanceGroup: () -> Void
    let onStartAthlete: (String) -> Void
    let onStopAthlete: (String) -> Void
    let onSplitAthlete: (String) -> Void
    let onUndoSplit: (String) -> Void
    let onAdvanceAthlete: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                contextBar
                groupClockCard
                athleteListCard
            }
            .padding(AppTheme.Metrics.screenPadding)
            .padding(.bottom, 32)
        }
    }

    private var contextBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let summary = stepSummary {
                Text(summary.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    ForEach(0..<summary.total, id: \.self) { index in
                        Capsule(style: .continuous)
                            .fill(index < summary.current ? AppTheme.Palette.primary : AppTheme.Palette.border)
                            .frame(maxWidth: .infinity)
                            .frame(height: 4)
                    }
                }
            } else {
                Text(block.groupName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }
        }
        .padding(.horizontal, 4)
    }

    private var groupClockCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("GROUP CLOCK")
                        .font(.caption2.weight(.bold))
                        .kerning(0.5)
                        .foregroundStyle(AppTheme.Palette.textSecondary)

                    Text(formatElapsedTime(milliseconds: elapsedMilliseconds))
                        .font(v1ClockFont)
                        .tracking(-1)
                        .monospacedDigit()
                        .foregroundStyle(AppTheme.Palette.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .layoutPriority(1)

                Spacer(minLength: 8)

                HStack(spacing: 8) {
                    if hasRecoveryReadyAthlete {
                        Button("Group GO", action: onAdvanceGroup)
                            .buttonStyle(TimerCompactSuccessButtonStyle())
                    } else if hasIdleAthlete {
                        Button("Start", action: onStartGroup)
                            .buttonStyle(TimerCompactSuccessButtonStyle())
                    } else if hasRunningAthlete {
                        Button("Lap", action: onLapGroup)
                            .buttonStyle(TimerCompactSecondaryButtonStyle())
                    }

                    if hasRunningAthlete || hasRecoveryReadyAthlete {
                        Button("Stop", action: onStopGroup)
                            .buttonStyle(TimerCompactDangerButtonStyle())
                    }
                }
            }

            HStack(spacing: 12) {
                statusLegend(label: "\(runningCount) running", color: AppTheme.Palette.success)
                statusLegend(label: "\(recoveryCount) rec", color: .orange)
                statusLegend(label: "\(doneCount) done", color: AppTheme.Palette.textSecondary)
            }
        }
        .appCard()
    }

    private var athleteListCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(block.athletes.enumerated()), id: \.element.id) { index, timer in
                AthleteTimerTile(
                    timer: timer,
                    displayTick: displayTick,
                    showTapHint: preferences.showTapHints,
                    progress: athleteProgressByID[timer.athleteID],
                    currentStep: currentStep(for: timer.athleteID),
                    onStart: { onStartAthlete(timer.athleteID) },
                    onStop: { onStopAthlete(timer.athleteID) },
                    onSplit: { onSplitAthlete(timer.athleteID) },
                    onUndo: { onUndoSplit(timer.athleteID) },
                    onAdvance: { onAdvanceAthlete(timer.athleteID) }
                )

                if index < block.athletes.count - 1 {
                    Divider()
                        .padding(.leading, 70)
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: AppTheme.Metrics.cornerRadius, style: .continuous)
                .fill(AppTheme.Palette.elevatedSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.Metrics.cornerRadius, style: .continuous)
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
    }

    private var runningCount: Int {
        block.athletes.filter { $0.status == .running }.count
    }

    private var recoveryCount: Int {
        block.athletes.filter { athlete in
            let status = athleteProgressByID[athlete.athleteID]?.stepStatus
            return status == .recoveryCountdown || status == .recoveryWaiting
        }.count
    }

    private var doneCount: Int {
        block.athletes.filter { athlete in
            athlete.status == .stopped || athleteProgressByID[athlete.athleteID]?.stepStatus == .completed
        }.count
    }

    private var hasIdleAthlete: Bool {
        block.athletes.contains(where: { $0.status == .idle })
    }

    private var hasRunningAthlete: Bool {
        block.athletes.contains(where: { $0.status == .running })
    }

    private var hasRecoveryReadyAthlete: Bool {
        block.athletes.contains(where: { athleteProgressByID[$0.athleteID]?.stepStatus == .recoveryWaiting })
    }

    private var stepSummary: (title: String, current: Int, total: Int)? {
        for athlete in block.athletes {
            guard let progress = athleteProgressByID[athlete.athleteID] else { continue }
            let athleteSteps = structuredStepsByAthleteID[athlete.athleteID] ?? structuredSteps
            guard let athleteSteps, !athleteSteps.isEmpty else { continue }
            let safeIndex = min(max(progress.currentStepIndex, 0), athleteSteps.count - 1)
            let currentStep = athleteSteps[safeIndex]
            return (
                title: "\(block.groupName) · Step \(safeIndex + 1) of \(athleteSteps.count) · \(currentStep.label.uppercased())",
                current: safeIndex + 1,
                total: athleteSteps.count
            )
        }
        return nil
    }

    private func statusLegend(label: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(.caption)
                .foregroundStyle(AppTheme.Palette.textSecondary)
        }
    }

    // Match HTML mono stack: ui-monospace, "SF Mono", Menlo, monospace.
    private var v1ClockFont: Font {
        for name in ["SFMono-Bold", "SF Mono", "Menlo-Bold"] {
            if let uiFont = UIFont(name: name, size: 40) {
                return Font(uiFont)
            }
        }
        return .system(size: 40, weight: .bold, design: .monospaced)
    }

    private func currentStep(for athleteID: String) -> ExpandedStep? {
        guard let progress = athleteProgressByID[athleteID] else {
            return nil
        }
        let athleteSteps = structuredStepsByAthleteID[athleteID] ?? structuredSteps
        guard let athleteSteps, athleteSteps.indices.contains(progress.currentStepIndex) else { return nil }
        return athleteSteps[progress.currentStepIndex]
    }
}

private struct AthleteTimerTile: View {
    let timer: AthleteTimerState
    let displayTick: Int
    let showTapHint: Bool
    let progress: AthleteWorkoutProgress?
    let currentStep: ExpandedStep?
    let onStart: () -> Void
    let onStop: () -> Void
    let onSplit: () -> Void
    let onUndo: () -> Void
    let onAdvance: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            avatar

            VStack(alignment: .leading, spacing: 3) {
                Text(timer.athleteName)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(statusLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(statusColor)
                    if let stepSubtitle {
                        Text(stepSubtitle)
                            .font(.caption)
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                            .lineLimit(1)
                    }
                }

                if let lastSplitText {
                    Text(lastSplitText)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }

                if showTapHint && timer.status == .running {
                    Text("tap = split")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                Text(timeValueLabel)
                    .font(v1RowTimerFont)
                    .tracking(-0.5)
                    .monospacedDigit()
                    .foregroundStyle(timeValueColor)
                Text(timeCaptionLabel)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }

            if timer.status == .running {
                Button("Stop", action: onStop)
                    .buttonStyle(TimerCompactDangerButtonStyle())
            } else if isRecoveryWaiting {
                Button("Go", action: onAdvance)
                    .buttonStyle(TimerCompactSuccessButtonStyle())
            } else if canUndo {
                Button("Undo", action: onUndo)
                    .buttonStyle(TimerCompactSecondaryButtonStyle())
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .background(rowBackground)
        .contentShape(Rectangle())
        .onTapGesture {
            handleTap()
        }
    }

    private var avatar: some View {
        ZStack(alignment: .topTrailing) {
            avatarContent
                .frame(width: 44, height: 44)

            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
                .offset(x: 2, y: -2)
        }
    }

    @ViewBuilder
    private var avatarContent: some View {
        if let photoURL = timer.photoURL {
            AsyncImage(url: photoURL) { phase in
                switch phase {
                case let .success(image):
                    image
                        .resizable()
                        .scaledToFill()
                default:
                    avatarInitials
                }
            }
            .clipShape(Circle())
        } else {
            avatarInitials
        }
    }

    private var avatarInitials: some View {
        Circle()
            .fill(statusColor.opacity(0.14))
            .overlay {
                Text(initials)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(statusColor)
            }
    }

    private var initials: String {
        let compactName = timer.athleteName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: \.isWhitespace)
            .joined()

        guard !compactName.isEmpty else {
            return "??"
        }

        return String(compactName.prefix(2)).uppercased()
    }

    private var statusColor: Color {
        if isCompletedWorkoutAthlete { return AppTheme.Palette.textSecondary }
        if isRecoveryCountdown { return .orange }
        if isRecoveryWaiting { return AppTheme.Palette.success }
        switch timer.status {
        case .idle:
            return AppTheme.Palette.textSecondary
        case .running:
            return AppTheme.Palette.success
        case .stopped:
            return AppTheme.Palette.danger
        }
    }

    private var statusLabel: String {
        if isRecoveryCountdown { return "Recovery" }
        if isRecoveryWaiting { return "Ready" }
        switch timer.status {
        case .idle:
            return "Ready"
        case .running:
            return "Running"
        case .stopped:
            return "Done"
        }
    }

    private var stepSubtitle: String? {
        if let currentStep, progress?.stepStatus == .active {
            return currentStep.label
        }
        if let progress, progress.stepStatus == .completed {
            return "\(workSplitCount) split\(workSplitCount == 1 ? "" : "s")"
        }
        return nil
    }

    private var timeValueLabel: String {
        if isRecoveryCountdown {
            return formatCountdown(milliseconds: recoveryRemainingMilliseconds)
        }
        if isRecoveryWaiting {
            return "GO"
        }
        if timer.status == .stopped, let finalSplit = timer.splits.last(where: \.isFinal) {
            return formatElapsedTime(milliseconds: finalSplit.elapsedMilliseconds)
        }
        if timer.status == .running, let liveCurrentLapMilliseconds {
            return formatElapsedTime(milliseconds: liveCurrentLapMilliseconds)
        }
        if let lapInfo {
            return formatElapsedTime(milliseconds: lapInfo.lastLapMilliseconds)
        }
        return "--"
    }

    private var timeCaptionLabel: String {
        if isRecoveryCountdown {
            return "REST"
        }
        if isRecoveryWaiting {
            return "GO"
        }
        if timer.status == .stopped {
            return "LAST"
        }
        if timer.status == .running {
            return "S\(workSplitCount + 1)"
        }
        return "READY"
    }

    private var timeValueColor: Color {
        if isCompletedWorkoutAthlete { return AppTheme.Palette.textSecondary }
        return AppTheme.Palette.textPrimary
    }

    private var isRecoveryCountdown: Bool {
        progress?.stepStatus == .recoveryCountdown
    }

    private var isRecoveryWaiting: Bool {
        progress?.stepStatus == .recoveryWaiting
    }

    private var recoveryRemainingMilliseconds: Int {
        guard isRecoveryCountdown,
              let started = progress?.recoveryStartedAt,
              let duration = currentStep?.durationMilliseconds else { return 0 }
        return max(0, duration - Int(Date().timeIntervalSince(started) * 1000))
    }

    private var workSplits: [RuntimeSplit] {
        timer.splits.filter { !$0.isRecoveryEnd }
    }

    private var workSplitCount: Int {
        workSplits.filter { !$0.isFinal }.count
    }

    private var lapInfo: (count: Int, lastLapMilliseconds: Int)? {
        guard let last = workSplits.last, !last.isFinal else { return nil }
        let previousElapsed = workSplits.dropLast().last?.elapsedMilliseconds ?? 0
        return (workSplitCount, last.elapsedMilliseconds - previousElapsed)
    }

    private var liveCurrentLapMilliseconds: Int? {
        guard timer.status == .running, let startedAt = timer.startedAt else { return nil }
        _ = displayTick
        let lapAnchor = timer.splits.last?.timestamp ?? startedAt
        return max(0, Int(Date().timeIntervalSince(lapAnchor) * 1000))
    }

    private var lastSplitText: String? {
        guard let milliseconds = lapInfo?.lastLapMilliseconds else { return nil }
        return "Last split \(formatElapsedTime(milliseconds: milliseconds))"
    }

    private var canUndo: Bool {
        guard let lastSplit = timer.splits.last else { return false }
        return !lastSplit.isFinal
    }

    private var v1RowTimerFont: Font {
        for name in ["SFMono-Bold", "SF Mono", "Menlo-Bold"] {
            if let uiFont = UIFont(name: name, size: 20) {
                return Font(uiFont)
            }
        }
        return .system(size: 20, weight: .bold, design: .monospaced)
    }

    private var isCompletedWorkoutAthlete: Bool {
        progress?.stepStatus == .completed
    }

    private var rowBackground: Color {
        isCompletedWorkoutAthlete ? AppTheme.Palette.surface : .clear
    }

    private func handleTap() {
        if isRecoveryWaiting {
            onAdvance()
            return
        }
        if isRecoveryCountdown {
            return
        }
        if timer.status == .idle {
            return
        }
        if timer.status == .running {
            onSplit()
        }
    }
}

private struct TimerCompactSuccessButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(
                Capsule(style: .continuous)
                    .fill(AppTheme.Palette.success.opacity(configuration.isPressed ? 0.84 : 1))
            )
    }
}

private struct TimerCompactDangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(
                Capsule(style: .continuous)
                    .fill(AppTheme.Palette.danger.opacity(configuration.isPressed ? 0.84 : 1))
            )
    }
}

private struct TimerCompactSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AppTheme.Palette.textPrimary)
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(
                Capsule(style: .continuous)
                    .fill(AppTheme.Palette.surface.opacity(configuration.isPressed ? 0.84 : 1))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
            )
    }
}

private struct TimerSuccessButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: AppTheme.Metrics.controlHeight)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(AppTheme.Palette.success.opacity(configuration.isPressed ? 0.84 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
    }
}

private struct TimerDangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: AppTheme.Metrics.controlHeight)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(AppTheme.Palette.danger.opacity(configuration.isPressed ? 0.84 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
    }
}

struct TimerSettingsScene: View {
    @ObservedObject var localStore: LocalStore

    var body: some View {
        Form {
            Section("Behavior") {
                Toggle("Auto-Reorder Athletes", isOn: Binding(
                    get: { localStore.timerPreferences.autoReorderAthletes },
                    set: { value in
                        Task {
                            await localStore.updateTimerPreferences { $0.autoReorderAthletes = value }
                        }
                    }
                ))

                Toggle("Show Tap Hints", isOn: Binding(
                    get: { localStore.timerPreferences.showTapHints },
                    set: { value in
                        Task {
                            await localStore.updateTimerPreferences { $0.showTapHints = value }
                        }
                    }
                ))
            }
        }
        .navigationTitle("Timer Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}
