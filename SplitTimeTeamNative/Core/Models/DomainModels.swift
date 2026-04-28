import CoreLocation
import Foundation

enum UserRole: String, Codable, CaseIterable, Sendable {
    case coach
    case athlete
}

enum SocialAuthProvider: String, Codable, CaseIterable, Sendable {
    case google
    case apple
    case strava

    var displayName: String {
        switch self {
        case .google:
            return "Google"
        case .apple:
            return "Apple"
        case .strava:
            return "Strava"
        }
    }
}

struct AuthUser: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let role: UserRole
    let firstName: String
    let lastName: String
    let email: String
    let phone: String?
    let age: Int?
    let grade: String?

    var fullName: String {
        let composed = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)
        return composed.isEmpty ? email : composed
    }
}

struct AuthTeam: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let joinCode: String?
}

struct AuthSession: Codable, Hashable, Sendable {
    let token: String
    let user: AuthUser
    let team: AuthTeam?
}

struct SocialAuthStart: Codable, Hashable, Sendable {
    let authorizeURL: URL
    let state: String
}

struct SocialAuthPollResult: Codable, Hashable, Sendable {
    let exchangeCode: String?
    let errorMessage: String?
    let isPending: Bool
}

struct CoachSignupRequest: Codable, Hashable, Sendable {
    let teamName: String
    let firstName: String
    let lastName: String
    let email: String
    let password: String
    let phone: String?
}

struct AthleteSignupRequest: Codable, Hashable, Sendable {
    let teamCode: String
    let firstName: String
    let lastName: String
    let email: String
    let password: String
    let phone: String?
    let age: Int
    let grade: String
}

struct Athlete: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let remoteUserID: String?
    let name: String
    let firstName: String?
    let lastName: String?
    let email: String?
    let phone: String?
    let age: Int?
    let grade: String?
    let groupID: String?
    let photoURL: URL?
    let createdAt: Date
}

struct TeamGroup: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let colorHex: String
    let sortOrder: Int
}

struct TeamRosterMember: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let role: UserRole
    let firstName: String
    let lastName: String
    let email: String
    let phone: String?
    let age: Int?
    let grade: String?
    let photoURL: URL?

    var fullName: String {
        "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

enum AttendanceStatus: String, Codable, CaseIterable, Sendable {
    case present
    case late
    case excused
    case absent

    var shortLabel: String {
        switch self {
        case .present:
            return "P"
        case .late:
            return "L"
        case .excused:
            return "E"
        case .absent:
            return "A"
        }
    }

    var title: String {
        switch self {
        case .present:
            return "Present"
        case .late:
            return "Late"
        case .excused:
            return "Excused"
        case .absent:
            return "Absent"
        }
    }
}

struct AttendanceRecord: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let date: Date
    let athleteUserID: String?
    let athleteLocalID: String?
    let status: AttendanceStatus
    let note: String?
    let markedByUserID: String
    let createdAt: Date
    let updatedAt: Date
}

struct AttendanceMarkDraft: Codable, Hashable, Sendable {
    let date: Date
    let athleteUserID: String?
    let athleteLocalID: String?
    let status: AttendanceStatus?
    let note: String?
}

struct Announcement: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let teamID: String
    let title: String
    let body: String
    let authorUserID: String
    let authorName: String
    let createdAt: Date
}

struct AnnouncementDraft: Codable, Hashable, Sendable {
    let title: String
    let body: String
}

struct AnnouncementComment: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let announcementID: String
    let authorUserID: String
    let authorName: String
    let body: String
    let createdAt: Date
}

struct AnnouncementCommentDraft: Codable, Hashable, Sendable {
    let body: String
}

struct ChatAttachmentUpload: Hashable, Sendable {
    let data: Data
    let filename: String
    let mimeType: String
}

struct ChatMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let teamID: String
    let senderUserID: String
    let senderName: String
    let senderRole: UserRole
    let body: String
    let imageURL: URL?
    let createdAt: Date

    var isPhotoOnly: Bool {
        imageURL != nil && body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct DirectMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let threadID: String
    let teamID: String
    let senderUserID: String
    let senderName: String
    let senderRole: UserRole
    let body: String
    let imageURL: URL?
    let createdAt: Date
}

struct DirectMessageConversation: Codable, Identifiable, Hashable, Sendable {
    let threadID: String
    let participantUserID: String
    let participantName: String
    let participantRole: UserRole
    let participantPhotoURL: URL?
    let latestMessage: DirectMessage?
    let hasUnreadIncoming: Bool

    var id: String { participantUserID }
}

enum ActivitySource: String, Codable, Hashable, Sendable {
    case strava
    case workout
}

enum ActivityFeedScope: String, Codable, Hashable, Sendable {
    case me
    case team
}

struct ActivityFeedItem: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let teamID: String
    let ownerUserID: String
    let ownerName: String
    let source: ActivitySource
    let externalID: String?
    let title: String
    let activityType: String
    let startAt: Date
    let distanceMeters: Double?
    let movingSeconds: Int?
    let elapsedSeconds: Int?
    let elevationGainMeters: Double?
    let averageSpeedMPS: Double?
    let polyline: String?
    let commentCount: Int
    let createdAt: Date
    let updatedAt: Date
}

struct ActivityWorkoutDetail: Codable, Hashable, Sendable {
    let activityID: String
    let workoutID: String
    let workoutName: String
    let athleteName: String
    let startedAt: Date?
    let stoppedAt: Date?
    let totalElapsedMilliseconds: Int?
    let splits: [ActivityWorkoutSplit]
}

struct ActivityWorkoutSplit: Codable, Identifiable, Hashable, Sendable {
    let splitNumber: Int
    let elapsedMilliseconds: Int
    let lapMilliseconds: Int
    let isFinal: Bool
    let stepType: TemplateStepType?
    let stepDistanceValue: Double?
    let stepDistanceUnit: DistanceUnit?
    let stepLabel: String?

    var id: String { "split-\(splitNumber)" }
}

struct ActivityComment: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let activityID: String
    let authorUserID: String
    let authorName: String
    let body: String
    let createdAt: Date
}

struct ActivityCommentDraft: Codable, Hashable, Sendable {
    let body: String
}

struct StravaConnectionStatus: Codable, Hashable, Sendable {
    let connected: Bool
    let athleteName: String?
    let expiresAt: Date?
}

struct StravaConnectStart: Codable, Hashable, Sendable {
    let authorizeURL: URL
}

struct StravaSyncResult: Codable, Hashable, Sendable {
    let imported: Int
    let totalFetched: Int
}

enum ScheduleEventType: String, Codable, CaseIterable, Sendable {
    case practice
    case race
}

struct ScheduleEvent: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let teamID: String
    let type: ScheduleEventType
    let category: String
    let title: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
    let locationLatitude: Double?
    let locationLongitude: Double?
    let notes: String?
    let isRecurring: Bool
    let recurrenceDays: [Int]
    let recurrenceEndsAt: Date?
    let createdAt: Date
    let updatedAt: Date

    var coordinate: CLLocationCoordinate2D? {
        guard let locationLatitude, let locationLongitude else { return nil }
        return CLLocationCoordinate2D(latitude: locationLatitude, longitude: locationLongitude)
    }
}

struct ScheduleEventOverride: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let eventID: String
    let teamID: String
    let occurrenceStartsAt: Date
    let type: ScheduleEventType
    let category: String
    let title: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
    let locationLatitude: Double?
    let locationLongitude: Double?
    let notes: String?
    let isCancelled: Bool
    let createdAt: Date
    let updatedAt: Date
}

struct ScheduleOccurrence: Identifiable, Hashable, Sendable {
    let id: String
    let eventID: String
    let type: ScheduleEventType
    let category: String
    let title: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
    let locationLatitude: Double?
    let locationLongitude: Double?
    let notes: String?
    let isRecurring: Bool

    var coordinate: CLLocationCoordinate2D? {
        guard let locationLatitude, let locationLongitude else { return nil }
        return CLLocationCoordinate2D(latitude: locationLatitude, longitude: locationLongitude)
    }
}

struct ScheduleSnapshot: Codable, Hashable, Sendable {
    let events: [ScheduleEvent]
    let overrides: [ScheduleEventOverride]

    static let empty = ScheduleSnapshot(events: [], overrides: [])
}

struct ScheduleEventDraft: Codable, Hashable, Sendable {
    let type: ScheduleEventType
    let category: String
    let title: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
    let locationLatitude: Double?
    let locationLongitude: Double?
    let notes: String?
    let isRecurring: Bool
    let recurrenceDays: [Int]
    let recurrenceEndsAt: Date?
}

enum WorkoutStatus: String, Codable, Sendable {
    case active
    case completed
}

struct Workout: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let date: Date
    let status: WorkoutStatus
    let templateID: String?
}

struct WorkoutAthlete: Codable, Hashable, Sendable {
    let workoutID: String
    let athleteID: String
    let groupID: String?
    let athleteName: String
    let groupName: String?
    let groupColorHex: String?
}

enum DistanceUnit: String, Codable, CaseIterable, Sendable {
    case meters = "m"
    case miles = "mi"
    case kilometers = "km"
}

enum TemplateStepType: String, Codable, CaseIterable, Sendable {
    case work
    case recovery
}

struct Split: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let workoutID: String
    let athleteID: String
    let splitNumber: Int
    let elapsedMilliseconds: Int
    let timestamp: Date
    let isFinal: Bool
    let stepType: TemplateStepType?
    let stepDistanceValue: Double?
    let stepDistanceUnit: DistanceUnit?
    let stepLabel: String?
}

struct WorkoutTemplate: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let createdAt: Date
    let updatedAt: Date
}

struct TemplateRepeatGroup: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let templateID: String
    let repeatCount: Int
    let sortOrder: Int
}

struct TemplateStep: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let templateID: String
    let sortOrder: Int
    let type: TemplateStepType
    let distanceValue: Double?
    let distanceUnit: DistanceUnit?
    let durationMilliseconds: Int?
    let splitsPerStep: Int?
    let label: String
    let repeatGroupID: String?
}

struct TemplateSummary: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let updatedAt: Date
    let stepCount: Int
}

struct WorkoutSummary: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let date: Date
    let athleteCount: Int
    let status: WorkoutStatus
}

struct WorkoutDetail: Hashable, Sendable {
    let workout: Workout
    let athletes: [WorkoutAthleteResult]
}

struct TeamStateSnapshot: Hashable, Sendable {
    let athletes: [Athlete]
    let groups: [TeamGroup]
}

struct TemplateLibrarySnapshot: Hashable, Sendable {
    let templates: [WorkoutTemplate]
    let repeatGroups: [TemplateRepeatGroup]
    let steps: [TemplateStep]
}

struct TeamBranding: Codable, Hashable, Sendable {
    let logoBase64: String?
}

struct CompletedWorkoutUpload: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let workoutAt: Date
    let templateID: String?
    let athletes: [CompletedWorkoutAthleteUpload]
}

struct CompletedWorkoutAthleteUpload: Codable, Hashable, Sendable {
    let athleteID: String
    let athleteUserID: String?
    let athleteEmail: String?
    let athletePhone: String?
    let athleteName: String
    let groupID: String?
    let groupName: String?
    let groupColorHex: String?
    let startedAt: Date?
    let stoppedAt: Date?
    let totalElapsedMilliseconds: Int?
    let splits: [CompletedWorkoutSplitUpload]
}

struct CompletedWorkoutSplitUpload: Codable, Hashable, Sendable {
    let splitNumber: Int
    let elapsedMilliseconds: Int
    let timestamp: Date
    let isFinal: Bool
    let stepType: TemplateStepType?
    let stepDistanceValue: Double?
    let stepDistanceUnit: DistanceUnit?
    let stepLabel: String?
}

struct CompletedWorkoutHistorySnapshot: Hashable, Sendable {
    let workouts: [Workout]
    let workoutAthletes: [WorkoutAthlete]
    let splits: [Split]
}

struct WorkoutAthleteResult: Identifiable, Hashable, Sendable {
    let id: String
    let athleteID: String
    let athleteName: String
    let groupName: String?
    let groupColorHex: String?
    let splits: [Split]
    let totalTime: Int?
}

enum TimerStatus: String, Codable, CaseIterable, Sendable {
    case idle
    case running
    case stopped
}

struct RuntimeSplit: Codable, Hashable, Sendable {
    let splitNumber: Int
    let elapsedMilliseconds: Int
    let timestamp: Date
    let isFinal: Bool
    let isRecoveryEnd: Bool
    let stepIndex: Int?
}

struct AthleteTimerState: Identifiable, Hashable, Sendable {
    let id: String
    let athleteID: String
    let athleteName: String
    let photoURL: URL?
    let groupID: String?
    let groupName: String?
    let groupColorHex: String?
    let status: TimerStatus
    let startedAt: Date?
    let stoppedAt: Date?
    let splits: [RuntimeSplit]
}

struct GroupTimerBlock: Identifiable, Hashable, Sendable {
    let id: String
    let groupID: String?
    let groupName: String
    let groupColorHex: String
    let athletes: [AthleteTimerState]
    let groupStatus: TimerStatus
    let groupStartedAt: Date?
    let groupStoppedAt: Date?
}

enum AthleteStepStatus: String, Codable, CaseIterable, Sendable {
    case pending
    case active
    case recoveryCountdown = "recovery_countdown"
    case recoveryWaiting = "recovery_waiting"
    case completed
}

struct AthleteWorkoutProgress: Hashable, Sendable {
    let currentStepIndex: Int
    let stepStatus: AthleteStepStatus
    let recoveryStartedAt: Date?
    let recordedSplitsInCurrentStep: Int
}

struct ExpandedStep: Identifiable, Hashable, Sendable {
    let id: Int
    let index: Int
    let type: TemplateStepType
    let distanceValue: Double?
    let distanceUnit: DistanceUnit?
    let durationMilliseconds: Int?
    let splitsPerStep: Int?
    let label: String
    let repeatIteration: Int?
    let repeatTotal: Int?
}

struct BuilderStep: Identifiable, Hashable, Sendable {
    let id: String
    let type: TemplateStepType
    let distanceValue: Double?
    let distanceUnit: DistanceUnit?
    let durationMilliseconds: Int?
    let splitsPerStep: Int?
    let label: String
}

struct BuilderRepeatGroup: Identifiable, Hashable, Sendable {
    let id: String
    let repeatCount: Int
    let steps: [BuilderStep]
}

struct GroupWorkoutAssignment: Hashable, Sendable {
    let groupID: String?
    let templateID: String?
    let athleteIDs: [String]
}

enum BuilderItem: Identifiable, Hashable, Sendable {
    case step(BuilderStep)
    case repeatGroup(BuilderRepeatGroup)

    var id: String {
        switch self {
        case let .step(step):
            return "step-\(step.id)"
        case let .repeatGroup(group):
            return "repeat-\(group.id)"
        }
    }
}

enum TimerAthleteLayoutStyle: String, Codable, CaseIterable, Sendable {
    case row
    case card

    var title: String {
        switch self {
        case .row:
            return "Rows"
        case .card:
            return "Cards"
        }
    }
}

struct TimerPreferences: Codable, Hashable, Sendable {
    var autoReorderAthletes: Bool
    var showTapHints: Bool
    var athleteLayout: TimerAthleteLayoutStyle

    init(
        autoReorderAthletes: Bool,
        showTapHints: Bool,
        athleteLayout: TimerAthleteLayoutStyle
    ) {
        self.autoReorderAthletes = autoReorderAthletes
        self.showTapHints = showTapHints
        self.athleteLayout = athleteLayout
    }

    private enum CodingKeys: String, CodingKey {
        case autoReorderAthletes
        case showTapHints
        case athleteLayout
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        autoReorderAthletes = try container.decodeIfPresent(Bool.self, forKey: .autoReorderAthletes) ?? true
        showTapHints = try container.decodeIfPresent(Bool.self, forKey: .showTapHints) ?? true
        athleteLayout = try container.decodeIfPresent(TimerAthleteLayoutStyle.self, forKey: .athleteLayout) ?? .row
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(autoReorderAthletes, forKey: .autoReorderAthletes)
        try container.encode(showTapHints, forKey: .showTapHints)
        try container.encode(athleteLayout, forKey: .athleteLayout)
    }

    static let `default` = TimerPreferences(
        autoReorderAthletes: true,
        showTapHints: true,
        athleteLayout: .row
    )
}

struct SchedulePreferences: Codable, Hashable, Sendable {
    var showEventFilters: Bool
    var showCategoryOnCards: Bool
    var showLocationOnCards: Bool

    static let `default` = SchedulePreferences(
        showEventFilters: true,
        showCategoryOnCards: true,
        showLocationOnCards: true
    )
}
