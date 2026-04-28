import Foundation

func formatElapsedTime(milliseconds: Int) -> String {
    let clamped = max(milliseconds, 0)
    let totalSeconds = clamped / 1000
    let minutes = totalSeconds / 60
    let seconds = totalSeconds % 60
    let centiseconds = (clamped % 1000) / 10

    if minutes > 0 {
        return "\(minutes):\(String(format: "%02d", seconds)).\(String(format: "%02d", centiseconds))"
    }

    return "\(seconds).\(String(format: "%02d", centiseconds))"
}

func formatCountdown(milliseconds: Int) -> String {
    let clamped = max(milliseconds, 0)
    let totalSeconds = clamped / 1000
    let minutes = totalSeconds / 60
    let seconds = totalSeconds % 60
    return "\(minutes):\(String(format: "%02d", seconds))"
}

func expandTemplate(steps: [TemplateStep], repeatGroups: [TemplateRepeatGroup]) -> [ExpandedStep] {
    let groupMap = Dictionary(uniqueKeysWithValues: repeatGroups.map { ($0.id, $0) })

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
    for (groupID, steps) in groupedSteps {
        if let group = groupMap[groupID] {
            topLevel.append(.repeatGroup(group, steps, group.sortOrder))
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

    var expanded: [ExpandedStep] = []
    var index = 0

    for item in topLevel {
        switch item {
        case let .step(step, _):
            expanded.append(
                ExpandedStep(
                    id: index,
                    index: index,
                    type: step.type,
                    distanceValue: step.distanceValue,
                    distanceUnit: step.distanceUnit,
                    durationMilliseconds: step.durationMilliseconds,
                    splitsPerStep: step.splitsPerStep,
                    label: step.label.isEmpty ? autoLabel(for: step) : step.label,
                    repeatIteration: nil,
                    repeatTotal: nil
                )
            )
            index += 1

        case let .repeatGroup(group, grouped, _):
            for repeatIndex in 1...group.repeatCount {
                for step in grouped {
                    expanded.append(
                        ExpandedStep(
                            id: index,
                            index: index,
                            type: step.type,
                            distanceValue: step.distanceValue,
                            distanceUnit: step.distanceUnit,
                            durationMilliseconds: step.durationMilliseconds,
                            splitsPerStep: step.splitsPerStep,
                            label: step.label.isEmpty ? autoLabel(for: step) : step.label,
                            repeatIteration: repeatIndex,
                            repeatTotal: group.repeatCount
                        )
                    )
                    index += 1
                }
            }
        }
    }

    return expanded
}

private func autoLabel(for step: TemplateStep) -> String {
    if let distanceValue = step.distanceValue, let distanceUnit = step.distanceUnit {
        let separator = distanceUnit == .meters ? "" : " "
        let value: String = distanceValue.rounded(.towardZero) == distanceValue
            ? String(Int(distanceValue))
            : String(format: "%.2f", distanceValue)
        return "\(value)\(separator)\(distanceUnit.rawValue)"
    }

    if let duration = step.durationMilliseconds, duration > 0 {
        let totalSeconds = duration / 1000
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return minutes > 0 ? "\(minutes):\(String(format: "%02d", seconds))" : "\(seconds)s"
    }

    return step.type == .recovery ? "Recovery" : "Work"
}
