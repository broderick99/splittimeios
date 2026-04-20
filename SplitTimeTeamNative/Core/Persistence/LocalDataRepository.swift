import Foundation

struct LocalDataSnapshot: Codable, Sendable {
    var athletes: [Athlete] = []
    var groups: [TeamGroup] = []
    var templates: [WorkoutTemplate] = []
    var templateRepeatGroups: [TemplateRepeatGroup] = []
    var templateSteps: [TemplateStep] = []
    var workouts: [Workout] = []
    var workoutAthletes: [WorkoutAthlete] = []
    var splits: [Split] = []
    var timerPreferences: TimerPreferences = .default
    var schedulePreferences: SchedulePreferences = .default

    static let empty = LocalDataSnapshot()
}

actor LocalDataRepository {
    private let fileURL: URL
    private let fileManager: FileManager

    init(
        fileManager: FileManager = .default,
        filename: String = "local-team-data.json"
    ) {
        self.fileManager = fileManager

        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let containerDirectory = appSupport.appendingPathComponent("SplitTimeTeamNative", isDirectory: true)
        self.fileURL = containerDirectory.appendingPathComponent(filename)
    }

    func load() throws -> LocalDataSnapshot {
        if !fileManager.fileExists(atPath: fileURL.path) {
            return .empty
        }

        let data = try Data(contentsOf: fileURL)
        return try JSONDecoder.localAppDecoder.decode(LocalDataSnapshot.self, from: data)
    }

    func save(_ snapshot: LocalDataSnapshot) throws {
        let directory = fileURL.deletingLastPathComponent()
        if !fileManager.fileExists(atPath: directory.path) {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        }

        let data = try JSONEncoder.localAppEncoder.encode(snapshot)
        try data.write(to: fileURL, options: [.atomic])
    }
}

private extension JSONEncoder {
    static let localAppEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}

private extension JSONDecoder {
    static let localAppDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
