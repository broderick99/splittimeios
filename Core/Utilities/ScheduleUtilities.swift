import Foundation

let practiceCategoryOptions = [
    "Easy Run",
    "Long Run",
    "Speed Workout",
    "Tempo",
    "Recovery",
    "Gym",
    "Team Practice",
    "Other"
]

let raceCategoryOptions = [
    "Meet",
    "Invitational",
    "Championship",
    "Time Trial",
    "Travel",
    "Other"
]

func scheduleCategoryOptions(for type: ScheduleEventType) -> [String] {
    type == .practice ? practiceCategoryOptions : raceCategoryOptions
}

func formatScheduleMonthYear(_ date: Date) -> String {
    date.formatted(.dateTime.month(.wide).year())
}

func startOfScheduleWeek(for date: Date, calendar: Calendar = .current) -> Date {
    let startOfDay = calendar.startOfDay(for: date)
    let weekday = calendar.component(.weekday, from: startOfDay)
    let mondayOffset = weekday == 1 ? -6 : 2 - weekday
    return calendar.date(byAdding: .day, value: mondayOffset, to: startOfDay) ?? startOfDay
}

func formatScheduleWeekLabel(_ weekStart: Date, reference: Date = .now, calendar: Calendar = .current) -> String {
    let normalizedWeekStart = startOfScheduleWeek(for: weekStart, calendar: calendar)
    let currentWeekStart = startOfScheduleWeek(for: reference, calendar: calendar)
    let nextWeekStart = calendar.date(byAdding: .day, value: 7, to: currentWeekStart) ?? currentWeekStart

    if calendar.isDate(normalizedWeekStart, inSameDayAs: currentWeekStart) {
        return "This Week"
    }

    if calendar.isDate(normalizedWeekStart, inSameDayAs: nextWeekStart) {
        return "Next Week"
    }

    let weekEnd = calendar.date(byAdding: .day, value: 6, to: normalizedWeekStart) ?? normalizedWeekStart
    let startMonth = normalizedWeekStart.formatted(.dateTime.month(.abbreviated))
    let endMonth = weekEnd.formatted(.dateTime.month(.abbreviated))
    let startDay = normalizedWeekStart.formatted(.dateTime.day())
    let endDay = weekEnd.formatted(.dateTime.day())

    if startMonth == endMonth {
        return "\(startMonth) \(startDay)-\(endDay)"
    }

    return "\(startMonth) \(startDay)-\(endMonth) \(endDay)"
}

func getLocationDisplayName(_ location: String?) -> String {
    guard let location, !location.isEmpty else {
        return ""
    }

    return location.split(separator: ",").first.map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) } ?? location
}

func buildUpcomingOccurrences(
    events: [ScheduleEvent],
    overrides: [ScheduleEventOverride] = [],
    from: Date = .now,
    daysAhead: Int = 90,
    maxCount: Int = 60,
    calendar: Calendar = .current
) -> [ScheduleOccurrence] {
    let fromDay = calendar.startOfDay(for: from)
    guard let horizon = calendar.date(byAdding: .day, value: daysAhead, to: fromDay) else {
        return []
    }

    struct OverrideKey: Hashable {
        let eventID: String
        let occurrenceStartsAtMillis: Int64
    }

    let overrideMap = Dictionary(uniqueKeysWithValues: overrides.map { override in
        (
            OverrideKey(
                eventID: override.eventID,
                occurrenceStartsAtMillis: override.occurrenceStartsAt.millisecondsSince1970
            ),
            override
        )
    })

    var results: [ScheduleOccurrence] = []

    for event in events {
        let duration = event.endsAt.map { max(0, $0.timeIntervalSince(event.startsAt)) }

        if !event.isRecurring || event.recurrenceDays.isEmpty {
            guard event.startsAt >= from, event.startsAt <= horizon else {
                continue
            }

            results.append(
                ScheduleOccurrence(
                    id: "\(event.id):\(event.startsAt.millisecondsSince1970)",
                    eventID: event.id,
                    type: event.type,
                    category: event.category,
                    title: event.title,
                    startsAt: event.startsAt,
                    endsAt: event.endsAt,
                    location: event.location,
                    locationLatitude: event.locationLatitude,
                    locationLongitude: event.locationLongitude,
                    notes: event.notes,
                    isRecurring: false
                )
            )
            continue
        }

        let anchorHour = calendar.component(.hour, from: event.startsAt)
        let anchorMinute = calendar.component(.minute, from: event.startsAt)
        let anchorSecond = calendar.component(.second, from: event.startsAt)
        let eventStartDay = calendar.startOfDay(for: event.startsAt)
        let recurrenceEndDay = min(
            horizon,
            event.recurrenceEndsAt.map { calendar.startOfDay(for: $0) } ?? horizon
        )

        var dayCursor = max(fromDay, eventStartDay)
        while dayCursor <= recurrenceEndDay {
            let weekday = weekdayIndex(for: dayCursor, calendar: calendar)
            guard event.recurrenceDays.contains(weekday) else {
                guard let nextDay = calendar.date(byAdding: .day, value: 1, to: dayCursor) else {
                    break
                }
                dayCursor = nextDay
                continue
            }

            guard let occurrenceStart = calendar.date(
                bySettingHour: anchorHour,
                minute: anchorMinute,
                second: anchorSecond,
                of: dayCursor
            ) else {
                guard let nextDay = calendar.date(byAdding: .day, value: 1, to: dayCursor) else {
                    break
                }
                dayCursor = nextDay
                continue
            }

            if occurrenceStart >= from {
                let overrideKey = OverrideKey(
                    eventID: event.id,
                    occurrenceStartsAtMillis: occurrenceStart.millisecondsSince1970
                )
                let override = overrideMap[overrideKey]

                if override?.isCancelled != true {
                    results.append(
                        ScheduleOccurrence(
                            id: override?.id ?? "\(event.id):\(occurrenceStart.millisecondsSince1970)",
                            eventID: event.id,
                            type: override?.type ?? event.type,
                            category: override?.category ?? event.category,
                            title: override?.title ?? event.title,
                            startsAt: override?.startsAt ?? occurrenceStart,
                            endsAt: override?.endsAt ?? duration.map { occurrenceStart.addingTimeInterval($0) },
                            location: override?.location ?? event.location,
                            locationLatitude: override?.locationLatitude ?? event.locationLatitude,
                            locationLongitude: override?.locationLongitude ?? event.locationLongitude,
                            notes: override?.notes ?? event.notes,
                            isRecurring: true
                        )
                    )
                }
            }

            if results.count >= maxCount * 2 {
                break
            }

            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: dayCursor) else {
                break
            }
            dayCursor = nextDay
        }
    }

    return results
        .sorted { $0.startsAt < $1.startsAt }
        .prefix(maxCount)
        .map { $0 }
}

func formatRecurrenceDaysLabel(_ days: [Int]) -> String? {
    let normalized = Array(Set(days))
        .filter { (0 ... 6).contains($0) }
        .sorted()

    guard !normalized.isEmpty else {
        return nil
    }

    switch normalized {
    case [0, 1, 2, 3, 4, 5, 6]:
        return "every day"
    case [1, 2, 3, 4, 5]:
        return "weekdays"
    case [0, 6]:
        return "weekends"
    default:
        break
    }

    if normalized.count == 1 {
        return weekdayShortLabel(for: normalized[0])
    }

    let mondayFirst = [1, 2, 3, 4, 5, 6, 0]
    let ordered = normalized
        .compactMap { mondayFirst.firstIndex(of: $0) }
        .sorted()

    let contiguous = ordered.enumerated().allSatisfy { index, value in
        index == 0 || value == ordered[index - 1] + 1
    }

    if contiguous,
       let startIndex = ordered.first,
       let endIndex = ordered.last,
       let startLabel = weekdayShortLabel(for: mondayFirst[startIndex]),
       let endLabel = weekdayShortLabel(for: mondayFirst[endIndex]) {
        return "\(startLabel)-\(endLabel)"
    }

    return normalized.compactMap(weekdayShortLabel(for:)).joined(separator: ", ")
}

private func weekdayIndex(for date: Date, calendar: Calendar) -> Int {
    (calendar.component(.weekday, from: date) + 6) % 7
}

func weekdayShortLabel(for day: Int) -> String? {
    let labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    guard labels.indices.contains(day) else { return nil }
    return labels[day]
}

private extension Date {
    var millisecondsSince1970: Int64 {
        Int64((timeIntervalSince1970 * 1000).rounded())
    }
}
