import SwiftUI
import UIKit

struct WorkoutBuilderUIKitList: UIViewRepresentable {
    let items: [BuilderItem]
    let onItemsReordered: ([BuilderItem]) -> Void
    let onDragStateChanged: (Bool) -> Void
    let onEditTopStep: (String) -> Void
    let onDeleteTopStep: (String) -> Void
    let onDuplicateTopStep: (String) -> Void
    let onEditRepeatStep: (String, String) -> Void
    let onDeleteRepeatStep: (String, String) -> Void
    let onDuplicateRepeatStep: (String, String) -> Void
    let onAddRepeatStep: (String) -> Void
    let onIncrementRepeat: (String) -> Void
    let onDecrementRepeat: (String) -> Void
    let onDeleteRepeat: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> IntrinsicCollectionView {
        var configuration = UICollectionLayoutListConfiguration(appearance: .plain)
        configuration.showsSeparators = false
        configuration.backgroundColor = .clear

        let layout = UICollectionViewCompositionalLayout.list(using: configuration)
        let collectionView = IntrinsicCollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.backgroundColor = .clear
        collectionView.isScrollEnabled = false
        collectionView.dragInteractionEnabled = false
        context.coordinator.configure(collectionView: collectionView)
        return collectionView
    }

    func updateUIView(_ uiView: IntrinsicCollectionView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.apply(items: items, animatingDifferences: false)
    }
}

final class IntrinsicCollectionView: UICollectionView {
    override var contentSize: CGSize {
        didSet { invalidateIntrinsicContentSize() }
    }

    override var intrinsicContentSize: CGSize {
        layoutIfNeeded()
        return CGSize(width: UIView.noIntrinsicMetric, height: contentSize.height)
    }
}

extension WorkoutBuilderUIKitList {
    final class Coordinator: NSObject, UICollectionViewDelegate, UICollectionViewDataSource {
        private enum ReuseID {
            static let cell = "WorkoutBuilderListCell"
        }

        var parent: WorkoutBuilderUIKitList
        private weak var collectionView: IntrinsicCollectionView?
        private var currentRows: [WorkoutBuilderDisplayRow] = []
        private var isApplyingProgrammaticUpdate = false
        private var isInteractiveMovementActive = false
        private var isLongPressReordering = false
        private var draggedRowID: String?
        private var didMoveDuringCurrentDrag = false

        init(parent: WorkoutBuilderUIKitList) {
            self.parent = parent
        }

        func configure(collectionView: IntrinsicCollectionView) {
            self.collectionView = collectionView
            collectionView.dataSource = self
            collectionView.delegate = self
            collectionView.dragInteractionEnabled = false
            collectionView.register(WorkoutBuilderListCell.self, forCellWithReuseIdentifier: ReuseID.cell)

            let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
            longPress.minimumPressDuration = 0.3
            longPress.cancelsTouchesInView = false
            longPress.delaysTouchesBegan = false
            collectionView.addGestureRecognizer(longPress)

            apply(items: parent.items, animatingDifferences: false)
        }

        func apply(items: [BuilderItem], animatingDifferences: Bool) {
            guard !isInteractiveMovementActive else { return }
            currentRows = WorkoutBuilderDisplayRow.rows(from: items)
            isApplyingProgrammaticUpdate = true
            collectionView?.reloadData()
            collectionView?.collectionViewLayout.invalidateLayout()
            collectionView?.layoutIfNeeded()
            isApplyingProgrammaticUpdate = false
        }

        func numberOfSections(in collectionView: UICollectionView) -> Int {
            1
        }

        func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
            currentRows.count
        }

        func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
            let row = currentRows[indexPath.item]
            let cell = collectionView.dequeueReusableCell(withReuseIdentifier: ReuseID.cell, for: indexPath) as! WorkoutBuilderListCell
            cell.configure(
                row: row,
                isDragging: row.id == draggedRowID,
                onEditTopStep: parent.onEditTopStep,
                onDeleteTopStep: parent.onDeleteTopStep,
                onDuplicateTopStep: parent.onDuplicateTopStep,
                onEditRepeatStep: parent.onEditRepeatStep,
                onDeleteRepeatStep: parent.onDeleteRepeatStep,
                onDuplicateRepeatStep: parent.onDuplicateRepeatStep,
                onAddRepeatStep: parent.onAddRepeatStep,
                onIncrementRepeat: parent.onIncrementRepeat,
                onDecrementRepeat: parent.onDecrementRepeat,
                onDeleteRepeat: parent.onDeleteRepeat
            )
            return cell
        }

        func collectionView(_ collectionView: UICollectionView, shouldSelectItemAt indexPath: IndexPath) -> Bool {
            !isInteractiveMovementActive && !isLongPressReordering
        }

        func collectionView(_ collectionView: UICollectionView, canMoveItemAt indexPath: IndexPath) -> Bool {
            currentRows[indexPath.item].isMovable
        }

        func collectionView(_ collectionView: UICollectionView, moveItemAt sourceIndexPath: IndexPath, to destinationIndexPath: IndexPath) {
            guard sourceIndexPath.item != destinationIndexPath.item else { return }
            let moved = currentRows.remove(at: sourceIndexPath.item)
            let insertionIndex = max(0, min(destinationIndexPath.item, currentRows.count))
            currentRows.insert(moved, at: insertionIndex)
            didMoveDuringCurrentDrag = true
        }

        func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
            guard currentRows.indices.contains(indexPath.item) else { return }
            let row = currentRows[indexPath.item]
            switch row.role {
            case .step:
                if let step = row.step {
                    if let groupID = row.groupID {
                        parent.onEditRepeatStep(groupID, step.id)
                    } else {
                        parent.onEditTopStep(step.id)
                    }
                }
            case .repeatHeader:
                break
            case .repeatAdd:
                if let groupID = row.groupID {
                    parent.onAddRepeatStep(groupID)
                }
            }
            collectionView.deselectItem(at: indexPath, animated: true)
        }

        func collectionView(_ collectionView: UICollectionView, targetIndexPathForMoveFromItemAt originalIndexPath: IndexPath, toProposedIndexPath proposedIndexPath: IndexPath) -> IndexPath {
            let upperBound = max(0, currentRows.count - 1)
            let clampedItem = min(max(proposedIndexPath.item, 0), upperBound)
            return IndexPath(item: clampedItem, section: 0)
        }

        private func refreshVisibleCells() {
            collectionView?.visibleCells.compactMap { $0 as? WorkoutBuilderListCell }.forEach {
                $0.setDragging($0.rowID == draggedRowID)
            }
        }

        @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
            guard let collectionView else { return }
            let location = gesture.location(in: collectionView)

            switch gesture.state {
            case .began:
                isLongPressReordering = true
                guard let indexPath = collectionView.indexPathForItem(at: location),
                      currentRows[safe: indexPath.item]?.isMovable == true else {
                    isLongPressReordering = false
                    return
                }
                if collectionView.beginInteractiveMovementForItem(at: indexPath) {
                    isInteractiveMovementActive = true
                    didMoveDuringCurrentDrag = false
                    draggedRowID = currentRows[safe: indexPath.item]?.id
                    parent.onDragStateChanged(true)
                    refreshVisibleCells()
                } else {
                    isLongPressReordering = false
                }
            case .changed:
                if isInteractiveMovementActive {
                    collectionView.updateInteractiveMovementTargetPosition(location)
                }
            case .ended:
                if isInteractiveMovementActive {
                    collectionView.endInteractiveMovement()
                    finalizeInteractiveMovement(didReorder: didMoveDuringCurrentDrag)
                } else {
                    endDragInteraction()
                }
            default:
                if isInteractiveMovementActive {
                    collectionView.cancelInteractiveMovement()
                    finalizeInteractiveMovement(didReorder: false)
                } else {
                    endDragInteraction()
                }
            }
        }

        private func finalizeInteractiveMovement(didReorder: Bool) {
            guard isInteractiveMovementActive || isLongPressReordering || draggedRowID != nil else {
                return
            }
            endDragInteraction()
            if didReorder {
                parent.onItemsReordered(WorkoutBuilderDisplayRow.items(from: currentRows))
            } else {
                apply(items: parent.items, animatingDifferences: false)
            }
        }

        private func endDragInteraction() {
            isInteractiveMovementActive = false
            isLongPressReordering = false
            draggedRowID = nil
            didMoveDuringCurrentDrag = false
            parent.onDragStateChanged(false)
            refreshVisibleCells()
            collectionView?.indexPathsForSelectedItems?.forEach {
                collectionView?.deselectItem(at: $0, animated: false)
            }

            collectionView?.visibleCells.forEach { cell in
                if let builderCell = cell as? WorkoutBuilderListCell {
                    builderCell.setDragging(false)
                }
                cell.contentView.alpha = 1
                cell.transform = .identity
            }

            // Ensure cells that reappear after drop pick up the reset state.
            collectionView?.reloadData()
            collectionView?.layoutIfNeeded()
        }
    }
}

private final class WorkoutBuilderListCell: UICollectionViewListCell {
    fileprivate var rowID: String?
    private var row: WorkoutBuilderDisplayRow?
    private var isDragging = false
    private var onEditTopStep: ((String) -> Void)?
    private var onDeleteTopStep: ((String) -> Void)?
    private var onDuplicateTopStep: ((String) -> Void)?
    private var onEditRepeatStep: ((String, String) -> Void)?
    private var onDeleteRepeatStep: ((String, String) -> Void)?
    private var onDuplicateRepeatStep: ((String, String) -> Void)?
    private var onAddRepeatStep: ((String) -> Void)?
    private var onIncrementRepeat: ((String) -> Void)?
    private var onDecrementRepeat: ((String) -> Void)?
    private var onDeleteRepeat: ((String) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        automaticallyUpdatesBackgroundConfiguration = false
        let clearSelected = UIView()
        clearSelected.backgroundColor = .clear
        selectedBackgroundView = clearSelected
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        row = nil
        rowID = nil
        isDragging = false
        isSelected = false
        isHighlighted = false
        contentView.alpha = 1
        transform = .identity
    }

    func configure(
        row: WorkoutBuilderDisplayRow,
        isDragging: Bool,
        onEditTopStep: @escaping (String) -> Void,
        onDeleteTopStep: @escaping (String) -> Void,
        onDuplicateTopStep: @escaping (String) -> Void,
        onEditRepeatStep: @escaping (String, String) -> Void,
        onDeleteRepeatStep: @escaping (String, String) -> Void,
        onDuplicateRepeatStep: @escaping (String, String) -> Void,
        onAddRepeatStep: @escaping (String) -> Void,
        onIncrementRepeat: @escaping (String) -> Void,
        onDecrementRepeat: @escaping (String) -> Void,
        onDeleteRepeat: @escaping (String) -> Void
    ) {
        self.row = row
        self.rowID = row.id
        self.isDragging = isDragging
        self.onEditTopStep = onEditTopStep
        self.onDeleteTopStep = onDeleteTopStep
        self.onDuplicateTopStep = onDuplicateTopStep
        self.onEditRepeatStep = onEditRepeatStep
        self.onDeleteRepeatStep = onDeleteRepeatStep
        self.onDuplicateRepeatStep = onDuplicateRepeatStep
        self.onAddRepeatStep = onAddRepeatStep
        self.onIncrementRepeat = onIncrementRepeat
        self.onDecrementRepeat = onDecrementRepeat
        self.onDeleteRepeat = onDeleteRepeat
        applyContent()
    }

    func setDragging(_ dragging: Bool) {
        guard isDragging != dragging else { return }
        isDragging = dragging
        UIView.animate(
            withDuration: 0.16,
            delay: 0,
            usingSpringWithDamping: 0.9,
            initialSpringVelocity: 0.12,
            options: [.allowUserInteraction, .beginFromCurrentState]
        ) {
            self.contentView.alpha = dragging ? 0.72 : 1
        }
    }

    private func applyContent() {
        guard let row else { return }
        backgroundConfiguration = UIBackgroundConfiguration.clear()
        contentView.alpha = isDragging ? 0.72 : 1
        transform = .identity
        contentConfiguration = UIHostingConfiguration {
            WorkoutBuilderRowContent(
                row: row,
                isDragging: isDragging,
                onEditTopStep: onEditTopStep ?? { _ in },
                onDeleteTopStep: onDeleteTopStep ?? { _ in },
                onDuplicateTopStep: onDuplicateTopStep ?? { _ in },
                onEditRepeatStep: onEditRepeatStep ?? { _, _ in },
                onDeleteRepeatStep: onDeleteRepeatStep ?? { _, _ in },
                onDuplicateRepeatStep: onDuplicateRepeatStep ?? { _, _ in },
                onAddRepeatStep: onAddRepeatStep ?? { _ in },
                onIncrementRepeat: onIncrementRepeat ?? { _ in },
                onDecrementRepeat: onDecrementRepeat ?? { _ in },
                onDeleteRepeat: onDeleteRepeat ?? { _ in }
            )
        }
        .margins(.all, 0)
    }

    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        contentView.alpha = isDragging ? 0.72 : 1
        transform = .identity
    }

    override var isHighlighted: Bool {
        didSet {
            if !isDragging {
                contentView.alpha = 1
            }
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private struct WorkoutBuilderRowContent: View {
    let row: WorkoutBuilderDisplayRow
    let isDragging: Bool
    let onEditTopStep: (String) -> Void
    let onDeleteTopStep: (String) -> Void
    let onDuplicateTopStep: (String) -> Void
    let onEditRepeatStep: (String, String) -> Void
    let onDeleteRepeatStep: (String, String) -> Void
    let onDuplicateRepeatStep: (String, String) -> Void
    let onAddRepeatStep: (String) -> Void
    let onIncrementRepeat: (String) -> Void
    let onDecrementRepeat: (String) -> Void
    let onDeleteRepeat: (String) -> Void

    var body: some View {
        Group {
            switch row.role {
            case .step:
                if let step = row.step {
                    WorkoutBuilderStepRowView(
                        step: step,
                        isInRepeat: row.groupID != nil,
                        isDragging: isDragging,
                        onEdit: {
                            if let groupID = row.groupID {
                                onEditRepeatStep(groupID, step.id)
                            } else {
                                onEditTopStep(step.id)
                            }
                        },
                        onDelete: {
                            if let groupID = row.groupID {
                                onDeleteRepeatStep(groupID, step.id)
                            } else {
                                onDeleteTopStep(step.id)
                            }
                        },
                        onDuplicate: {
                            if let groupID = row.groupID {
                                onDuplicateRepeatStep(groupID, step.id)
                            } else {
                                onDuplicateTopStep(step.id)
                            }
                        }
                    )
                }

            case .repeatHeader:
                if let group = row.group {
                    WorkoutBuilderRepeatHeaderView(
                        group: group,
                        isDragging: isDragging,
                        onIncrement: { onIncrementRepeat(group.id) },
                        onDecrement: { onDecrementRepeat(group.id) },
                        onDelete: { onDeleteRepeat(group.id) }
                    )
                }

            case .repeatAdd:
                if let groupID = row.groupID {
                    WorkoutBuilderRepeatAddRowView(isDragging: isDragging) {
                        onAddRepeatStep(groupID)
                    }
                }
            }
        }
        .padding(.top, row.topSpacing)
    }
}

private struct WorkoutBuilderStepRowView: View {
    let step: BuilderStep
    let isInRepeat: Bool
    let isDragging: Bool
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onDuplicate: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Rectangle()
                .fill(step.type == .work ? AppTheme.Palette.primary : BuilderUIKitStyle.recovery)
                .frame(width: 4, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(step.type == .work ? "Work" : "Recovery")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(BuilderUIKitStyle.textTertiary)
                    .textCase(.uppercase)

                Text(step.label.isEmpty ? BuilderUIKitStyle.summary(for: step) : step.label)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .lineLimit(1)
            }

            if !step.label.isEmpty {
                Text(BuilderUIKitStyle.summary(for: step))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }

            Spacer(minLength: 0)

            Button(action: onDuplicate) {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(BuilderUIKitStyle.textTertiary)
            }
            .buttonStyle(.plain)

            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.danger)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, BuilderUIKitStyle.rowHorizontalPadding)
        .padding(.vertical, 12)
        .modifier(BuilderRowChrome(segment: isInRepeat ? .repeatMiddle : .standalone))
        .contentShape(Rectangle())
    }
}

private struct WorkoutBuilderRepeatHeaderView: View {
    let group: BuilderRepeatGroup
    let isDragging: Bool
    let onIncrement: () -> Void
    let onDecrement: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text("Repeat")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)

            Spacer()

            HStack(spacing: 8) {
                RepeatStepperIconButton(systemName: "minus", action: onDecrement)
                Text("\(group.repeatCount)")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .frame(minWidth: 24)
                RepeatStepperIconButton(systemName: "plus", action: onIncrement)
            }

            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.danger)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, BuilderUIKitStyle.rowHorizontalPadding)
        .padding(.vertical, 12)
        .modifier(BuilderRowChrome(segment: .repeatHeader))
    }
}

private struct WorkoutBuilderRepeatAddRowView: View {
    let isDragging: Bool
    let onAdd: () -> Void

    var body: some View {
        Button(action: onAdd) {
            Label("Add Step", systemImage: "plus")
                .font(.system(size: 13, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .foregroundStyle(AppTheme.Palette.primary)
                .padding(.horizontal, BuilderUIKitStyle.rowHorizontalPadding)
                .modifier(BuilderRowChrome(segment: .repeatFooter))
        }
        .buttonStyle(.plain)
        // Visually joins the footer to the last repeat step so the block feels connected.
        .padding(.top, -BuilderUIKitStyle.repeatJoinOffset)
    }
}

private struct RepeatStepperIconButton: View {
    let systemName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(AppTheme.Palette.textPrimary)
                .frame(width: 28, height: 28)
                .background(Circle().fill(AppTheme.Palette.elevatedSurface))
        }
        .buttonStyle(.plain)
    }
}

private enum BuilderUIKitStyle {
    static let textTertiary = Color(red: 0.58, green: 0.66, blue: 0.74)
    static let recovery = Color(red: 0.85, green: 0.47, blue: 0.02)
    static let rowHorizontalPadding: CGFloat = 16
    static let repeatJoinOffset: CGFloat = 12
    static let repeatOuterTopGap: CGFloat = 10

    static func summary(for step: BuilderStep) -> String {
        let base: String
        if let distanceValue = step.distanceValue, let distanceUnit = step.distanceUnit {
            base = "\(formattedDistance(distanceValue))\(distanceUnit == .meters ? "" : " ")\(distanceUnit.rawValue)"
        } else if let duration = step.durationMilliseconds {
            base = formatCountdown(milliseconds: duration)
        } else {
            base = step.type == .work ? "Work" : "Recovery"
        }

        if step.type == .work, (step.splitsPerStep ?? 1) > 1 {
            return "\(base) • x\(step.splitsPerStep ?? 1) splits"
        }

        return base
    }

    private static func formattedDistance(_ value: Double) -> String {
        value.rounded(.towardZero) == value ? String(Int(value)) : String(format: "%.2f", value)
    }
}

private enum BuilderRowSegment {
    case standalone
    case repeatHeader
    case repeatMiddle
    case repeatFooter
}

private struct BuilderRowChrome: ViewModifier {
    let segment: BuilderRowSegment

    func body(content: Content) -> some View {
        switch segment {
        case .standalone:
            content
                .background(AppTheme.Palette.elevatedSurface)
                .clipShape(Rectangle())
                .overlay(
                    Rectangle()
                        .stroke(AppTheme.Palette.border, lineWidth: 1)
                )
        case .repeatHeader:
            content
                .background(AppTheme.Palette.elevatedSurface)
                .clipShape(
                    UnevenRoundedRectangle(
                        cornerRadii: .init(topLeading: 12, bottomLeading: 0, bottomTrailing: 0, topTrailing: 12),
                        style: .continuous
                    )
                )
                .overlay(
                    UnevenRoundedRectangle(
                        cornerRadii: .init(topLeading: 12, bottomLeading: 0, bottomTrailing: 0, topTrailing: 12),
                        style: .continuous
                    )
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
                )
        case .repeatMiddle:
            content
                .background(AppTheme.Palette.elevatedSurface)
                .clipShape(Rectangle())
                .overlay(
                    Rectangle()
                        .stroke(AppTheme.Palette.border, lineWidth: 1)
                )
        case .repeatFooter:
            content
                .background(AppTheme.Palette.elevatedSurface)
                .clipShape(
                    UnevenRoundedRectangle(
                        cornerRadii: .init(topLeading: 0, bottomLeading: 12, bottomTrailing: 12, topTrailing: 0),
                        style: .continuous
                    )
                )
                .overlay(
                    UnevenRoundedRectangle(
                        cornerRadii: .init(topLeading: 0, bottomLeading: 12, bottomTrailing: 12, topTrailing: 0),
                        style: .continuous
                    )
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
                )
        }
    }
}

private struct WorkoutBuilderDisplayRow: Hashable, Identifiable {
    enum Role: Hashable {
        case step
        case repeatHeader
        case repeatAdd
    }

    let id: String
    let role: Role
    let step: BuilderStep?
    let group: BuilderRepeatGroup?
    let groupID: String?
    let topSpacing: CGFloat

    var isMovable: Bool {
        role == .step
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: WorkoutBuilderDisplayRow, rhs: WorkoutBuilderDisplayRow) -> Bool {
        lhs.id == rhs.id
    }

    static func rows(from items: [BuilderItem]) -> [WorkoutBuilderDisplayRow] {
        var rows: [WorkoutBuilderDisplayRow] = []
        for item in items {
            switch item {
            case let .step(step):
                rows.append(
                    WorkoutBuilderDisplayRow(
                        id: "step:\(step.id)",
                        role: .step,
                        step: step,
                        group: nil,
                        groupID: nil,
                        topSpacing: 0
                    )
                )
            case let .repeatGroup(group):
                rows.append(
                    WorkoutBuilderDisplayRow(
                        id: "repeat-header:\(group.id)",
                        role: .repeatHeader,
                        step: nil,
                        group: group,
                        groupID: group.id,
                        topSpacing: rows.isEmpty ? 0 : BuilderUIKitStyle.repeatOuterTopGap
                    )
                )
                rows.append(contentsOf: group.steps.map { step in
                    WorkoutBuilderDisplayRow(
                        id: "repeat-step:\(step.id)",
                        role: .step,
                        step: step,
                        group: nil,
                        groupID: group.id,
                        topSpacing: 0
                    )
                })
                rows.append(
                    WorkoutBuilderDisplayRow(
                        id: "repeat-add:\(group.id)",
                        role: .repeatAdd,
                        step: nil,
                        group: nil,
                        groupID: group.id,
                        topSpacing: 0
                    )
                )
            }
        }
        return rows
    }

    static func items(from rows: [WorkoutBuilderDisplayRow]) -> [BuilderItem] {
        var rebuilt: [BuilderItem] = []
        var activeRepeat: BuilderRepeatGroup?

        func flushActiveRepeat() {
            if let activeRepeat {
                rebuilt.append(.repeatGroup(activeRepeat))
            }
            activeRepeat = nil
        }

        for row in rows {
            switch row.role {
            case .repeatHeader:
                flushActiveRepeat()
                if let group = row.group {
                    activeRepeat = BuilderRepeatGroup(id: group.id, repeatCount: group.repeatCount, steps: [])
                }
            case .step:
                guard let step = row.step else { continue }
                if var current = activeRepeat {
                    current = BuilderRepeatGroup(id: current.id, repeatCount: current.repeatCount, steps: current.steps + [step])
                    activeRepeat = current
                } else {
                    rebuilt.append(.step(step))
                }
            case .repeatAdd:
                flushActiveRepeat()
            }
        }

        flushActiveRepeat()
        return rebuilt
    }
}
