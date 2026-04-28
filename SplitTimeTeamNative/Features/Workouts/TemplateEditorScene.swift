import SwiftUI

private enum WorkoutBuilderStyle {
    static let surfaceSecondary = Color(red: 0.945, green: 0.961, blue: 0.976)
    static let borderLight = Color(red: 0.945, green: 0.961, blue: 0.976)
    static let textTertiary = Color(red: 0.58, green: 0.66, blue: 0.74)
    static let recovery = Color(red: 0.85, green: 0.47, blue: 0.02)
    static let rowHorizontalPadding: CGFloat = 16
}

struct TemplateEditorScene: View {
    @ObservedObject var localStore: LocalStore
    let templateID: String?
    let onPersisted: (() async -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var items: [BuilderItem] = []
    @State private var hasLoaded = false
    @State private var errorMessage: String?
    @State private var stepEditorTarget: StepEditorTarget?
    @State private var showingDeleteConfirmation = false
    @State private var isReorderingWorkoutItem = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Workout Name")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)

                    TextField("Workout Name", text: $name)
                        .textInputAutocapitalization(.words)
                        .padding(.horizontal, 14)
                        .frame(height: 52)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(AppTheme.Palette.elevatedSurface)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(AppTheme.Palette.border, lineWidth: 1)
                        )
                }

                ZStack {
                    WorkoutBuilderUIKitList(
                        items: items,
                        onItemsReordered: { items = $0 },
                        onDragStateChanged: { isReorderingWorkoutItem = $0 },
                        onEditTopStep: { stepID in
                            guard let itemIndex = topLevelStepIndex(for: stepID) else { return }
                            stepEditorTarget = StepEditorTarget(itemIndex: itemIndex, stepIndex: nil)
                        },
                        onDeleteTopStep: { stepID in
                            guard let itemIndex = topLevelStepIndex(for: stepID) else { return }
                            deleteItem(at: itemIndex)
                        },
                        onDuplicateTopStep: { stepID in
                            guard let itemIndex = topLevelStepIndex(for: stepID) else { return }
                            duplicateItem(at: itemIndex)
                        },
                        onEditRepeatStep: { groupID, stepID in
                            guard let location = nestedStepLocation(groupID: groupID, stepID: stepID) else { return }
                            stepEditorTarget = StepEditorTarget(itemIndex: location.itemIndex, stepIndex: location.stepIndex)
                        },
                        onDeleteRepeatStep: { groupID, stepID in
                            guard let location = nestedStepLocation(groupID: groupID, stepID: stepID) else { return }
                            deleteGroupStep(itemIndex: location.itemIndex, stepIndex: location.stepIndex)
                        },
                        onDuplicateRepeatStep: { groupID, stepID in
                            guard let location = nestedStepLocation(groupID: groupID, stepID: stepID) else { return }
                            duplicateGroupStep(itemIndex: location.itemIndex, stepIndex: location.stepIndex)
                        },
                        onAddRepeatStep: { groupID in
                            guard let itemIndex = repeatGroupIndex(for: groupID) else { return }
                            stepEditorTarget = StepEditorTarget(itemIndex: itemIndex, stepIndex: nil, isNewNestedStep: true)
                        },
                        onIncrementRepeat: { groupID in
                            guard let itemIndex = repeatGroupIndex(for: groupID) else { return }
                            updateRepeatCount(at: itemIndex, delta: 1)
                        },
                        onDecrementRepeat: { groupID in
                            guard let itemIndex = repeatGroupIndex(for: groupID) else { return }
                            updateRepeatCount(at: itemIndex, delta: -1)
                        },
                        onDeleteRepeat: { groupID in
                            guard let itemIndex = repeatGroupIndex(for: groupID) else { return }
                            deleteItem(at: itemIndex)
                        }
                    )

                    if items.isEmpty {
                        ContentUnavailableView(
                            "No Steps Yet",
                            systemImage: "point.bottomleft.forward.to.point.topright.scurvepath",
                            description: Text("Add steps or repeat groups to build your workout.")
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                    }
                }

                HStack(spacing: 12) {
                    Button {
                        stepEditorTarget = StepEditorTarget(itemIndex: nil, stepIndex: nil)
                    } label: {
                        Label("Add Step", systemImage: "plus")
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button {
                        addRepeatGroup()
                    } label: {
                        Label("Add Repeat", systemImage: "repeat")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
        }
        .background(AppTheme.Palette.background)
        .scrollDisabled(isReorderingWorkoutItem)
        .navigationTitle(templateID == nil ? "New Workout" : "Edit Workout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if templateID != nil {
                ToolbarItem(placement: .topBarLeading) {
                    Button(role: .destructive) {
                        showingDeleteConfirmation = true
                    } label: {
                        Image(systemName: "trash")
                    }
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") {
                    Task {
                        await save()
                    }
                }
                .fontWeight(.bold)
            }
        }
        .task {
            guard !hasLoaded else { return }
            load()
        }
        .alert("Unable to Save", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
        .alert("Delete Workout?", isPresented: $showingDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        if let templateID {
                            await localStore.deleteTemplate(templateID)
                        }
                        if let onPersisted {
                            Task {
                                await onPersisted()
                            }
                        }
                        dismiss()
                    }
                }
        } message: {
            Text("This cannot be undone.")
        }
        .sheet(item: $stepEditorTarget) { target in
            StepEditorSheet(
                initialStep: resolvedInitialStep(for: target),
                onSave: { savedStep in
                    applySavedStep(savedStep, target: target)
                }
            )
        }
    }

    private func load() {
        hasLoaded = true
        guard let templateID else { return }
        guard let detail = localStore.templateDetail(id: templateID) else { return }
        name = detail.template.name
        items = detail.items
    }

    @MainActor
    private func save() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            errorMessage = "Please enter a name for this workout."
            return
        }
        guard !items.isEmpty else {
            errorMessage = "Add at least one step to the workout."
            return
        }

        if let templateID {
            await localStore.updateTemplate(id: templateID, name: trimmedName, items: items)
        } else {
            _ = await localStore.createTemplate(name: trimmedName, items: items)
        }
        Task {
            await localStore.load()
        }
        if let onPersisted {
            Task {
                await onPersisted()
            }
        }
        dismiss()
    }

    private func addRepeatGroup() {
        let group = BuilderRepeatGroup(
            id: UUID().uuidString,
            repeatCount: 4,
            steps: [
                BuilderStep(
                    id: UUID().uuidString,
                    type: .work,
                    distanceValue: 400,
                    distanceUnit: .meters,
                    durationMilliseconds: nil,
                    splitsPerStep: 1,
                    label: ""
                ),
                BuilderStep(
                    id: UUID().uuidString,
                    type: .recovery,
                    distanceValue: nil,
                    distanceUnit: nil,
                    durationMilliseconds: 120_000,
                    splitsPerStep: 1,
                    label: ""
                ),
            ]
        )
        items.append(.repeatGroup(group))
    }

    private func duplicateItem(at index: Int) {
        guard items.indices.contains(index) else { return }
        let item = items[index]
        switch item {
        case let .step(step):
            items.insert(
                .step(
                    BuilderStep(
                        id: UUID().uuidString,
                        type: step.type,
                        distanceValue: step.distanceValue,
                        distanceUnit: step.distanceUnit,
                        durationMilliseconds: step.durationMilliseconds,
                        splitsPerStep: step.splitsPerStep,
                        label: step.label
                    )
                ),
                at: index + 1
            )
        case let .repeatGroup(group):
            items.insert(
                .repeatGroup(
                    BuilderRepeatGroup(
                        id: UUID().uuidString,
                        repeatCount: group.repeatCount,
                        steps: group.steps.map {
                            BuilderStep(
                                id: UUID().uuidString,
                                type: $0.type,
                                distanceValue: $0.distanceValue,
                                distanceUnit: $0.distanceUnit,
                                durationMilliseconds: $0.durationMilliseconds,
                                splitsPerStep: $0.splitsPerStep,
                                label: $0.label
                            )
                        }
                    )
                ),
                at: index + 1
            )
        }
    }

    private func deleteItem(at index: Int) {
        guard items.indices.contains(index) else { return }
        items.remove(at: index)
    }

    private func updateRepeatCount(at index: Int, delta: Int) {
        guard case let .repeatGroup(group) = items[index] else { return }
        let next = max(1, group.repeatCount + delta)
        items[index] = .repeatGroup(
            BuilderRepeatGroup(id: group.id, repeatCount: next, steps: group.steps)
        )
    }

    private func deleteGroupStep(itemIndex: Int, stepIndex: Int) {
        guard case let .repeatGroup(group) = items[itemIndex], group.steps.indices.contains(stepIndex) else { return }
        var nextSteps = group.steps
        nextSteps.remove(at: stepIndex)
        if nextSteps.isEmpty {
            items.remove(at: itemIndex)
        } else {
            items[itemIndex] = .repeatGroup(
                BuilderRepeatGroup(id: group.id, repeatCount: group.repeatCount, steps: nextSteps)
            )
        }
    }

    private func duplicateGroupStep(itemIndex: Int, stepIndex: Int) {
        guard case let .repeatGroup(group) = items[itemIndex], group.steps.indices.contains(stepIndex) else { return }
        let step = group.steps[stepIndex]
        let duplicate = BuilderStep(
            id: UUID().uuidString,
            type: step.type,
            distanceValue: step.distanceValue,
            distanceUnit: step.distanceUnit,
            durationMilliseconds: step.durationMilliseconds,
            splitsPerStep: step.splitsPerStep,
            label: step.label
        )
        var nextSteps = group.steps
        nextSteps.insert(duplicate, at: stepIndex + 1)
        items[itemIndex] = .repeatGroup(
            BuilderRepeatGroup(id: group.id, repeatCount: group.repeatCount, steps: nextSteps)
        )
    }

    private func resolvedInitialStep(for target: StepEditorTarget) -> BuilderStep? {
        if let itemIndex = target.itemIndex {
            switch items[itemIndex] {
            case let .step(step):
                return step
            case let .repeatGroup(group):
                if let stepIndex = target.stepIndex, group.steps.indices.contains(stepIndex) {
                    return group.steps[stepIndex]
                }
                return nil
            }
        }

        return nil
    }

    private func applySavedStep(_ savedStep: BuilderStep, target: StepEditorTarget) {
        if let itemIndex = target.itemIndex {
            switch items[itemIndex] {
            case .step:
                items[itemIndex] = .step(savedStep)
            case let .repeatGroup(group):
                var nextSteps = group.steps
                if let stepIndex = target.stepIndex, nextSteps.indices.contains(stepIndex) {
                    nextSteps[stepIndex] = savedStep
                } else {
                    nextSteps.append(savedStep)
                }
                items[itemIndex] = .repeatGroup(
                    BuilderRepeatGroup(id: group.id, repeatCount: group.repeatCount, steps: nextSteps)
                )
            }
        } else {
            items.append(.step(savedStep))
        }
    }

    private func topLevelStepIndex(for stepID: String) -> Int? {
        items.firstIndex {
            if case let .step(step) = $0 {
                return step.id == stepID
            }
            return false
        }
    }

    private func repeatGroupIndex(for groupID: String) -> Int? {
        items.firstIndex {
            if case let .repeatGroup(group) = $0 {
                return group.id == groupID
            }
            return false
        }
    }

    private func nestedStepLocation(groupID: String, stepID: String) -> (itemIndex: Int, stepIndex: Int)? {
        guard let itemIndex = repeatGroupIndex(for: groupID),
              case let .repeatGroup(group) = items[itemIndex],
              let stepIndex = group.steps.firstIndex(where: { $0.id == stepID }) else {
            return nil
        }
        return (itemIndex, stepIndex)
    }
}

private struct BuilderItemCard: View {
    let item: BuilderItem
    let onEditStep: () -> Void
    let onDuplicate: () -> Void
    let onDelete: () -> Void
    let onIncrementRepeat: () -> Void
    let onDecrementRepeat: () -> Void
    let onAddGroupStep: () -> Void
    let onEditGroupStep: (Int) -> Void
    let onDeleteGroupStep: (Int) -> Void
    let onDuplicateGroupStep: (Int) -> Void
    @Binding var draggedItemID: String?
    let dragOffset: CGFloat
    let onStartRootDrag: () -> Void
    let onRootDragChanged: (CGFloat) -> Void
    let onEndRootDrag: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch item {
            case let .step(step):
                WorkoutStepCard(
                    step: step,
                    isDragging: draggedItemID == item.id,
                    onEdit: onEditStep,
                    onStartDrag: onStartRootDrag,
                    onDragChanged: onRootDragChanged,
                    onEndDrag: onEndRootDrag,
                    onDuplicate: onDuplicate,
                    onDelete: onDelete
                )

            case let .repeatGroup(group):
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 12) {
                        Text("Repeat")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(AppTheme.Palette.textPrimary)

                        Spacer()

                        HStack(spacing: 8) {
                            RepeatStepperButton(
                                systemName: "minus",
                                disabled: false,
                                action: onDecrementRepeat
                            )

                            Text("\(group.repeatCount)")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(AppTheme.Palette.textPrimary)
                                .frame(minWidth: 24)

                            RepeatStepperButton(
                                systemName: "plus",
                                disabled: false,
                                action: onIncrementRepeat
                            )
                        }

                        Button(action: onDelete) {
                            Image(systemName: "xmark")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(WorkoutBuilderStyle.textTertiary)
                        }
                    }
                    .padding(.horizontal, WorkoutBuilderStyle.rowHorizontalPadding)
                    .padding(.vertical, 12)
                    .background(AppTheme.Palette.elevatedSurface)
                    .overlay(
                        Rectangle()
                            .fill(WorkoutBuilderStyle.borderLight)
                            .frame(height: group.steps.isEmpty ? 0 : 1),
                        alignment: .bottom
                    )

                    if !group.steps.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Array(group.steps.enumerated()), id: \.element.id) { index, step in
                                RepeatGroupStepRow(
                                    step: step,
                                    onEdit: { onEditGroupStep(index) },
                                    onDuplicate: { onDuplicateGroupStep(index) },
                                    onDelete: { onDeleteGroupStep(index) }
                                )
                            }

                            Button(action: onAddGroupStep) {
                                Label("Add Step", systemImage: "plus")
                                    .font(.system(size: 13, weight: .semibold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 11)
                            }
                            .foregroundStyle(AppTheme.Palette.primary)
                            .background(AppTheme.Palette.elevatedSurface)
                            .overlay(
                                Rectangle()
                                    .fill(WorkoutBuilderStyle.borderLight)
                                    .frame(height: 1),
                                alignment: .top
                            )
                        }
                        .padding(8)
                    } else {
                        Button(action: onAddGroupStep) {
                            Label("Add Step", systemImage: "plus")
                                .font(.system(size: 13, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                        }
                        .foregroundStyle(AppTheme.Palette.primary)
                        .background(AppTheme.Palette.elevatedSurface)
                        .overlay(
                            Rectangle()
                                .fill(WorkoutBuilderStyle.borderLight)
                                .frame(height: 1),
                            alignment: .top
                        )
                        .padding(8)
                    }
                }
                .background(AppTheme.Palette.elevatedSurface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(AppTheme.Palette.border, lineWidth: 1)
                )
            }
        }
        .background(
            GeometryReader { proxy in
                Color.clear
                    .preference(key: BuilderItemFramePreferenceKey.self, value: [item.id: proxy.frame(in: .named("builderList"))])
            }
        )
        .offset(y: dragOffset)
        .zIndex(draggedItemID == item.id ? 10 : 0)
    }
}

private struct RepeatStepperButton: View {
    let systemName: String
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(disabled ? WorkoutBuilderStyle.textTertiary : AppTheme.Palette.textPrimary)
                .frame(width: 28, height: 28)
                .background(
                    Circle()
                        .fill(AppTheme.Palette.elevatedSurface)
                )
        }
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
    }
}

private struct WorkoutStepCard: View {
    let step: BuilderStep
    let isDragging: Bool
    let onEdit: () -> Void
    let onStartDrag: () -> Void
    let onDragChanged: (CGFloat) -> Void
    let onEndDrag: () -> Void
    let onDuplicate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Rectangle()
                .fill(step.type == .work ? AppTheme.Palette.primary : WorkoutBuilderStyle.recovery)
                .frame(width: 4, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(step.type == .work ? "Work" : "Recovery")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(WorkoutBuilderStyle.textTertiary)
                    .textCase(.uppercase)

                Text(step.label.isEmpty ? topStepSummary(for: step) : step.label)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .lineLimit(1)
            }

            if let secondarySummary {
                Text(secondarySummary)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }

            Spacer(minLength: 0)

            ReorderGlyph()

            Button(action: onDuplicate) {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(WorkoutBuilderStyle.textTertiary)
            }

            Button(role: .destructive, action: onDelete) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(WorkoutBuilderStyle.textTertiary)
            }
        }
        .padding(.horizontal, WorkoutBuilderStyle.rowHorizontalPadding)
        .padding(.vertical, 12)
        .background(AppTheme.Palette.elevatedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
        .scaleEffect(isDragging ? 1.06 : 1)
        .shadow(color: .black.opacity(isDragging ? 0.16 : 0), radius: isDragging ? 8 : 0, y: isDragging ? 5 : 0)
        .zIndex(isDragging ? 20 : 0)
        .contentShape(Rectangle())
        .highPriorityGesture(reorderGesture, including: .all)
        .onTapGesture(perform: onEdit)
    }

    private var reorderGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.12)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named("builderList")))
            .onChanged { value in
                switch value {
                case .first(true):
                    onStartDrag()
                case .second(true, let drag?):
                    onDragChanged(drag.translation.height)
                default:
                    break
                }
            }
            .onEnded { _ in
                onEndDrag()
            }
    }

    private func topStepSummary(for step: BuilderStep) -> String {
        if let distanceValue = step.distanceValue, let distanceUnit = step.distanceUnit {
            return "\(formattedDistance(distanceValue))\(distanceUnit == .meters ? "" : " ")\(distanceUnit.rawValue)"
        }
        if let duration = step.durationMilliseconds {
            return formatCountdown(milliseconds: duration)
        }
        return step.type == .work ? "Work" : "Recovery"
    }

    private var secondarySummary: String? {
        guard !step.label.isEmpty else { return nil }
        return topStepSummary(for: step)
    }

    private func formattedDistance(_ value: Double) -> String {
        value.rounded(.towardZero) == value ? String(Int(value)) : String(format: "%.2f", value)
    }
}

private struct ReorderGlyph: View {
    var body: some View {
        Image(systemName: "line.3.horizontal")
            .font(.caption.weight(.semibold))
            .foregroundStyle(WorkoutBuilderStyle.textTertiary)
            .padding(6)
    }
}

private struct RepeatGroupStepRow: View {
    let step: BuilderStep
    let onEdit: () -> Void
    let onDuplicate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Rectangle()
                .fill(step.type == .work ? AppTheme.Palette.primary : WorkoutBuilderStyle.recovery)
                .frame(width: 4, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(step.type == .work ? "Work" : "Recovery")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(WorkoutBuilderStyle.textTertiary)
                    .textCase(.uppercase)

                Text(step.label.isEmpty ? autoStepLabel : step.label)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .lineLimit(1)
            }

            if let secondarySummary {
                Text(secondarySummary)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }

            Spacer(minLength: 0)

            ReorderGlyph()

            Button(action: onDuplicate) {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(WorkoutBuilderStyle.textTertiary)
            }

            Button(role: .destructive, action: onDelete) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(WorkoutBuilderStyle.textTertiary)
            }
        }
        .padding(.horizontal, WorkoutBuilderStyle.rowHorizontalPadding)
        .padding(.vertical, 12)
        .background(AppTheme.Palette.elevatedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
    }

    private var autoStepLabel: String {
        if let distanceValue = step.distanceValue, let distanceUnit = step.distanceUnit {
            return "\(formattedDistance(distanceValue))\(distanceUnit == .meters ? "" : " ")\(distanceUnit.rawValue)"
        }
        if let duration = step.durationMilliseconds {
            return formatCountdown(milliseconds: duration)
        }
        return step.type == .work ? "Work" : "Recovery"
    }

    private var secondarySummary: String? {
        guard !step.label.isEmpty else { return nil }
        return autoStepLabel
    }

    private func formattedDistance(_ value: Double) -> String {
        value.rounded(.towardZero) == value ? String(Int(value)) : String(format: "%.2f", value)
    }
}

private struct BuilderItemFramePreferenceKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]

    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private struct StepSummaryRow: View {
    let step: BuilderStep

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(step.label.isEmpty ? autoStepLabel : step.label)
                .font(.body.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)
            Text(stepMeta)
                .font(.footnote)
                .foregroundStyle(AppTheme.Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(AppTheme.Palette.surface)
        )
    }

    private var stepMeta: String {
        if let distanceValue = step.distanceValue, let distanceUnit = step.distanceUnit {
            return "\(formattedDistance(distanceValue)) \(distanceUnit.rawValue.uppercased()) • \(step.type == .work ? "Work" : "Recovery")"
        }
        if let duration = step.durationMilliseconds {
            return "\(formatCountdown(milliseconds: duration)) • \(step.type == .work ? "Work" : "Recovery")"
        }
        return step.type == .work ? "Work" : "Recovery"
    }

    private var autoStepLabel: String {
        if let distanceValue = step.distanceValue, let distanceUnit = step.distanceUnit {
            return "\(formattedDistance(distanceValue))\(distanceUnit == .meters ? "" : " ")\(distanceUnit.rawValue)"
        }
        if let duration = step.durationMilliseconds {
            return formatCountdown(milliseconds: duration)
        }
        return step.type == .work ? "Work" : "Recovery"
    }

    private func formattedDistance(_ value: Double) -> String {
        value.rounded(.towardZero) == value ? String(Int(value)) : String(format: "%.2f", value)
    }
}

private struct StepEditorTarget: Identifiable {
    let itemIndex: Int?
    let stepIndex: Int?
    var isNewNestedStep = false

    var id: String {
        "\(itemIndex.map(String.init) ?? "root")-\(stepIndex.map(String.init) ?? "new")-\(isNewNestedStep)"
    }
}

private struct StepEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    private let initialID: String
    @State private var type: TemplateStepType
    @State private var label: String
    @State private var mode: EditorMode
    @State private var distanceValue: String
    @State private var distanceUnit: DistanceUnit
    @State private var durationMinutes: String
    @State private var durationSeconds: String
    @State private var splitsPerStep: Int
    @State private var showSplitInfo = false

    let onSave: (BuilderStep) -> Void

    init(initialStep: BuilderStep?, onSave: @escaping (BuilderStep) -> Void) {
        self.onSave = onSave
        self.initialID = initialStep?.id ?? UUID().uuidString
        _type = State(initialValue: initialStep?.type ?? .work)
        _label = State(initialValue: initialStep?.label ?? "")
        if let initialStep, initialStep.distanceValue != nil {
            _mode = State(initialValue: .distance)
        } else if initialStep?.durationMilliseconds != nil {
            _mode = State(initialValue: .duration)
        } else {
            _mode = State(initialValue: .distance)
        }
        _distanceValue = State(initialValue: initialStep?.distanceValue.map {
            $0.rounded(.towardZero) == $0 ? String(Int($0)) : String($0)
        } ?? "400")
        _distanceUnit = State(initialValue: initialStep?.distanceUnit ?? .meters)
        let duration = initialStep?.durationMilliseconds ?? 0
        _durationMinutes = State(initialValue: duration > 0 ? String(duration / 60_000) : "2")
        _durationSeconds = State(initialValue: duration > 0 ? String((duration / 1_000) % 60) : "0")
        _splitsPerStep = State(initialValue: max(1, initialStep?.splitsPerStep ?? 1))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Step Type") {
                    Picker("Step Type", selection: $type) {
                        Text("Work").tag(TemplateStepType.work)
                        Text("Recovery").tag(TemplateStepType.recovery)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Value") {
                    Picker("Mode", selection: $mode) {
                        Text("Distance").tag(EditorMode.distance)
                        Text("Duration").tag(EditorMode.duration)
                    }
                    .pickerStyle(.segmented)

                    if mode == .distance {
                        TextField("Distance", text: $distanceValue)
                            .keyboardType(.decimalPad)
                        Picker("Unit", selection: $distanceUnit) {
                            Text("m").tag(DistanceUnit.meters)
                            Text("mi").tag(DistanceUnit.miles)
                            Text("km").tag(DistanceUnit.kilometers)
                        }
                    } else {
                        HStack {
                            TextField("Min", text: $durationMinutes)
                                .keyboardType(.numberPad)
                            Text(":")
                            TextField("Sec", text: $durationSeconds)
                                .keyboardType(.numberPad)
                        }
                    }
                }

                Section("Label") {
                    TextField("Optional label", text: $label)
                }

                if type == .work {
                    Section {
                        HStack {
                            Text("Splits Per Step")
                            Button {
                                showSplitInfo = true
                            } label: {
                                Image(systemName: "info.circle")
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                            .buttonStyle(.plain)
                            Spacer()
                            HStack(spacing: 10) {
                                Button {
                                    splitsPerStep = max(1, splitsPerStep - 1)
                                } label: {
                                    Image(systemName: "minus")
                                        .font(.caption.weight(.bold))
                                        .frame(width: 24, height: 24)
                                }
                                .buttonStyle(.bordered)
                                .disabled(splitsPerStep <= 1)

                                Text("\(splitsPerStep)")
                                    .font(.body.weight(.semibold))
                                    .frame(minWidth: 24, alignment: .center)

                                Button {
                                    splitsPerStep = min(6, splitsPerStep + 1)
                                } label: {
                                    Image(systemName: "plus")
                                        .font(.caption.weight(.bold))
                                        .frame(width: 24, height: 24)
                                }
                                .buttonStyle(.bordered)
                                .disabled(splitsPerStep >= 6)
                            }
                        }
                    } footer: {
                        if splitsPerStep > 1 {
                            Text("Timer records \(splitsPerStep) splits before moving to the next step.")
                        }
                    }
                }
            }
            .navigationTitle("Step")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Splits Per Step", isPresented: $showSplitInfo) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Use this when one step should capture multiple splits. Example: 800m with 2 splits records a 400 split first, then the step completes on the second split.")
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        onSave(buildStep())
                        dismiss()
                    }
                    .fontWeight(.bold)
                }
            }
        }
    }

    private func buildStep() -> BuilderStep {
        let trimmedLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if mode == .distance {
            return BuilderStep(
                id: initialID,
                type: type,
                distanceValue: Double(distanceValue.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 400,
                distanceUnit: distanceUnit,
                durationMilliseconds: nil,
                splitsPerStep: max(1, splitsPerStep),
                label: trimmedLabel
            )
        }

        let minutes = Int(durationMinutes) ?? 0
        let seconds = Int(durationSeconds) ?? 0
        return BuilderStep(
            id: initialID,
            type: type,
            distanceValue: nil,
            distanceUnit: nil,
            durationMilliseconds: max(0, (minutes * 60 + seconds) * 1_000),
            splitsPerStep: 1,
            label: trimmedLabel
        )
    }

    private enum EditorMode: Hashable {
        case distance
        case duration
    }
}

struct WorkoutDetailScene: View {
    @ObservedObject var localStore: LocalStore
    let workoutID: String
    private let recoveryColor = Color(red: 0.85, green: 0.47, blue: 0.02)

    var body: some View {
        Group {
            if let detail = localStore.workoutDetail(id: workoutID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(detail.workout.name)
                                .font(.largeTitle.weight(.bold))
                            Text(detail.workout.date.formatted(.dateTime.weekday(.wide).month(.wide).day().year().hour().minute()))
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.Palette.textSecondary)
                            Text("\(detail.athletes.count) athlete\(detail.athletes.count == 1 ? "" : "s")")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.Palette.textSecondary)
                        }
                        .appCard()

                        ForEach(groupedAthletes(detail.athletes), id: \.name) { group in
                            VStack(alignment: .leading, spacing: 10) {
                                Text(group.name)
                                    .font(.headline)
                                    .foregroundStyle(Color(hex: group.colorHex))
                                ForEach(group.athletes) { athlete in
                                    VStack(alignment: .leading, spacing: 10) {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(athlete.athleteName)
                                                    .font(.title3.weight(.semibold))
                                                Text((athlete.groupName ?? "Team").uppercased())
                                                    .font(.caption2.weight(.bold))
                                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                                            }
                                            Spacer(minLength: 10)
                                            if let totalTime = athlete.totalTime {
                                                Text(formatElapsedTime(milliseconds: totalTime))
                                                    .font(.title3.weight(.bold))
                                                    .monospacedDigit()
                                                    .foregroundStyle(AppTheme.Palette.primary)
                                            }
                                        }

                                        StructuredSplitTable(
                                            splits: athlete.splits,
                                            recoveryColor: recoveryColor
                                        )
                                    }
                                    .padding(10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                                            .fill(AppTheme.Palette.elevatedSurface)
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                                            .stroke(AppTheme.Palette.border, lineWidth: 1)
                                    )
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                }
                .background(AppTheme.Palette.background)
                .navigationTitle("Workout")
                .navigationBarTitleDisplayMode(.inline)
            } else {
                ContentUnavailableView("Workout Missing", systemImage: "clock.badge.xmark")
            }
        }
    }

    private func groupedAthletes(_ athletes: [WorkoutAthleteResult]) -> [(name: String, colorHex: String, athletes: [WorkoutAthleteResult])] {
        let grouped = Dictionary(grouping: athletes) { athlete in
            GroupBucketKey(
                name: athlete.groupName ?? "Unassigned",
                colorHex: athlete.groupColorHex ?? "A0A5B2"
            )
        }

        let mapped = grouped.map { key, value in
            (name: key.name, colorHex: key.colorHex, athletes: value)
        }

        return mapped.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

private struct StructuredSplitTable: View {
    let splits: [Split]
    let recoveryColor: Color

    var body: some View {
        VStack(spacing: 0) {
            headerRow
            Divider()
                .background(AppTheme.Palette.border)

            ForEach(Array(splits.enumerated()), id: \.element.id) { index, split in
                let previousElapsed = index > 0 ? splits[index - 1].elapsedMilliseconds : 0
                let lapMilliseconds = max(0, split.elapsedMilliseconds - previousElapsed)

                row(for: split, lapMilliseconds: lapMilliseconds)

                if index < splits.count - 1 {
                    Divider()
                        .background(AppTheme.Palette.border)
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(AppTheme.Palette.elevatedSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
    }

    private var headerRow: some View {
        HStack(spacing: 8) {
            Text("Step")
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Split")
                .frame(width: 78, alignment: .trailing)
            Text("Lap")
                .frame(width: 78, alignment: .trailing)
            Text("Pace")
                .frame(width: 86, alignment: .trailing)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(AppTheme.Palette.textSecondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func row(for split: Split, lapMilliseconds: Int) -> some View {
        HStack(spacing: 8) {
            Text(stepName(for: split))
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
                .foregroundStyle(split.stepType == .recovery ? recoveryColor : AppTheme.Palette.textPrimary)
            Text(formattedSplitMilliseconds(split.elapsedMilliseconds))
                .frame(width: 78, alignment: .trailing)
            Text(formattedSplitMilliseconds(lapMilliseconds))
                .frame(width: 78, alignment: .trailing)
            Text(paceText(for: split, lapMilliseconds: lapMilliseconds))
                .frame(width: 86, alignment: .trailing)
                .foregroundStyle(split.stepType == .recovery ? recoveryColor : AppTheme.Palette.textPrimary)
        }
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .monospacedDigit()
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
    }

    private func stepName(for split: Split) -> String {
        let trimmedLabel = split.stepLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if split.isFinal {
            return trimmedLabel.isEmpty ? "Finish" : trimmedLabel
        }
        if !trimmedLabel.isEmpty {
            return trimmedLabel
        }
        if let distanceValue = split.stepDistanceValue, let distanceUnit = split.stepDistanceUnit {
            return formattedDistance(value: distanceValue, unit: distanceUnit)
        }
        if split.stepType == .recovery {
            return "Recovery"
        }
        return "Split \(split.splitNumber)"
    }

    private func paceText(for split: Split, lapMilliseconds: Int) -> String {
        if split.stepType == .recovery {
            return "--"
        }

        guard let distanceValue = split.stepDistanceValue,
              let distanceUnit = split.stepDistanceUnit,
              distanceValue > 0,
              lapMilliseconds > 0 else {
            return "--"
        }

        let distanceInMiles = convertDistanceToMiles(value: distanceValue, unit: distanceUnit)
        guard distanceInMiles > 0 else { return "--" }

        let paceMinutes = (Double(lapMilliseconds) / 60_000.0) / distanceInMiles
        return "\(formatPaceMinutes(paceMinutes))/mi"
    }

    private func formattedSplitMilliseconds(_ milliseconds: Int?) -> String {
        guard let milliseconds, milliseconds >= 0 else { return "--" }

        let totalSeconds = milliseconds / 1_000
        let centiseconds = (milliseconds % 1_000) / 10
        let hours = totalSeconds / 3_600
        let minutes = (totalSeconds % 3_600) / 60
        let seconds = totalSeconds % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d.%02d", hours, minutes, seconds, centiseconds)
        }

        return String(format: "%d:%02d.%02d", minutes, seconds, centiseconds)
    }

    private func convertDistanceToMiles(value: Double, unit: DistanceUnit) -> Double {
        switch unit {
        case .meters:
            return value / 1609.34
        case .kilometers:
            return (value * 1000.0) / 1609.34
        case .miles:
            return value
        }
    }

    private func formatPaceMinutes(_ value: Double) -> String {
        guard value > 0, value.isFinite else { return "--:--" }
        let minutes = Int(floor(value))
        let seconds = Int(round((value - Double(minutes)) * 60))
        if seconds == 60 {
            return "\(minutes + 1):00"
        }
        return "\(minutes):\(String(format: "%02d", seconds))"
    }

    private func formattedDistance(value: Double, unit: DistanceUnit) -> String {
        let renderedValue: String
        if value.rounded(.towardZero) == value {
            renderedValue = String(Int(value))
        } else {
            renderedValue = String(format: "%.2f", value)
        }

        let separator = unit == .meters ? "" : " "
        return "\(renderedValue)\(separator)\(unit.rawValue)"
    }

}

private struct GroupBucketKey: Hashable {
    let name: String
    let colorHex: String
}
