import Foundation

@MainActor
final class TimerRuntimeStore: ObservableObject {
    @Published private(set) var isActive = false
    @Published private(set) var workoutID: String?
    @Published private(set) var timerStatesByID: [String: AthleteTimerState] = [:]
    @Published private(set) var displayTick = 0
    @Published private(set) var structuredSteps: [ExpandedStep]?
    @Published private(set) var structuredStepsByAthleteID: [String: [ExpandedStep]] = [:]
    @Published private(set) var athleteProgressByID: [String: AthleteWorkoutProgress] = [:]
    @Published private(set) var templateID: String?
    @Published private(set) var templateName: String?

    private let localStore: LocalStore
    private let teamService: (any TeamServiceProtocol)?
    private var groupTimersByKey: [String: GroupTiming] = [:]
    private var activeGroups: [TeamGroup] = []
    private var ticker: Timer?

    init(localStore: LocalStore, teamService: (any TeamServiceProtocol)? = nil) {
        self.localStore = localStore
        self.teamService = teamService
    }

    func startFreeformWorkout(athleteIDs: [String]) {
        let athletes = localStore.athletes.filter { athleteIDs.contains($0.id) }
        let groups = localStore.groups.filter { group in
            athletes.contains { $0.groupID == group.id }
        }
        startWorkout(athletes: athletes, groups: groups, template: nil, expandedSteps: nil, expandedStepsByAthlete: [:])
    }

    func startTemplateWorkout(templateID: String, athleteIDs: [String]) {
        let athletes = localStore.athletes.filter { athleteIDs.contains($0.id) }
        let groups = localStore.groups.filter { group in
            athletes.contains { $0.groupID == group.id }
        }
        let detail = localStore.templateDetail(id: templateID)
        let expandedSteps: [ExpandedStep]? = {
            guard let detail else { return nil }
            let parts = localStore.templateStepsAndGroups(id: detail.template.id)
            return expandTemplate(steps: parts.steps, repeatGroups: parts.repeatGroups)
        }()
        startWorkout(
            athletes: athletes,
            groups: groups,
            template: detail.map { ($0.template.id, $0.template.name) },
            expandedSteps: expandedSteps,
            expandedStepsByAthlete: Dictionary(
                uniqueKeysWithValues: athletes.compactMap { athlete in
                    guard let expandedSteps else { return nil }
                    return (athlete.id, expandedSteps)
                }
            )
        )
    }

    func startGroupedTemplateWorkout(assignments: [GroupWorkoutAssignment]) {
        let selectedAthleteIDs = Set(assignments.flatMap(\.athleteIDs))
        let athletes = localStore.athletes.filter { selectedAthleteIDs.contains($0.id) }
        let groups = localStore.groups.filter { group in
            athletes.contains { $0.groupID == group.id }
        }

        var expandedStepsByAthlete: [String: [ExpandedStep]] = [:]
        var templateNamesByID: [String: String] = [:]

        for assignment in assignments {
            guard let templateID = assignment.templateID else { continue }
            guard let detail = localStore.templateDetail(id: templateID) else { continue }
            let parts = localStore.templateStepsAndGroups(id: detail.template.id)
            let expanded = expandTemplate(steps: parts.steps, repeatGroups: parts.repeatGroups)
            templateNamesByID[templateID] = detail.template.name
            for athleteID in assignment.athleteIDs {
                expandedStepsByAthlete[athleteID] = expanded
            }
        }

        let selectedTemplateIDs = Set(assignments.compactMap(\.templateID))
        let singleTemplateID = selectedTemplateIDs.count == 1 ? selectedTemplateIDs.first : nil
        let singleTemplateName = singleTemplateID.flatMap { templateNamesByID[$0] }

        startWorkout(
            athletes: athletes,
            groups: groups,
            template: singleTemplateID.flatMap { id in
                singleTemplateName.map { (id, $0) }
            },
            expandedSteps: nil,
            expandedStepsByAthlete: expandedStepsByAthlete
        )
    }

    func startAthlete(_ athleteID: String) {
        let now = Date()
        guard let timer = timerStatesByID[athleteID], timer.status == .idle else { return }
        timerStatesByID[athleteID] = AthleteTimerState(
            id: timer.id,
            athleteID: timer.athleteID,
            athleteName: timer.athleteName,
            photoURL: timer.photoURL,
            groupID: timer.groupID,
            groupName: timer.groupName,
            groupColorHex: timer.groupColorHex,
            status: .running,
            startedAt: now,
            stoppedAt: nil,
            splits: timer.splits
        )

        let key = groupKey(timer.groupID)
        if var groupTiming = groupTimersByKey[key], groupTiming.startedAt == nil {
            groupTiming.startedAt = now
            groupTimersByKey[key] = groupTiming
        }

        if let progress = athleteProgressByID[athleteID], progress.stepStatus == .pending {
            athleteProgressByID[athleteID] = AthleteWorkoutProgress(
                currentStepIndex: progress.currentStepIndex,
                stepStatus: .active,
                recoveryStartedAt: nil
            )
        }
    }

    func stopAthlete(_ athleteID: String) {
        let now = Date()
        guard let timer = timerStatesByID[athleteID], timer.status == .running, let startedAt = timer.startedAt else {
            return
        }

        let finalSplit = RuntimeSplit(
            splitNumber: timer.splits.count + 1,
            elapsedMilliseconds: Int(now.timeIntervalSince(startedAt) * 1000),
            timestamp: now,
            isFinal: true,
            isRecoveryEnd: false
        )

        timerStatesByID[athleteID] = AthleteTimerState(
            id: timer.id,
            athleteID: timer.athleteID,
            athleteName: timer.athleteName,
            photoURL: timer.photoURL,
            groupID: timer.groupID,
            groupName: timer.groupName,
            groupColorHex: timer.groupColorHex,
            status: .stopped,
            startedAt: startedAt,
            stoppedAt: now,
            splits: timer.splits + [finalSplit]
        )

        let remainingRunningInGroup = timerStatesByID.values.contains {
            $0.athleteID != athleteID && $0.groupID == timer.groupID && $0.status == .running
        }
        if !remainingRunningInGroup {
            let key = groupKey(timer.groupID)
            if var groupTiming = groupTimersByKey[key], groupTiming.startedAt != nil, groupTiming.stoppedAt == nil {
                groupTiming.stoppedAt = now
                groupTimersByKey[key] = groupTiming
            }
        }

        if let progress = athleteProgressByID[athleteID] {
            athleteProgressByID[athleteID] = AthleteWorkoutProgress(
                currentStepIndex: progress.currentStepIndex,
                stepStatus: .completed,
                recoveryStartedAt: nil
            )
        }
    }

    func recordSplit(for athleteID: String) {
        let now = Date()
        guard let timer = timerStatesByID[athleteID], timer.status == .running, let startedAt = timer.startedAt else {
            return
        }

        let split = RuntimeSplit(
            splitNumber: timer.splits.count + 1,
            elapsedMilliseconds: Int(now.timeIntervalSince(startedAt) * 1000),
            timestamp: now,
            isFinal: false,
            isRecoveryEnd: false
        )

        timerStatesByID[athleteID] = AthleteTimerState(
            id: timer.id,
            athleteID: timer.athleteID,
            athleteName: timer.athleteName,
            photoURL: timer.photoURL,
            groupID: timer.groupID,
            groupName: timer.groupName,
            groupColorHex: timer.groupColorHex,
            status: timer.status,
            startedAt: timer.startedAt,
            stoppedAt: timer.stoppedAt,
            splits: timer.splits + [split]
        )

        guard let progress = athleteProgressByID[athleteID], let structuredSteps = structuredSteps(for: athleteID) else { return }
        let nextIndex = progress.currentStepIndex + 1
        guard nextIndex < structuredSteps.count else { return }
        let nextStep = structuredSteps[nextIndex]
        athleteProgressByID[athleteID] = AthleteWorkoutProgress(
            currentStepIndex: nextIndex,
            stepStatus: nextStep.type == .recovery ? .recoveryCountdown : .active,
            recoveryStartedAt: nextStep.type == .recovery ? now : nil
        )
    }

    func undoLastSplit(for athleteID: String) {
        guard let timer = timerStatesByID[athleteID], let lastSplit = timer.splits.last, !lastSplit.isFinal else {
            return
        }

        timerStatesByID[athleteID] = AthleteTimerState(
            id: timer.id,
            athleteID: timer.athleteID,
            athleteName: timer.athleteName,
            photoURL: timer.photoURL,
            groupID: timer.groupID,
            groupName: timer.groupName,
            groupColorHex: timer.groupColorHex,
            status: timer.status,
            startedAt: timer.startedAt,
            stoppedAt: timer.stoppedAt,
            splits: Array(timer.splits.dropLast())
        )

        if let progress = athleteProgressByID[athleteID], progress.currentStepIndex > 0 {
            athleteProgressByID[athleteID] = AthleteWorkoutProgress(
                currentStepIndex: progress.currentStepIndex - 1,
                stepStatus: .active,
                recoveryStartedAt: nil
            )
        }
    }

    func advanceAthlete(_ athleteID: String) {
        guard let progress = athleteProgressByID[athleteID], progress.stepStatus == .recoveryWaiting, let structuredSteps = structuredSteps(for: athleteID) else {
            return
        }
        let now = Date()
        appendRecoveryEndSplit(for: athleteID, timestamp: now)

        let nextStepIndex = progress.currentStepIndex + 1
        if nextStepIndex >= structuredSteps.count {
            athleteProgressByID[athleteID] = AthleteWorkoutProgress(
                currentStepIndex: progress.currentStepIndex,
                stepStatus: .completed,
                recoveryStartedAt: nil
            )
            return
        }

        let nextStep = structuredSteps[nextStepIndex]
        athleteProgressByID[athleteID] = AthleteWorkoutProgress(
            currentStepIndex: nextStepIndex,
            stepStatus: nextStep.type == .recovery ? .recoveryCountdown : .active,
            recoveryStartedAt: nextStep.type == .recovery ? now : nil
        )
    }

    func startGroup(_ groupID: String?) {
        let now = Date()
        for timer in timerStatesByID.values where timer.groupID == groupID && timer.status == .idle {
            timerStatesByID[timer.athleteID] = AthleteTimerState(
                id: timer.id,
                athleteID: timer.athleteID,
                athleteName: timer.athleteName,
                photoURL: timer.photoURL,
                groupID: timer.groupID,
                groupName: timer.groupName,
                groupColorHex: timer.groupColorHex,
                status: .running,
                startedAt: now,
                stoppedAt: nil,
                splits: timer.splits
            )
        }

        let key = groupKey(groupID)
        if var groupTiming = groupTimersByKey[key], groupTiming.startedAt == nil {
            groupTiming.startedAt = now
            groupTimersByKey[key] = groupTiming
        }

        for (athleteID, progress) in athleteProgressByID where progress.stepStatus == .pending {
            guard timerStatesByID[athleteID]?.groupID == groupID else { continue }
            athleteProgressByID[athleteID] = AthleteWorkoutProgress(
                currentStepIndex: progress.currentStepIndex,
                stepStatus: .active,
                recoveryStartedAt: nil
            )
        }
    }

    func stopGroup(_ groupID: String?) {
        let now = Date()
        for timer in timerStatesByID.values where timer.groupID == groupID && timer.status == .running && timer.startedAt != nil {
            stopAthlete(timer.athleteID)
        }

        let key = groupKey(groupID)
        if var groupTiming = groupTimersByKey[key], groupTiming.startedAt != nil {
            groupTiming.stoppedAt = now
            groupTimersByKey[key] = groupTiming
        }

        for (athleteID, progress) in athleteProgressByID {
            guard timerStatesByID[athleteID]?.groupID == groupID, progress.stepStatus != .completed else { continue }
            athleteProgressByID[athleteID] = AthleteWorkoutProgress(
                currentStepIndex: progress.currentStepIndex,
                stepStatus: .completed,
                recoveryStartedAt: nil
            )
        }
    }

    func lapGroup(_ groupID: String?) {
        let athleteIDs = timerStatesByID.values
            .filter { $0.groupID == groupID && $0.status == .running }
            .map(\.athleteID)

        for athleteID in athleteIDs {
            recordSplit(for: athleteID)
        }
    }

    func advanceGroup(_ groupID: String?) {
        let athleteIDs = athleteProgressByID
            .filter { entry in
                entry.value.stepStatus == .recoveryWaiting && timerStatesByID[entry.key]?.groupID == groupID
            }
            .map(\.key)
        for athleteID in athleteIDs {
            advanceAthlete(athleteID)
        }
    }

    func resetWorkout() {
        let nextWorkoutID = UUID().uuidString
        workoutID = nextWorkoutID
        displayTick = 0

        timerStatesByID = timerStatesByID.mapValues { timer in
            AthleteTimerState(
                id: timer.id,
                athleteID: timer.athleteID,
                athleteName: timer.athleteName,
                photoURL: timer.photoURL,
                groupID: timer.groupID,
                groupName: timer.groupName,
                groupColorHex: timer.groupColorHex,
                status: .idle,
                startedAt: nil,
                stoppedAt: nil,
                splits: []
            )
        }

        groupTimersByKey = groupTimersByKey.mapValues { _ in GroupTiming(startedAt: nil, stoppedAt: nil) }

        athleteProgressByID = athleteProgressByID.mapValues { _ in
            AthleteWorkoutProgress(currentStepIndex: 0, stepStatus: .pending, recoveryStartedAt: nil)
        }
    }

    func saveWorkout(name: String?) async -> String? {
        guard let workoutID else { return nil }
        let resolvedName = (name?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? name! : defaultWorkoutName)
        let orderedTimers = groupedTimers(autoReorder: false).flatMap(\.athletes)
        let savedID = await localStore.saveCompletedWorkout(
            workoutID: workoutID,
            name: resolvedName,
            templateID: templateID,
            timerStates: orderedTimers,
            structuredSteps: savedStructuredSteps
        )
        await uploadCompletedWorkoutToBackend(
            workoutID: savedID,
            workoutName: resolvedName,
            templateID: templateID,
            orderedTimers: orderedTimers
        )
        discardWorkout()
        return savedID
    }

    func discardWorkout() {
        isActive = false
        workoutID = nil
        timerStatesByID = [:]
        groupTimersByKey = [:]
        displayTick = 0
        structuredSteps = nil
        structuredStepsByAthleteID = [:]
        athleteProgressByID = [:]
        templateID = nil
        templateName = nil
        stopTicking()
    }

    func groupedTimers(autoReorder: Bool) -> [GroupTimerBlock] {
        var grouped: [String?: [AthleteTimerState]] = [:]
        for timer in timerStatesByID.values {
            grouped[timer.groupID, default: []].append(timer)
        }

        var blocks: [GroupTimerBlock] = []

        for group in activeGroups {
            guard let athletes = grouped[group.id], !athletes.isEmpty else { continue }
            let sortedAthletes = autoReorder ? reorderAthletes(athletes) : athletes.sorted {
                $0.athleteName.localizedCaseInsensitiveCompare($1.athleteName) == .orderedAscending
            }
            let timing = resolvedTiming(for: group.id, athletes: sortedAthletes)
            blocks.append(
                GroupTimerBlock(
                    id: group.id,
                    groupID: group.id,
                    groupName: group.name,
                    groupColorHex: group.colorHex,
                    athletes: sortedAthletes,
                    groupStatus: deriveGroupStatus(for: sortedAthletes),
                    groupStartedAt: timing.startedAt,
                    groupStoppedAt: timing.stoppedAt
                )
            )
        }

        if let unassigned = grouped[nil], !unassigned.isEmpty {
            let sortedAthletes = autoReorder ? reorderAthletes(unassigned) : unassigned.sorted {
                $0.athleteName.localizedCaseInsensitiveCompare($1.athleteName) == .orderedAscending
            }
            let timing = resolvedTiming(for: nil, athletes: sortedAthletes)
            blocks.append(
                GroupTimerBlock(
                    id: "__unassigned",
                    groupID: nil,
                    groupName: "Unassigned",
                    groupColorHex: "A0A5B2",
                    athletes: sortedAthletes,
                    groupStatus: deriveGroupStatus(for: sortedAthletes),
                    groupStartedAt: timing.startedAt,
                    groupStoppedAt: timing.stoppedAt
                )
            )
        }

        return blocks
    }

    func elapsedMilliseconds(for groupBlock: GroupTimerBlock) -> Int {
        let target = groupedTimers(autoReorder: false).first { $0.id == groupBlock.id }
        guard let block = target else { return 0 }
        if let startedAt = block.groupStartedAt {
            let stopDate = block.groupStoppedAt ?? Date()
            return max(0, Int(stopDate.timeIntervalSince(startedAt) * 1000))
        }
        return 0
    }

    private func startWorkout(
        athletes: [Athlete],
        groups: [TeamGroup],
        template: (id: String, name: String)?,
        expandedSteps: [ExpandedStep]?,
        expandedStepsByAthlete: [String: [ExpandedStep]]
    ) {
        let id = UUID().uuidString
        let groupIDs = Set(athletes.map(\.groupID))
        activeGroups = groups.sorted { $0.sortOrder < $1.sortOrder }

        var nextTimers: [String: AthleteTimerState] = [:]
        var nextGroupTimers: [String: GroupTiming] = [:]
        var nextProgress: [String: AthleteWorkoutProgress] = [:]

        for athlete in athletes {
            let group = groups.first { $0.id == athlete.groupID }
            nextTimers[athlete.id] = AthleteTimerState(
                id: athlete.id,
                athleteID: athlete.id,
                athleteName: athlete.name,
                photoURL: athlete.photoURL,
                groupID: athlete.groupID,
                groupName: group?.name,
                groupColorHex: group?.colorHex,
                status: .idle,
                startedAt: nil,
                stoppedAt: nil,
                splits: []
            )

            if expandedSteps != nil || expandedStepsByAthlete[athlete.id] != nil {
                nextProgress[athlete.id] = AthleteWorkoutProgress(
                    currentStepIndex: 0,
                    stepStatus: .pending,
                    recoveryStartedAt: nil
                )
            }
        }

        for groupID in groupIDs {
            nextGroupTimers[groupKey(groupID)] = GroupTiming(startedAt: nil, stoppedAt: nil)
        }

        workoutID = id
        isActive = true
        timerStatesByID = nextTimers
        groupTimersByKey = nextGroupTimers
        displayTick = 0
        structuredSteps = expandedSteps
        structuredStepsByAthleteID = expandedStepsByAthlete
        athleteProgressByID = nextProgress
        templateID = template?.id
        templateName = template?.name
        startTicking()
    }

    private func reorderAthletes(_ athletes: [AthleteTimerState]) -> [AthleteTimerState] {
        athletes.sorted { left, right in
            let leftPhase = phasePriority(for: left)
            let rightPhase = phasePriority(for: right)
            if leftPhase != rightPhase { return leftPhase < rightPhase }

            let leftTimestamp = left.splits.last?.timestamp ?? .distantPast
            let rightTimestamp = right.splits.last?.timestamp ?? .distantPast
            if leftTimestamp != rightTimestamp { return leftTimestamp < rightTimestamp }

            let nameCompare = left.athleteName.localizedCaseInsensitiveCompare(right.athleteName)
            if nameCompare != .orderedSame {
                return nameCompare == .orderedAscending
            }

            return left.athleteID < right.athleteID
        }
    }

    private func phasePriority(for athlete: AthleteTimerState) -> Int {
        let progress = athleteProgressByID[athlete.athleteID]
        if progress?.stepStatus == .completed || athlete.status == .stopped {
            return 1
        }
        return 0
    }

    private func resolvedTiming(for groupID: String?, athletes: [AthleteTimerState]) -> GroupTiming {
        let timing = groupTimersByKey[groupKey(groupID)] ?? GroupTiming(startedAt: nil, stoppedAt: nil)

        let startedCandidates = athletes.compactMap(\.startedAt)
        let stoppedCandidates = athletes.compactMap(\.stoppedAt)

        var startedAt = timing.startedAt ?? startedCandidates.min()
        var stoppedAt = timing.stoppedAt
        if startedAt != nil, stoppedAt == nil, !athletes.contains(where: { $0.status == .running }) {
            stoppedAt = stoppedCandidates.max()
        }

        if startedAt == nil {
            startedAt = startedCandidates.min()
        }

        return GroupTiming(startedAt: startedAt, stoppedAt: stoppedAt)
    }

    private func deriveGroupStatus(for athletes: [AthleteTimerState]) -> TimerStatus {
        if athletes.contains(where: { $0.status == .running }) { return .running }
        if athletes.contains(where: { $0.status == .idle }) { return .idle }
        return .stopped
    }

    private func appendRecoveryEndSplit(for athleteID: String, timestamp: Date) {
        guard let timer = timerStatesByID[athleteID], let startedAt = timer.startedAt else { return }
        let split = RuntimeSplit(
            splitNumber: timer.splits.count + 1,
            elapsedMilliseconds: Int(timestamp.timeIntervalSince(startedAt) * 1000),
            timestamp: timestamp,
            isFinal: false,
            isRecoveryEnd: true
        )

        timerStatesByID[athleteID] = AthleteTimerState(
            id: timer.id,
            athleteID: timer.athleteID,
            athleteName: timer.athleteName,
            photoURL: timer.photoURL,
            groupID: timer.groupID,
            groupName: timer.groupName,
            groupColorHex: timer.groupColorHex,
            status: timer.status,
            startedAt: timer.startedAt,
            stoppedAt: timer.stoppedAt,
            splits: timer.splits + [split]
        )
    }

    private func startTicking() {
        guard ticker == nil else { return }
        let newTicker = Timer(timeInterval: 0.064, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.tick()
            }
        }
        RunLoop.main.add(newTicker, forMode: .common)
        ticker = newTicker
    }

    private func stopTicking() {
        ticker?.invalidate()
        ticker = nil
    }

    private func tick() {
        guard isActive else {
            stopTicking()
            return
        }

        displayTick += 1
        let now = Date()
        for (athleteID, progress) in athleteProgressByID where progress.stepStatus == .recoveryCountdown {
            guard let recoveryStartedAt = progress.recoveryStartedAt else { continue }
            guard let structuredSteps = structuredSteps(for: athleteID) else { continue }
            guard structuredSteps.indices.contains(progress.currentStepIndex) else { continue }
            let step = structuredSteps[progress.currentStepIndex]
            guard let duration = step.durationMilliseconds else { continue }

            if now.timeIntervalSince(recoveryStartedAt) * 1000 >= Double(duration) {
                athleteProgressByID[athleteID] = AthleteWorkoutProgress(
                    currentStepIndex: progress.currentStepIndex,
                    stepStatus: .recoveryWaiting,
                    recoveryStartedAt: recoveryStartedAt
                )
            }
        }
    }

    private var defaultWorkoutName: String {
        if let templateName {
            return "\(templateName) - \(Date().formatted(date: .abbreviated, time: .omitted))"
        }
        return Date().formatted(date: .abbreviated, time: .shortened)
    }

    private func groupKey(_ groupID: String?) -> String {
        groupID ?? "__unassigned"
    }

    private var savedStructuredSteps: [ExpandedStep]? {
        if let structuredSteps {
            return structuredSteps
        }

        let allSteps = Array(structuredStepsByAthleteID.values)
        guard !allSteps.isEmpty else { return nil }
        guard let first = allSteps.first else { return nil }
        if allSteps.dropFirst().allSatisfy({ $0 == first }) {
            return first
        }
        return nil
    }

    private func structuredSteps(for athleteID: String) -> [ExpandedStep]? {
        structuredStepsByAthleteID[athleteID] ?? structuredSteps
    }

    private func uploadCompletedWorkoutToBackend(
        workoutID: String,
        workoutName: String,
        templateID: String?,
        orderedTimers: [AthleteTimerState]
    ) async {
        guard let teamService else { return }
        guard let workout = localStore.workouts.first(where: { $0.id == workoutID }) else { return }

        let detailByAthleteID: [String: WorkoutAthleteResult] = {
            guard let detail = localStore.workoutDetail(id: workoutID) else { return [:] }
            return Dictionary(uniqueKeysWithValues: detail.athletes.map { ($0.athleteID, $0) })
        }()
        let athleteByID = Dictionary(uniqueKeysWithValues: localStore.athletes.map { ($0.id, $0) })

        let athletes = orderedTimers.map { timer in
            let detail = detailByAthleteID[timer.athleteID]
            let uploadedSplits: [CompletedWorkoutSplitUpload] = (detail?.splits ?? []).map { split in
                CompletedWorkoutSplitUpload(
                    splitNumber: split.splitNumber,
                    elapsedMilliseconds: split.elapsedMilliseconds,
                    timestamp: split.timestamp,
                    isFinal: split.isFinal,
                    stepType: split.stepType,
                    stepDistanceValue: split.stepDistanceValue,
                    stepDistanceUnit: split.stepDistanceUnit,
                    stepLabel: split.stepLabel
                )
            }

            return CompletedWorkoutAthleteUpload(
                athleteID: timer.athleteID,
                athleteUserID: athleteByID[timer.athleteID]?.remoteUserID,
                athleteEmail: athleteByID[timer.athleteID]?.email,
                athletePhone: athleteByID[timer.athleteID]?.phone,
                athleteName: timer.athleteName,
                groupID: timer.groupID,
                groupName: timer.groupName,
                groupColorHex: timer.groupColorHex,
                startedAt: timer.startedAt,
                stoppedAt: timer.stoppedAt,
                totalElapsedMilliseconds: detail?.totalTime ?? timer.splits.last?.elapsedMilliseconds,
                splits: uploadedSplits
            )
        }

        let payload = CompletedWorkoutUpload(
            id: workoutID,
            name: workoutName,
            workoutAt: workout.date,
            templateID: templateID,
            athletes: athletes
        )

        do {
            try await teamService.uploadCompletedWorkout(payload)
        } catch {
            // Keep local save successful even if network sync fails; feed will sync on future attempts.
        }
    }
}

private struct GroupTiming {
    var startedAt: Date?
    var stoppedAt: Date?
}
