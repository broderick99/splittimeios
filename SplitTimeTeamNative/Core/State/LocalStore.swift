import Foundation

@MainActor
final class LocalStore: ObservableObject {
    @Published private(set) var isLoading = true
    @Published private(set) var errorMessage: String?
    @Published private(set) var athletes: [Athlete] = []
    @Published private(set) var groups: [TeamGroup] = []
    @Published private(set) var templates: [WorkoutTemplate] = []
    @Published private(set) var templateRepeatGroups: [TemplateRepeatGroup] = []
    @Published private(set) var templateSteps: [TemplateStep] = []
    @Published private(set) var workouts: [Workout] = []
    @Published private(set) var workoutAthletes: [WorkoutAthlete] = []
    @Published private(set) var splits: [Split] = []
    @Published private(set) var timerPreferences: TimerPreferences = .default
    @Published private(set) var schedulePreferences: SchedulePreferences = .default

    private let repository: LocalDataRepository

    init(repository: LocalDataRepository) {
        self.repository = repository

        Task {
            await load()
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            apply(try await repository.load())
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    var templateSummaries: [TemplateSummary] {
        templates
            .map { template in
                TemplateSummary(
                    id: template.id,
                    name: template.name,
                    updatedAt: template.updatedAt,
                    stepCount: templateSteps.filter { $0.templateID == template.id }.count
                )
            }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    var workoutSummaries: [WorkoutSummary] {
        workouts
            .filter { $0.status == .completed }
            .map { workout in
                WorkoutSummary(
                    id: workout.id,
                    name: workout.name,
                    date: workout.date,
                    athleteCount: workoutAthletes.filter { $0.workoutID == workout.id }.count,
                    status: workout.status
                )
            }
            .sorted { $0.date > $1.date }
    }

    var teamStateSnapshot: TeamStateSnapshot {
        TeamStateSnapshot(athletes: athletes, groups: groups)
    }

    var templateLibrarySnapshot: TemplateLibrarySnapshot {
        TemplateLibrarySnapshot(
            templates: templates,
            repeatGroups: templateRepeatGroups,
            steps: templateSteps
        )
    }

    var completedWorkoutHistorySnapshot: CompletedWorkoutHistorySnapshot {
        CompletedWorkoutHistorySnapshot(
            workouts: workouts.filter { $0.status == .completed },
            workoutAthletes: workoutAthletes,
            splits: splits
        )
    }

    func applyRemoteTeamState(_ snapshot: TeamStateSnapshot) async {
        let existingByRemoteUserID: [String: Athlete] = Dictionary(
            uniqueKeysWithValues: athletes.compactMap { athlete in
                guard let remoteUserID = athlete.remoteUserID else { return nil }
                return (remoteUserID, athlete)
            }
        )

        let mergedAthletes = snapshot.athletes.map { remoteAthlete -> Athlete in
            guard let remoteUserID = remoteAthlete.remoteUserID,
                  let existing = existingByRemoteUserID[remoteUserID] else {
                return remoteAthlete
            }

            // Keep stable local ids for linked athlete accounts so historical local references
            // (timer selections, in-progress workflows) remain consistent after sync.
            return Athlete(
                id: existing.id,
                remoteUserID: remoteAthlete.remoteUserID,
                name: remoteAthlete.name,
                firstName: remoteAthlete.firstName,
                lastName: remoteAthlete.lastName,
                email: remoteAthlete.email,
                phone: remoteAthlete.phone,
                age: remoteAthlete.age,
                grade: remoteAthlete.grade,
                groupID: remoteAthlete.groupID,
                photoURL: remoteAthlete.photoURL,
                createdAt: remoteAthlete.createdAt
            )
        }

        athletes = sortAthletes(mergedAthletes)
        groups = sortGroups(snapshot.groups)
        await persist()
    }

    func mergeRemoteRosterMembers(_ members: [TeamRosterMember]) async {
        let rosterAthletes = members.filter { $0.role == .athlete }
        guard !rosterAthletes.isEmpty else { return }

        var mergedAthletes = athletes
        var didMutate = false

        for member in rosterAthletes {
            let firstName = normalizedNonEmpty(member.firstName)
            let lastName = normalizedNonEmpty(member.lastName)
            let email = normalizedNonEmpty(member.email)
            let phone = normalizedNonEmpty(member.phone)
            let grade = normalizedNonEmpty(member.grade)

            let fullName = [firstName, lastName]
                .compactMap { $0 }
                .joined(separator: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let displayName = fullName.isEmpty ? member.email : fullName

            if let index = mergedAthletes.firstIndex(where: { $0.remoteUserID == member.id }) {
                let current = mergedAthletes[index]
                let updated = Athlete(
                    id: current.id,
                    remoteUserID: member.id,
                    name: displayName,
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    phone: phone,
                    age: member.age,
                    grade: grade,
                    groupID: current.groupID,
                    photoURL: current.photoURL,
                    createdAt: current.createdAt
                )

                if updated != current {
                    mergedAthletes[index] = updated
                    didMutate = true
                }
                continue
            }

            if let email,
               let index = mergedAthletes.firstIndex(where: {
                   $0.remoteUserID == nil && ($0.email?.caseInsensitiveCompare(email) == .orderedSame)
               }) {
                let current = mergedAthletes[index]
                let updated = Athlete(
                    id: current.id,
                    remoteUserID: member.id,
                    name: displayName,
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    phone: phone,
                    age: member.age,
                    grade: grade,
                    groupID: current.groupID,
                    photoURL: current.photoURL,
                    createdAt: current.createdAt
                )

                if updated != current {
                    mergedAthletes[index] = updated
                    didMutate = true
                }
                continue
            }

            mergedAthletes.append(
                Athlete(
                    id: makeID(),
                    remoteUserID: member.id,
                    name: displayName,
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    phone: phone,
                    age: member.age,
                    grade: grade,
                    groupID: nil,
                    photoURL: nil,
                    createdAt: Date()
                )
            )
            didMutate = true
        }

        guard didMutate else { return }
        athletes = sortAthletes(mergedAthletes)
        await persist()
    }

    func applyRemoteTemplateLibrary(_ snapshot: TemplateLibrarySnapshot) async {
        templates = snapshot.templates
        templateRepeatGroups = snapshot.repeatGroups
        templateSteps = snapshot.steps
        await persist()
    }

    func applyRemoteCompletedWorkoutHistory(_ snapshot: CompletedWorkoutHistorySnapshot) async {
        let remoteWorkoutIDs = Set(snapshot.workouts.map(\.id))
        let localNonCompletedWorkouts = workouts.filter { $0.status != .completed }
        let localCompletedUnsynced = workouts.filter { $0.status == .completed && !remoteWorkoutIDs.contains($0.id) }
        let keepWorkoutIDs = Set((localNonCompletedWorkouts + localCompletedUnsynced).map(\.id))

        workouts = localNonCompletedWorkouts + localCompletedUnsynced + snapshot.workouts
        workoutAthletes = workoutAthletes.filter { keepWorkoutIDs.contains($0.workoutID) } + snapshot.workoutAthletes
        splits = splits.filter { keepWorkoutIDs.contains($0.workoutID) } + snapshot.splits
        await persist()
    }

    func addAthlete(
        name: String,
        groupID: String? = nil,
        remoteUserID: String? = nil,
        firstName: String? = nil,
        lastName: String? = nil,
        email: String? = nil,
        phone: String? = nil,
        age: Int? = nil,
        grade: String? = nil,
        photoURL: URL? = nil
    ) async -> Athlete {
        let athlete = Athlete(
            id: makeID(),
            remoteUserID: remoteUserID,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            age: age,
            grade: grade,
            groupID: groupID,
            photoURL: photoURL,
            createdAt: Date()
        )

        athletes = sortAthletes(athletes + [athlete])
        await persist()
        return athlete
    }

    func updateAthlete(
        athleteID: String,
        name: String? = nil,
        firstName: String? = nil,
        lastName: String? = nil,
        email: String? = nil,
        phone: String? = nil,
        age: Int? = nil,
        grade: String? = nil,
        groupID: String?? = nil,
        photoURL: URL? = nil
    ) async {
        athletes = sortAthletes(
            athletes.map { athlete in
                guard athlete.id == athleteID else { return athlete }
                return Athlete(
                    id: athlete.id,
                    remoteUserID: athlete.remoteUserID,
                    name: name ?? athlete.name,
                    firstName: firstName ?? athlete.firstName,
                    lastName: lastName ?? athlete.lastName,
                    email: email ?? athlete.email,
                    phone: phone ?? athlete.phone,
                    age: age ?? athlete.age,
                    grade: grade ?? athlete.grade,
                    groupID: groupID ?? athlete.groupID,
                    photoURL: photoURL ?? athlete.photoURL,
                    createdAt: athlete.createdAt
                )
            }
        )
        await persist()
    }

    func deleteAthlete(_ athleteID: String) async {
        athletes.removeAll { $0.id == athleteID }
        await persist()
    }

    func addGroup(name: String, colorHex: String) async -> TeamGroup {
        let group = TeamGroup(
            id: makeID(),
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            colorHex: colorHex,
            sortOrder: (groups.map(\.sortOrder).max() ?? -1) + 1
        )
        groups = sortGroups(groups + [group])
        await persist()
        return group
    }

    func updateGroup(groupID: String, name: String? = nil, colorHex: String? = nil) async {
        groups = sortGroups(
            groups.map { group in
                guard group.id == groupID else { return group }
                return TeamGroup(
                    id: group.id,
                    name: name ?? group.name,
                    colorHex: colorHex ?? group.colorHex,
                    sortOrder: group.sortOrder
                )
            }
        )
        await persist()
    }

    func deleteGroup(_ groupID: String) async {
        groups.removeAll { $0.id == groupID }
        athletes = sortAthletes(
            athletes.map { athlete in
                guard athlete.groupID == groupID else { return athlete }
                return Athlete(
                    id: athlete.id,
                    remoteUserID: athlete.remoteUserID,
                    name: athlete.name,
                    firstName: athlete.firstName,
                    lastName: athlete.lastName,
                    email: athlete.email,
                    phone: athlete.phone,
                    age: athlete.age,
                    grade: athlete.grade,
                    groupID: nil,
                    photoURL: athlete.photoURL,
                    createdAt: athlete.createdAt
                )
            }
        )
        await persist()
    }

    func setGroupMembers(groupID: String, athleteIDs: [String]) async {
        let selected = Set(athleteIDs)
        athletes = sortAthletes(
            athletes.map { athlete in
                if selected.contains(athlete.id) {
                    return Athlete(
                        id: athlete.id,
                        remoteUserID: athlete.remoteUserID,
                        name: athlete.name,
                        firstName: athlete.firstName,
                        lastName: athlete.lastName,
                        email: athlete.email,
                        phone: athlete.phone,
                        age: athlete.age,
                        grade: athlete.grade,
                        groupID: groupID,
                        photoURL: athlete.photoURL,
                        createdAt: athlete.createdAt
                    )
                }

                if athlete.groupID == groupID {
                    return Athlete(
                        id: athlete.id,
                        remoteUserID: athlete.remoteUserID,
                        name: athlete.name,
                        firstName: athlete.firstName,
                        lastName: athlete.lastName,
                        email: athlete.email,
                        phone: athlete.phone,
                        age: athlete.age,
                        grade: athlete.grade,
                        groupID: nil,
                        photoURL: athlete.photoURL,
                        createdAt: athlete.createdAt
                    )
                }

                return athlete
            }
        )
        await persist()
    }

    func createTemplate(name: String, items: [BuilderItem]) async -> String {
        let templateID = makeID()
        let now = Date()
        let template = WorkoutTemplate(id: templateID, name: name, createdAt: now, updatedAt: now)
        let entities = Self.builderItemsToEntities(templateID: templateID, items: items)

        templates.append(template)
        templateRepeatGroups.removeAll { $0.templateID == templateID }
        templateSteps.removeAll { $0.templateID == templateID }
        templateRepeatGroups.append(contentsOf: entities.repeatGroups)
        templateSteps.append(contentsOf: entities.steps)
        await persist()
        return templateID
    }

    func updateTemplate(id: String, name: String, items: [BuilderItem]) async {
        templates = templates.map { template in
            guard template.id == id else { return template }
            return WorkoutTemplate(
                id: template.id,
                name: name,
                createdAt: template.createdAt,
                updatedAt: Date()
            )
        }

        let entities = Self.builderItemsToEntities(templateID: id, items: items)
        templateRepeatGroups.removeAll { $0.templateID == id }
        templateSteps.removeAll { $0.templateID == id }
        templateRepeatGroups.append(contentsOf: entities.repeatGroups)
        templateSteps.append(contentsOf: entities.steps)
        await persist()
    }

    func deleteTemplate(_ id: String) async {
        templates.removeAll { $0.id == id }
        templateRepeatGroups.removeAll { $0.templateID == id }
        templateSteps.removeAll { $0.templateID == id }
        await persist()
    }

    func templateDetail(id: String) -> (template: WorkoutTemplate, items: [BuilderItem])? {
        guard let template = templates.first(where: { $0.id == id }) else {
            return nil
        }

        let items = Self.entitiesToBuilderItems(
            steps: templateSteps.filter { $0.templateID == id },
            repeatGroups: templateRepeatGroups.filter { $0.templateID == id }
        )
        return (template, items)
    }

    func templateStepsAndGroups(id: String) -> (steps: [TemplateStep], repeatGroups: [TemplateRepeatGroup]) {
        (
            templateSteps.filter { $0.templateID == id },
            templateRepeatGroups.filter { $0.templateID == id }
        )
    }

    func saveCompletedWorkout(
        workoutID: String,
        name: String,
        templateID: String?,
        timerStates: [AthleteTimerState],
        structuredSteps: [ExpandedStep]?
    ) async -> String {
        let workout = Workout(
            id: workoutID,
            name: name,
            date: Date(),
            status: .completed,
            templateID: templateID
        )

        workouts.append(workout)
        workoutAthletes.removeAll { $0.workoutID == workoutID }
        splits.removeAll { $0.workoutID == workoutID }

        var splitRecords: [Split] = []
        for timer in timerStates {
            workoutAthletes.append(
                WorkoutAthlete(
                    workoutID: workoutID,
                    athleteID: timer.athleteID,
                    groupID: timer.groupID,
                    athleteName: timer.athleteName,
                    groupName: timer.groupName,
                    groupColorHex: timer.groupColorHex
                )
            )

            var outputSplitNumber = 0

            for runtimeSplit in timer.splits {
                outputSplitNumber += 1

                var stepType: TemplateStepType?
                var stepDistanceValue: Double?
                var stepDistanceUnit: DistanceUnit?
                var stepLabel: String?

                if let structuredSteps,
                   let stepIndex = runtimeSplit.stepIndex,
                   structuredSteps.indices.contains(stepIndex)
                {
                    let step = structuredSteps[stepIndex]
                    if runtimeSplit.isRecoveryEnd {
                        stepType = .recovery
                        stepDistanceValue = step.distanceValue
                        stepDistanceUnit = step.distanceUnit
                        stepLabel = step.label
                    } else if step.type == .work {
                        stepType = step.type
                        stepDistanceValue = step.distanceValue
                        stepDistanceUnit = step.distanceUnit
                        stepLabel = step.label
                    }
                }

                splitRecords.append(
                    Split(
                        id: makeID(),
                        workoutID: workoutID,
                        athleteID: timer.athleteID,
                        splitNumber: outputSplitNumber,
                        elapsedMilliseconds: runtimeSplit.elapsedMilliseconds,
                        timestamp: runtimeSplit.timestamp,
                        isFinal: runtimeSplit.isFinal,
                        stepType: stepType,
                        stepDistanceValue: stepDistanceValue,
                        stepDistanceUnit: stepDistanceUnit,
                        stepLabel: stepLabel
                    )
                )
            }
        }

        splits.append(contentsOf: splitRecords)
        await persist()
        return workoutID
    }

    func deleteWorkout(_ id: String) async {
        workouts.removeAll { $0.id == id }
        workoutAthletes.removeAll { $0.workoutID == id }
        splits.removeAll { $0.workoutID == id }
        await persist()
    }

    func workoutDetail(id: String) -> WorkoutDetail? {
        guard let workout = workouts.first(where: { $0.id == id }) else {
            return nil
        }

        let athleteEntries = workoutAthletes
            .filter { $0.workoutID == id }
            .sorted {
                let groupCompare = ($0.groupName ?? "Unassigned").localizedCaseInsensitiveCompare($1.groupName ?? "Unassigned")
                if groupCompare != .orderedSame {
                    return groupCompare == .orderedAscending
                }
                return $0.athleteName.localizedCaseInsensitiveCompare($1.athleteName) == .orderedAscending
            }

        let results = athleteEntries.map { athlete in
            let athleteSplits = splits
                .filter { $0.workoutID == id && $0.athleteID == athlete.athleteID }
                .sorted { $0.splitNumber < $1.splitNumber }
            let totalTime = athleteSplits.first(where: \.isFinal)?.elapsedMilliseconds
            return WorkoutAthleteResult(
                id: athlete.athleteID,
                athleteID: athlete.athleteID,
                athleteName: athlete.athleteName,
                groupName: athlete.groupName,
                groupColorHex: athlete.groupColorHex,
                splits: athleteSplits,
                totalTime: totalTime
            )
        }

        return WorkoutDetail(workout: workout, athletes: results)
    }

    func updateTimerPreferences(_ update: (inout TimerPreferences) -> Void) async {
        var next = timerPreferences
        update(&next)
        timerPreferences = next
        await persist()
    }

    func updateSchedulePreferences(_ update: (inout SchedulePreferences) -> Void) async {
        var next = schedulePreferences
        update(&next)
        schedulePreferences = next
        await persist()
    }

    private func apply(_ snapshot: LocalDataSnapshot) {
        athletes = sortAthletes(snapshot.athletes)
        groups = sortGroups(snapshot.groups)
        templates = snapshot.templates
        templateRepeatGroups = snapshot.templateRepeatGroups
        templateSteps = snapshot.templateSteps
        workouts = snapshot.workouts
        workoutAthletes = snapshot.workoutAthletes
        splits = snapshot.splits
        timerPreferences = snapshot.timerPreferences
        schedulePreferences = snapshot.schedulePreferences
    }

    private func persist() async {
        do {
            try await repository.save(
                LocalDataSnapshot(
                    athletes: athletes,
                    groups: groups,
                    templates: templates,
                    templateRepeatGroups: templateRepeatGroups,
                    templateSteps: templateSteps,
                    workouts: workouts,
                    workoutAthletes: workoutAthletes,
                    splits: splits,
                    timerPreferences: timerPreferences,
                    schedulePreferences: schedulePreferences
                )
            )
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func normalizedNonEmpty(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func builderItemsToEntities(
        templateID: String,
        items: [BuilderItem]
    ) -> (repeatGroups: [TemplateRepeatGroup], steps: [TemplateStep]) {
        var repeatGroups: [TemplateRepeatGroup] = []
        var steps: [TemplateStep] = []
        var sortOrder = 0

        for item in items {
            switch item {
            case let .step(step):
                steps.append(
                    TemplateStep(
                        id: step.id,
                        templateID: templateID,
                        sortOrder: sortOrder,
                        type: step.type,
                        distanceValue: step.distanceValue,
                        distanceUnit: step.distanceUnit,
                        durationMilliseconds: step.durationMilliseconds,
                        splitsPerStep: step.splitsPerStep,
                        label: step.label,
                        repeatGroupID: nil
                    )
                )
                sortOrder += 1

            case let .repeatGroup(group):
                repeatGroups.append(
                    TemplateRepeatGroup(
                        id: group.id,
                        templateID: templateID,
                        repeatCount: group.repeatCount,
                        sortOrder: sortOrder
                    )
                )

                for (index, step) in group.steps.enumerated() {
                    steps.append(
                        TemplateStep(
                            id: step.id,
                            templateID: templateID,
                            sortOrder: index,
                            type: step.type,
                            distanceValue: step.distanceValue,
                            distanceUnit: step.distanceUnit,
                            durationMilliseconds: step.durationMilliseconds,
                            splitsPerStep: step.splitsPerStep,
                            label: step.label,
                            repeatGroupID: group.id
                        )
                    )
                }
                sortOrder += 1
            }
        }

        return (repeatGroups, steps)
    }

    private static func entitiesToBuilderItems(
        steps: [TemplateStep],
        repeatGroups: [TemplateRepeatGroup]
    ) -> [BuilderItem] {
        var groupMap: [String: TemplateRepeatGroup] = [:]
        for group in repeatGroups {
            groupMap[group.id] = group
        }

        var standaloneSteps: [TemplateStep] = []
        var groupedSteps: [String: [TemplateStep]] = [:]

        for step in steps {
            if let repeatGroupID = step.repeatGroupID {
                groupedSteps[repeatGroupID, default: []].append(step)
            } else {
                standaloneSteps.append(step)
            }
        }

        for key in groupedSteps.keys {
            groupedSteps[key]?.sort { $0.sortOrder < $1.sortOrder }
        }

        enum TopLevelItem {
            case step(TemplateStep, Int)
            case repeatGroup(TemplateRepeatGroup, [TemplateStep], Int)
        }

        var topLevel: [TopLevelItem] = standaloneSteps.map { .step($0, $0.sortOrder) }
        for (groupID, groupSteps) in groupedSteps {
            if let group = groupMap[groupID] {
                topLevel.append(.repeatGroup(group, groupSteps, group.sortOrder))
            }
        }

        topLevel.sort { lhs, rhs in
            switch (lhs, rhs) {
            case let (.step(_, leftOrder), .step(_, rightOrder)),
                let (.step(_, leftOrder), .repeatGroup(_, _, rightOrder)),
                let (.repeatGroup(_, _, leftOrder), .step(_, rightOrder)),
                let (.repeatGroup(_, _, leftOrder), .repeatGroup(_, _, rightOrder)):
                return leftOrder < rightOrder
            }
        }

        return topLevel.map { item in
            switch item {
            case let .step(step, _):
                return .step(
                    BuilderStep(
                        id: step.id,
                        type: step.type,
                        distanceValue: step.distanceValue,
                        distanceUnit: step.distanceUnit,
                        durationMilliseconds: step.durationMilliseconds,
                        splitsPerStep: step.splitsPerStep,
                        label: step.label
                    )
                )
            case let .repeatGroup(group, groupSteps, _):
                return .repeatGroup(
                    BuilderRepeatGroup(
                        id: group.id,
                        repeatCount: group.repeatCount,
                        steps: groupSteps.map {
                            BuilderStep(
                                id: $0.id,
                                type: $0.type,
                                distanceValue: $0.distanceValue,
                                distanceUnit: $0.distanceUnit,
                                durationMilliseconds: $0.durationMilliseconds,
                                splitsPerStep: $0.splitsPerStep,
                                label: $0.label
                            )
                        }
                    )
                )
            }
        }
    }
}

private func sortAthletes(_ athletes: [Athlete]) -> [Athlete] {
    athletes.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
}

private func sortGroups(_ groups: [TeamGroup]) -> [TeamGroup] {
    groups.sorted {
        if $0.sortOrder != $1.sortOrder {
            return $0.sortOrder < $1.sortOrder
        }
        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
}

private func makeID() -> String {
    UUID().uuidString
}
