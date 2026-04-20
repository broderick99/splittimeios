import Foundation

private enum BackendDateParser {
    nonisolated(unsafe) static let iso8601WithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parse(_ raw: String) -> Date {
        if let date = iso8601WithFractional.date(from: raw) ?? iso8601.date(from: raw) {
            return date
        }

        return Date()
    }

    static func millisecondsDate(_ raw: Double) -> Date {
        Date(timeIntervalSince1970: raw / 1000)
    }
}

private enum AttendanceDateCodec {
    nonisolated(unsafe) static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    nonisolated(unsafe) static let monthFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM"
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    static func string(from date: Date) -> String {
        formatter.string(from: date)
    }

    static func monthString(from date: Date) -> String {
        monthFormatter.string(from: date)
    }

    static func parse(_ raw: String) -> Date {
        formatter.date(from: raw) ?? Date()
    }
}

private extension Encodable {
    func jsonData() throws -> Data {
        let encoder = JSONEncoder()
        return try encoder.encode(self)
    }
}

private struct AuthUserDTO: Decodable {
    let id: String
    let role: UserRole
    let firstName: String
    let lastName: String
    let email: String
    let phone: String?
    let age: Int?
    let grade: String?

    func model() -> AuthUser {
        AuthUser(
            id: id,
            role: role,
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            age: age,
            grade: grade
        )
    }
}

private struct AuthTeamDTO: Decodable {
    let id: String
    let name: String
    let joinCode: String?

    func model() -> AuthTeam {
        AuthTeam(id: id, name: name, joinCode: joinCode)
    }
}

private struct AuthEnvelopeDTO: Decodable {
    let token: String
    let user: AuthUserDTO
    let team: AuthTeamDTO?

    func model() -> AuthSession {
        AuthSession(token: token, user: user.model(), team: team?.model())
    }
}

private struct AuthRefreshDTO: Decodable {
    let user: AuthUserDTO
    let team: AuthTeamDTO?
}

private struct SocialAuthStartDTO: Decodable {
    let authorizeUrl: String
    let state: String

    func model() throws -> SocialAuthStart {
        guard let url = URL(string: authorizeUrl) else {
            throw APIError.decoding("Invalid social authorize URL.")
        }

        return SocialAuthStart(authorizeURL: url, state: state)
    }
}

private struct SocialAuthPollDTO: Decodable {
    let status: String
    let exchangeCode: String?
    let error: String?

    func model() -> SocialAuthPollResult {
        SocialAuthPollResult(
            exchangeCode: exchangeCode,
            errorMessage: error,
            isPending: status == "pending"
        )
    }
}

struct LiveAuthService: AuthServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func login(email: String, password: String) async throws -> AuthSession {
        struct Payload: Encodable {
            let email: String
            let password: String
        }

        let request = APIRequest<AuthEnvelopeDTO>(
            path: "/auth/login",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try Payload(email: email, password: password).jsonData()
        )

        return try await apiClient.send(request).model()
    }

    func startSocialLogin(provider: SocialAuthProvider) async throws -> SocialAuthStart {
        struct Payload: Encodable {
            let provider: String
        }

        let request = APIRequest<SocialAuthStartDTO>(
            path: "/auth/social/start",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try Payload(provider: provider.rawValue).jsonData()
        )

        let dto = try await apiClient.send(request)
        return try dto.model()
    }

    func pollSocialLogin(state: String) async throws -> SocialAuthPollResult {
        try await apiClient.send(
            APIRequest<SocialAuthPollDTO>(
                path: "/auth/social/poll",
                queryItems: [URLQueryItem(name: "state", value: state)]
            )
        ).model()
    }

    func exchangeSocialLogin(code: String) async throws -> AuthSession {
        struct Payload: Encodable {
            let code: String
        }

        let request = APIRequest<AuthEnvelopeDTO>(
            path: "/auth/social/exchange",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try Payload(code: code).jsonData()
        )

        return try await apiClient.send(request).model()
    }

    func requestPasswordReset(email: String) async throws {
        struct Payload: Encodable {
            let email: String
        }

        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/auth/forgot-password/request",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try Payload(email: email).jsonData()
            )
        )
    }

    func confirmPasswordReset(email: String, code: String, newPassword: String) async throws {
        struct Payload: Encodable {
            let email: String
            let code: String
            let newPassword: String
        }

        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/auth/forgot-password/confirm",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try Payload(email: email, code: code, newPassword: newPassword).jsonData()
            )
        )
    }

    func signupCoach(_ request: CoachSignupRequest) async throws -> AuthSession {
        struct Payload: Encodable {
            let role = "coach"
            let teamName: String
            let firstName: String
            let lastName: String
            let email: String
            let password: String
            let phone: String?
        }

        let body = try Payload(
            teamName: request.teamName,
            firstName: request.firstName,
            lastName: request.lastName,
            email: request.email,
            password: request.password,
            phone: request.phone
        ).jsonData()

        let apiRequest = APIRequest<AuthEnvelopeDTO>(
            path: "/auth/signup",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: body
        )

        return try await apiClient.send(apiRequest).model()
    }

    func signupAthlete(_ request: AthleteSignupRequest) async throws -> AuthSession {
        struct Payload: Encodable {
            let role = "athlete"
            let teamCode: String
            let firstName: String
            let lastName: String
            let email: String
            let password: String
            let phone: String?
            let age: Int
            let grade: String
        }

        let body = try Payload(
            teamCode: request.teamCode,
            firstName: request.firstName,
            lastName: request.lastName,
            email: request.email,
            password: request.password,
            phone: request.phone,
            age: request.age,
            grade: request.grade
        ).jsonData()

        let apiRequest = APIRequest<AuthEnvelopeDTO>(
            path: "/auth/signup",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: body
        )

        return try await apiClient.send(apiRequest).model()
    }

    func refreshCurrentSession(using token: String) async throws -> AuthSession {
        let refresh = try await apiClient.send(
            APIRequest<AuthRefreshDTO>(
                path: "/auth/me",
                requiresAuth: true
            )
        )

        return AuthSession(token: token, user: refresh.user.model(), team: refresh.team?.model())
    }
}

private struct AnnouncementDTO: Decodable {
    let id: String
    let teamId: String
    let title: String
    let body: String
    let authorName: String
    let createdAt: String

    func model() -> Announcement {
        Announcement(
            id: id,
            teamID: teamId,
            title: title,
            body: body,
            authorName: authorName,
            createdAt: BackendDateParser.parse(createdAt)
        )
    }
}

private struct AnnouncementCommentDTO: Decodable {
    let id: String
    let announcementId: String
    let authorUserId: String
    let authorName: String
    let body: String
    let createdAt: String

    func model() -> AnnouncementComment {
        AnnouncementComment(
            id: id,
            announcementID: announcementId,
            authorUserID: authorUserId,
            authorName: authorName,
            body: body,
            createdAt: BackendDateParser.parse(createdAt)
        )
    }
}

struct LiveAnnouncementService: AnnouncementServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchAnnouncements() async throws -> [Announcement] {
        try await apiClient.send(
            APIRequest<[AnnouncementDTO]>(
                path: "/announcements",
                requiresAuth: true
            )
        ).map { $0.model() }
    }

    func createAnnouncement(_ draft: AnnouncementDraft) async throws -> Announcement {
        let request = APIRequest<AnnouncementDTO>(
            path: "/announcements",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try draft.jsonData(),
            requiresAuth: true
        )

        return try await apiClient.send(request).model()
    }

    func fetchComments(announcementID: String) async throws -> [AnnouncementComment] {
        try await apiClient.send(
            APIRequest<[AnnouncementCommentDTO]>(
                path: "/announcements/\(announcementID)/comments",
                requiresAuth: true
            )
        ).map { $0.model() }
    }

    func createComment(announcementID: String, draft: AnnouncementCommentDraft) async throws -> AnnouncementComment {
        let request = APIRequest<AnnouncementCommentDTO>(
            path: "/announcements/\(announcementID)/comments",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try draft.jsonData(),
            requiresAuth: true
        )

        return try await apiClient.send(request).model()
    }
}

private struct ChatMessageDTO: Decodable {
    let id: String
    let teamId: String
    let senderUserId: String
    let senderName: String
    let senderRole: UserRole
    let body: String
    let imageUrl: String?
    let createdAt: String

    func model() -> ChatMessage {
        ChatMessage(
            id: id,
            teamID: teamId,
            senderUserID: senderUserId,
            senderName: senderName,
            senderRole: senderRole,
            body: body,
            imageURL: imageUrl.flatMap(URL.init(string:)),
            createdAt: BackendDateParser.parse(createdAt)
        )
    }
}

struct LiveChatService: ChatServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchMessages() async throws -> [ChatMessage] {
        try await apiClient.send(
            APIRequest<[ChatMessageDTO]>(
                path: "/chat/messages",
                requiresAuth: true
            )
        ).map { $0.model() }
    }

    func sendMessage(body: String, attachment: ChatAttachmentUpload?) async throws -> ChatMessage {
        if let attachment {
            let boundary = "Boundary-\(UUID().uuidString)"
            let data = multipartBody(body: body, attachment: attachment, boundary: boundary)
            let request = APIRequest<ChatMessageDTO>(
                path: "/chat/messages",
                method: .post,
                headers: ["Content-Type": "multipart/form-data; boundary=\(boundary)"],
                body: data,
                requiresAuth: true
            )
            return try await apiClient.send(request).model()
        }

        struct Payload: Encodable {
            let body: String
        }

        let request = APIRequest<ChatMessageDTO>(
            path: "/chat/messages",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try Payload(body: body).jsonData(),
            requiresAuth: true
        )

        return try await apiClient.send(request).model()
    }

    private func multipartBody(body: String, attachment: ChatAttachmentUpload, boundary: String) -> Data {
        var data = Data()

        if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            data.append("--\(boundary)\r\n".utf8Data)
            data.append("Content-Disposition: form-data; name=\"body\"\r\n\r\n".utf8Data)
            data.append("\(body)\r\n".utf8Data)
        }

        data.append("--\(boundary)\r\n".utf8Data)
        data.append(
            "Content-Disposition: form-data; name=\"image\"; filename=\"\(attachment.filename)\"\r\n".utf8Data
        )
        data.append("Content-Type: \(attachment.mimeType)\r\n\r\n".utf8Data)
        data.append(attachment.data)
        data.append("\r\n".utf8Data)
        data.append("--\(boundary)--\r\n".utf8Data)

        return data
    }
}

private struct RosterMemberDTO: Decodable {
    let id: String
    let role: UserRole
    let firstName: String
    let lastName: String
    let email: String
    let phone: String?
    let age: Int?
    let grade: String?

    func model() -> TeamRosterMember {
        TeamRosterMember(
            id: id,
            role: role,
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            age: age,
            grade: grade
        )
    }
}

struct LiveRosterService: RosterServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchTeamRoster() async throws -> [TeamRosterMember] {
        try await apiClient.send(
            APIRequest<[RosterMemberDTO]>(
                path: "/team/roster",
                requiresAuth: true
            )
        ).map { $0.model() }
    }
}

private struct TeamStateAthleteDTO: Decodable {
    let id: String
    let remoteUserId: String?
    let name: String
    let firstName: String?
    let lastName: String?
    let email: String?
    let phone: String?
    let age: Int?
    let grade: String?
    let groupId: String?
    let photoUrl: String?
    let createdAt: String

    func model() -> Athlete {
        Athlete(
            id: id,
            remoteUserID: remoteUserId,
            name: name,
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            age: age,
            grade: grade,
            groupID: groupId,
            photoURL: photoUrl.flatMap(URL.init(string:)),
            createdAt: BackendDateParser.parse(createdAt)
        )
    }
}

private struct TeamStateGroupDTO: Decodable {
    let id: String
    let name: String
    let colorHex: String
    let sortOrder: Int

    func model() -> TeamGroup {
        TeamGroup(
            id: id,
            name: name,
            colorHex: colorHex,
            sortOrder: sortOrder
        )
    }
}

private struct TeamStateSnapshotDTO: Decodable {
    let athletes: [TeamStateAthleteDTO]
    let groups: [TeamStateGroupDTO]

    func model() -> TeamStateSnapshot {
        TeamStateSnapshot(
            athletes: athletes.map { $0.model() },
            groups: groups.map { $0.model() }
        )
    }
}

private struct TeamSyncAthletePayload: Encodable {
    let id: String
    let remoteUserId: String?
    let name: String
    let firstName: String?
    let lastName: String?
    let email: String?
    let phone: String?
    let age: Int?
    let grade: String?
    let groupId: String?
    let photoUrl: String?
    let createdAt: Int64
}

private struct TeamSyncGroupPayload: Encodable {
    let id: String
    let name: String
    let colorHex: String
    let sortOrder: Int
}

private struct TeamSyncPayload: Encodable {
    let athletes: [TeamSyncAthletePayload]
    let groups: [TeamSyncGroupPayload]
}

private struct AttendanceRecordDTO: Decodable {
    let id: String
    let date: String
    let athleteUserId: String?
    let athleteLocalId: String?
    let status: AttendanceStatus
    let note: String?
    let markedByUserId: String
    let createdAt: String
    let updatedAt: String

    func model() -> AttendanceRecord {
        AttendanceRecord(
            id: id,
            date: AttendanceDateCodec.parse(date),
            athleteUserID: athleteUserId,
            athleteLocalID: athleteLocalId,
            status: status,
            note: note,
            markedByUserID: markedByUserId,
            createdAt: BackendDateParser.parse(createdAt),
            updatedAt: BackendDateParser.parse(updatedAt)
        )
    }
}

private struct AttendanceDaySnapshotDTO: Decodable {
    let date: String
    let records: [AttendanceRecordDTO]

    func model() -> [AttendanceRecord] {
        let day = AttendanceDateCodec.parse(date)
        return records.map { record in
            let model = record.model()
            return AttendanceRecord(
                id: model.id,
                date: day,
                athleteUserID: model.athleteUserID,
                athleteLocalID: model.athleteLocalID,
                status: model.status,
                note: model.note,
                markedByUserID: model.markedByUserID,
                createdAt: model.createdAt,
                updatedAt: model.updatedAt
            )
        }
    }
}

private struct AttendanceMonthSnapshotDTO: Decodable {
    let month: String
    let records: [AttendanceRecordDTO]

    func model() -> [AttendanceRecord] {
        records.map { $0.model() }
    }
}

private struct AttendanceMarkPayload: Encodable {
    let date: String
    let athleteUserId: String?
    let athleteLocalId: String?
    let status: String?
    let note: String?
}

private struct AttendanceMarkResponseDTO: Decodable {
    let deleted: Bool
    let record: AttendanceRecordDTO?

    func model() -> AttendanceRecord? {
        guard !deleted else { return nil }
        return record?.model()
    }
}

private struct TemplateLibraryTemplateDTO: Decodable {
    let id: String
    let name: String
    let createdAt: Double
    let updatedAt: Double

    func model() -> WorkoutTemplate {
        WorkoutTemplate(
            id: id,
            name: name,
            createdAt: BackendDateParser.millisecondsDate(createdAt),
            updatedAt: BackendDateParser.millisecondsDate(updatedAt)
        )
    }
}

private struct TemplateLibraryRepeatGroupDTO: Decodable {
    let id: String
    let templateId: String
    let repeatCount: Int
    let sortOrder: Int

    func model() -> TemplateRepeatGroup {
        TemplateRepeatGroup(
            id: id,
            templateID: templateId,
            repeatCount: repeatCount,
            sortOrder: sortOrder
        )
    }
}

private struct TemplateLibraryStepDTO: Decodable {
    let id: String
    let templateId: String
    let sortOrder: Int
    let type: TemplateStepType
    let distanceValue: Double?
    let distanceUnit: DistanceUnit?
    let durationMilliseconds: Int?
    let label: String
    let repeatGroupId: String?

    func model() -> TemplateStep {
        TemplateStep(
            id: id,
            templateID: templateId,
            sortOrder: sortOrder,
            type: type,
            distanceValue: distanceValue,
            distanceUnit: distanceUnit,
            durationMilliseconds: durationMilliseconds,
            label: label,
            repeatGroupID: repeatGroupId
        )
    }
}

private struct TemplateLibrarySnapshotDTO: Decodable {
    let templates: [TemplateLibraryTemplateDTO]
    let repeatGroups: [TemplateLibraryRepeatGroupDTO]
    let steps: [TemplateLibraryStepDTO]

    func model() -> TemplateLibrarySnapshot {
        TemplateLibrarySnapshot(
            templates: templates.map { $0.model() },
            repeatGroups: repeatGroups.map { $0.model() },
            steps: steps.map { $0.model() }
        )
    }
}

private struct TemplateLibraryTemplatePayload: Encodable {
    let id: String
    let name: String
    let createdAt: Int64
    let updatedAt: Int64
}

private struct TemplateLibraryRepeatGroupPayload: Encodable {
    let id: String
    let templateId: String
    let repeatCount: Int
    let sortOrder: Int
}

private struct TemplateLibraryStepPayload: Encodable {
    let id: String
    let templateId: String
    let sortOrder: Int
    let type: String
    let distanceValue: Double?
    let distanceUnit: String?
    let durationMilliseconds: Int?
    let label: String
    let repeatGroupId: String?
}

private struct TemplateLibrarySyncPayload: Encodable {
    let templates: [TemplateLibraryTemplatePayload]
    let repeatGroups: [TemplateLibraryRepeatGroupPayload]
    let steps: [TemplateLibraryStepPayload]
}

private struct TeamBrandingDTO: Codable {
    let logoBase64: String?

    func model() -> TeamBranding {
        TeamBranding(logoBase64: logoBase64)
    }
}

private struct TeamBrandingPayload: Encodable {
    let logoBase64: String?
}

private struct TeamWorkoutSplitPayload: Encodable {
    let splitNumber: Int
    let elapsedMilliseconds: Int
    let timestamp: Int64
    let isFinal: Bool
    let stepType: String?
    let stepDistanceValue: Double?
    let stepDistanceUnit: String?
    let stepLabel: String?
}

private struct TeamWorkoutAthletePayload: Encodable {
    let athleteId: String
    let athleteUserId: String?
    let athleteEmail: String?
    let athletePhone: String?
    let athleteName: String
    let groupId: String?
    let groupName: String?
    let groupColorHex: String?
    let startedAt: Int64?
    let stoppedAt: Int64?
    let totalElapsedMilliseconds: Int?
    let splits: [TeamWorkoutSplitPayload]
}

private struct TeamWorkoutPayload: Encodable {
    let id: String
    let name: String
    let workoutAt: Int64
    let templateId: String?
    let athletes: [TeamWorkoutAthletePayload]
}

struct LiveTeamService: TeamServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchTeamState() async throws -> TeamStateSnapshot {
        try await apiClient.send(
            APIRequest<TeamStateSnapshotDTO>(
                path: "/team/state",
                requiresAuth: true
            )
        ).model()
    }

    func syncTeamState(_ snapshot: TeamStateSnapshot) async throws -> TeamStateSnapshot {
        let payload = TeamSyncPayload(
            athletes: snapshot.athletes.map { athlete in
                TeamSyncAthletePayload(
                    id: athlete.id,
                    remoteUserId: athlete.remoteUserID,
                    name: athlete.name,
                    firstName: athlete.firstName,
                    lastName: athlete.lastName,
                    email: athlete.email,
                    phone: athlete.phone,
                    age: athlete.age,
                    grade: athlete.grade,
                    groupId: athlete.groupID,
                    photoUrl: athlete.photoURL?.absoluteString,
                    createdAt: athlete.createdAt.millisecondsSince1970
                )
            },
            groups: snapshot.groups.map { group in
                TeamSyncGroupPayload(
                    id: group.id,
                    name: group.name,
                    colorHex: group.colorHex,
                    sortOrder: group.sortOrder
                )
            }
        )

        let response = try await apiClient.send(
            APIRequest<TeamStateSnapshotDTO>(
                path: "/team/sync",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try payload.jsonData(),
                requiresAuth: true
            )
        )

        return response.model()
    }

    func fetchAttendance(date: Date) async throws -> [AttendanceRecord] {
        let dateValue = AttendanceDateCodec.string(from: date)
        let response = try await apiClient.send(
            APIRequest<AttendanceDaySnapshotDTO>(
                path: "/attendance",
                queryItems: [URLQueryItem(name: "date", value: dateValue)],
                requiresAuth: true
            )
        )

        return response.model()
    }

    func fetchAttendanceMonth(containing date: Date) async throws -> [AttendanceRecord] {
        let monthValue = AttendanceDateCodec.monthString(from: date)
        let response = try await apiClient.send(
            APIRequest<AttendanceMonthSnapshotDTO>(
                path: "/attendance",
                queryItems: [URLQueryItem(name: "month", value: monthValue)],
                requiresAuth: true
            )
        )

        return response.model()
    }

    func markAttendance(_ draft: AttendanceMarkDraft) async throws -> AttendanceRecord? {
        let payload = AttendanceMarkPayload(
            date: AttendanceDateCodec.string(from: draft.date),
            athleteUserId: draft.athleteUserID,
            athleteLocalId: draft.athleteLocalID,
            status: draft.status?.rawValue,
            note: draft.note?.trimmingCharacters(in: .whitespacesAndNewlines),
        )

        let response = try await apiClient.send(
            APIRequest<AttendanceMarkResponseDTO>(
                path: "/attendance/mark",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try payload.jsonData(),
                requiresAuth: true
            )
        )

        return response.model()
    }

    func fetchTemplateLibrary() async throws -> TemplateLibrarySnapshot {
        try await apiClient.send(
            APIRequest<TemplateLibrarySnapshotDTO>(
                path: "/workouts/templates",
                requiresAuth: true
            )
        ).model()
    }

    func syncTemplateLibrary(_ snapshot: TemplateLibrarySnapshot) async throws -> TemplateLibrarySnapshot {
        let payload = TemplateLibrarySyncPayload(
            templates: snapshot.templates.map { template in
                TemplateLibraryTemplatePayload(
                    id: template.id,
                    name: template.name,
                    createdAt: template.createdAt.millisecondsSince1970,
                    updatedAt: template.updatedAt.millisecondsSince1970
                )
            },
            repeatGroups: snapshot.repeatGroups.map { group in
                TemplateLibraryRepeatGroupPayload(
                    id: group.id,
                    templateId: group.templateID,
                    repeatCount: group.repeatCount,
                    sortOrder: group.sortOrder
                )
            },
            steps: snapshot.steps.map { step in
                TemplateLibraryStepPayload(
                    id: step.id,
                    templateId: step.templateID,
                    sortOrder: step.sortOrder,
                    type: step.type.rawValue,
                    distanceValue: step.distanceValue,
                    distanceUnit: step.distanceUnit?.rawValue,
                    durationMilliseconds: step.durationMilliseconds,
                    label: step.label,
                    repeatGroupId: step.repeatGroupID
                )
            }
        )

        let response = try await apiClient.send(
            APIRequest<TemplateLibrarySnapshotDTO>(
                path: "/workouts/templates/sync",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try payload.jsonData(),
                requiresAuth: true
            )
        )

        return response.model()
    }

    func fetchTeamBranding() async throws -> TeamBranding {
        try await apiClient.send(
            APIRequest<TeamBrandingDTO>(
                path: "/team/branding",
                requiresAuth: true
            )
        ).model()
    }

    func updateTeamBranding(_ branding: TeamBranding) async throws -> TeamBranding {
        let response = try await apiClient.send(
            APIRequest<TeamBrandingDTO>(
                path: "/team/branding",
                method: .put,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try TeamBrandingPayload(logoBase64: branding.logoBase64).jsonData(),
                requiresAuth: true
            )
        )

        return response.model()
    }

    func uploadCompletedWorkout(_ workout: CompletedWorkoutUpload) async throws {
        let payload = TeamWorkoutPayload(
            id: workout.id,
            name: workout.name,
            workoutAt: workout.workoutAt.millisecondsSince1970,
            templateId: workout.templateID,
            athletes: workout.athletes.map { athlete in
                TeamWorkoutAthletePayload(
                    athleteId: athlete.athleteID,
                    athleteUserId: athlete.athleteUserID,
                    athleteEmail: athlete.athleteEmail,
                    athletePhone: athlete.athletePhone,
                    athleteName: athlete.athleteName,
                    groupId: athlete.groupID,
                    groupName: athlete.groupName,
                    groupColorHex: athlete.groupColorHex,
                    startedAt: athlete.startedAt?.millisecondsSince1970,
                    stoppedAt: athlete.stoppedAt?.millisecondsSince1970,
                    totalElapsedMilliseconds: athlete.totalElapsedMilliseconds,
                    splits: athlete.splits.map { split in
                        TeamWorkoutSplitPayload(
                            splitNumber: split.splitNumber,
                            elapsedMilliseconds: split.elapsedMilliseconds,
                            timestamp: split.timestamp.millisecondsSince1970,
                            isFinal: split.isFinal,
                            stepType: split.stepType?.rawValue,
                            stepDistanceValue: split.stepDistanceValue,
                            stepDistanceUnit: split.stepDistanceUnit?.rawValue,
                            stepLabel: split.stepLabel
                        )
                    }
                )
            }
        )

        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/workouts/completed",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try payload.jsonData(),
                requiresAuth: true
            )
        )
    }
}

private struct ActivityFeedItemDTO: Decodable {
    let id: String
    let teamId: String
    let ownerUserId: String
    let ownerName: String
    let source: ActivitySource
    let externalId: String?
    let title: String
    let activityType: String
    let startAt: String
    let distanceMeters: Double?
    let movingSeconds: Int?
    let elapsedSeconds: Int?
    let elevationGainMeters: Double?
    let averageSpeedMps: Double?
    let polyline: String?
    let commentCount: Int
    let createdAt: String
    let updatedAt: String

    func model() -> ActivityFeedItem {
        ActivityFeedItem(
            id: id,
            teamID: teamId,
            ownerUserID: ownerUserId,
            ownerName: ownerName,
            source: source,
            externalID: externalId,
            title: title,
            activityType: activityType,
            startAt: BackendDateParser.parse(startAt),
            distanceMeters: distanceMeters,
            movingSeconds: movingSeconds,
            elapsedSeconds: elapsedSeconds,
            elevationGainMeters: elevationGainMeters,
            averageSpeedMPS: averageSpeedMps,
            polyline: polyline,
            commentCount: commentCount,
            createdAt: BackendDateParser.parse(createdAt),
            updatedAt: BackendDateParser.parse(updatedAt)
        )
    }
}

private struct ActivityWorkoutSplitDTO: Decodable {
    let splitNumber: Int
    let elapsedMilliseconds: Int
    let lapMilliseconds: Int
    let isFinal: Bool
    let stepType: String?
    let stepDistanceValue: Double?
    let stepDistanceUnit: String?
    let stepLabel: String?

    func model() -> ActivityWorkoutSplit {
        let normalizedType = (stepType ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let mappedType: TemplateStepType?
        if normalizedType == TemplateStepType.work.rawValue {
            mappedType = .work
        } else if normalizedType == TemplateStepType.recovery.rawValue {
            mappedType = .recovery
        } else {
            mappedType = nil
        }

        let normalizedUnit = (stepDistanceUnit ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let mappedUnit: DistanceUnit?
        switch normalizedUnit {
        case DistanceUnit.meters.rawValue:
            mappedUnit = .meters
        case DistanceUnit.kilometers.rawValue:
            mappedUnit = .kilometers
        case DistanceUnit.miles.rawValue:
            mappedUnit = .miles
        default:
            mappedUnit = nil
        }

        return ActivityWorkoutSplit(
            splitNumber: splitNumber,
            elapsedMilliseconds: elapsedMilliseconds,
            lapMilliseconds: lapMilliseconds,
            isFinal: isFinal,
            stepType: mappedType,
            stepDistanceValue: stepDistanceValue,
            stepDistanceUnit: mappedUnit,
            stepLabel: stepLabel
        )
    }
}

private struct ActivityWorkoutDetailDTO: Decodable {
    let activityId: String
    let workoutId: String
    let workoutName: String
    let athleteName: String
    let startedAt: String?
    let stoppedAt: String?
    let totalElapsedMilliseconds: Int?
    let splits: [ActivityWorkoutSplitDTO]

    func model() -> ActivityWorkoutDetail {
        ActivityWorkoutDetail(
            activityID: activityId,
            workoutID: workoutId,
            workoutName: workoutName,
            athleteName: athleteName,
            startedAt: startedAt.flatMap(BackendDateParser.parse),
            stoppedAt: stoppedAt.flatMap(BackendDateParser.parse),
            totalElapsedMilliseconds: totalElapsedMilliseconds,
            splits: splits.map { $0.model() }
        )
    }
}

private struct ActivityCommentDTO: Decodable {
    let id: String
    let activityId: String
    let authorUserId: String
    let authorName: String
    let body: String
    let createdAt: String

    func model() -> ActivityComment {
        ActivityComment(
            id: id,
            activityID: activityId,
            authorUserID: authorUserId,
            authorName: authorName,
            body: body,
            createdAt: BackendDateParser.parse(createdAt)
        )
    }
}

struct LiveActivityService: ActivityServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchFeed(scope: ActivityFeedScope, ownerUserID: String?, limit: Int, offset: Int) async throws -> [ActivityFeedItem] {
        var queryItems = [
            URLQueryItem(name: "scope", value: scope.rawValue),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]

        if let ownerUserID, !ownerUserID.isEmpty {
            queryItems.append(URLQueryItem(name: "ownerUserId", value: ownerUserID))
        }

        return try await apiClient.send(
            APIRequest<[ActivityFeedItemDTO]>(
                path: "/activities/feed",
                queryItems: queryItems,
                requiresAuth: true
            )
        ).map { $0.model() }
    }

    func fetchWorkoutDetail(activityID: String) async throws -> ActivityWorkoutDetail {
        try await apiClient.send(
            APIRequest<ActivityWorkoutDetailDTO>(
                path: "/activities/\(activityID)/workout-detail",
                requiresAuth: true
            )
        ).model()
    }

    func fetchComments(activityID: String) async throws -> [ActivityComment] {
        try await apiClient.send(
            APIRequest<[ActivityCommentDTO]>(
                path: "/activities/\(activityID)/comments",
                requiresAuth: true
            )
        ).map { $0.model() }
    }

    func createComment(activityID: String, draft: ActivityCommentDraft) async throws -> ActivityComment {
        let request = APIRequest<ActivityCommentDTO>(
            path: "/activities/\(activityID)/comments",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try draft.jsonData(),
            requiresAuth: true
        )

        return try await apiClient.send(request).model()
    }
}

private struct StravaStatusDTO: Decodable {
    let connected: Bool
    let athleteName: String?
    let expiresAt: Int64?

    func model() -> StravaConnectionStatus {
        StravaConnectionStatus(
            connected: connected,
            athleteName: athleteName,
            expiresAt: expiresAt.map { Date(timeIntervalSince1970: TimeInterval($0)) }
        )
    }
}

private struct StravaConnectStartDTO: Decodable {
    let authorizeUrl: String

    func model() throws -> StravaConnectStart {
        guard let url = URL(string: authorizeUrl) else {
            throw APIError.decoding("Invalid Strava authorize URL.")
        }

        return StravaConnectStart(authorizeURL: url)
    }
}

private struct StravaSyncResultDTO: Decodable {
    let imported: Int
    let totalFetched: Int

    func model() -> StravaSyncResult {
        StravaSyncResult(imported: imported, totalFetched: totalFetched)
    }
}

struct LiveIntegrationService: IntegrationServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchStravaStatus() async throws -> StravaConnectionStatus {
        try await apiClient.send(
            APIRequest<StravaStatusDTO>(
                path: "/integrations/strava/status",
                requiresAuth: true
            )
        ).model()
    }

    func startStravaConnect() async throws -> StravaConnectStart {
        let dto = try await apiClient.send(
            APIRequest<StravaConnectStartDTO>(
                path: "/integrations/strava/connect",
                requiresAuth: true
            )
        )

        return try dto.model()
    }

    func syncStravaActivities() async throws -> StravaSyncResult {
        try await apiClient.send(
            APIRequest<StravaSyncResultDTO>(
                path: "/integrations/strava/sync",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: Data("{}".utf8),
                requiresAuth: true
            )
        ).model()
    }

    func disconnectStrava() async throws {
        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/integrations/strava/disconnect",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: Data("{}".utf8),
                requiresAuth: true
            )
        )
    }
}

private struct ScheduleEventDTO: Decodable {
    let id: String
    let teamId: String
    let type: ScheduleEventType
    let category: String
    let title: String
    let startsAt: Double
    let endsAt: Double?
    let location: String?
    let locationLatitude: Double?
    let locationLongitude: Double?
    let notes: String?
    let isRecurring: Bool
    let recurrenceDays: [Int]
    let recurrenceEndsAt: Double?
    let createdAt: Double
    let updatedAt: Double

    func model() -> ScheduleEvent {
        ScheduleEvent(
            id: id,
            teamID: teamId,
            type: type,
            category: category,
            title: title,
            startsAt: BackendDateParser.millisecondsDate(startsAt),
            endsAt: endsAt.map(BackendDateParser.millisecondsDate),
            location: location,
            locationLatitude: locationLatitude,
            locationLongitude: locationLongitude,
            notes: notes,
            isRecurring: isRecurring,
            recurrenceDays: recurrenceDays,
            recurrenceEndsAt: recurrenceEndsAt.map(BackendDateParser.millisecondsDate),
            createdAt: BackendDateParser.millisecondsDate(createdAt),
            updatedAt: BackendDateParser.millisecondsDate(updatedAt)
        )
    }
}

private struct ScheduleOverrideDTO: Decodable {
    let id: String
    let eventId: String
    let teamId: String
    let occurrenceStartsAt: Double
    let type: ScheduleEventType
    let category: String
    let title: String
    let startsAt: Double
    let endsAt: Double?
    let location: String?
    let locationLatitude: Double?
    let locationLongitude: Double?
    let notes: String?
    let isCancelled: Bool
    let createdAt: Double
    let updatedAt: Double

    func model() -> ScheduleEventOverride {
        ScheduleEventOverride(
            id: id,
            eventID: eventId,
            teamID: teamId,
            occurrenceStartsAt: BackendDateParser.millisecondsDate(occurrenceStartsAt),
            type: type,
            category: category,
            title: title,
            startsAt: BackendDateParser.millisecondsDate(startsAt),
            endsAt: endsAt.map(BackendDateParser.millisecondsDate),
            location: location,
            locationLatitude: locationLatitude,
            locationLongitude: locationLongitude,
            notes: notes,
            isCancelled: isCancelled,
            createdAt: BackendDateParser.millisecondsDate(createdAt),
            updatedAt: BackendDateParser.millisecondsDate(updatedAt)
        )
    }
}

private struct ScheduleSnapshotDTO: Decodable {
    let events: [ScheduleEventDTO]
    let overrides: [ScheduleOverrideDTO]

    func model() -> ScheduleSnapshot {
        ScheduleSnapshot(
            events: events.map { $0.model() },
            overrides: overrides.map { $0.model() }
        )
    }
}

struct LiveScheduleService: ScheduleServiceProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchSchedule() async throws -> ScheduleSnapshot {
        try await apiClient.send(
            APIRequest<ScheduleSnapshotDTO>(
                path: "/schedule",
                requiresAuth: true
            )
        ).model()
    }

    func createEvent(_ draft: ScheduleEventDraft) async throws -> ScheduleEvent {
        let request = APIRequest<ScheduleEventDTO>(
            path: "/schedule/events",
            method: .post,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try schedulePayload(for: draft).jsonData(),
            requiresAuth: true
        )

        return try await apiClient.send(request).model()
    }

    func updateEvent(eventID: String, draft: ScheduleEventDraft) async throws -> ScheduleEvent {
        let request = APIRequest<ScheduleEventDTO>(
            path: "/schedule/events/\(eventID)",
            method: .put,
            headers: ["Content-Type": "application/json; charset=utf-8"],
            body: try schedulePayload(for: draft).jsonData(),
            requiresAuth: true
        )

        return try await apiClient.send(request).model()
    }

    func deleteEvent(eventID: String) async throws {
        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/schedule/events/\(eventID)",
                method: .delete,
                requiresAuth: true
            )
        )
    }

    func updateOccurrence(eventID: String, occurrenceStartsAt: Date, draft: ScheduleEventDraft) async throws {
        struct OccurrencePayload: Encodable {
            let eventId: String
            let occurrenceStartsAt: Int64
            let type: ScheduleEventType
            let category: String
            let title: String
            let startsAt: Int64
            let endsAt: Int64?
            let location: String?
            let locationLatitude: Double?
            let locationLongitude: Double?
            let notes: String?
            let isRecurring: Bool
            let recurrenceDays: [Int]
            let recurrenceEndsAt: Int64?
        }

        let payload = OccurrencePayload(
            eventId: eventID,
            occurrenceStartsAt: occurrenceStartsAt.millisecondsSince1970,
            type: draft.type,
            category: draft.category,
            title: draft.title,
            startsAt: draft.startsAt.millisecondsSince1970,
            endsAt: draft.endsAt?.millisecondsSince1970,
            location: draft.location,
            locationLatitude: draft.locationLatitude,
            locationLongitude: draft.locationLongitude,
            notes: draft.notes,
            isRecurring: draft.isRecurring,
            recurrenceDays: draft.recurrenceDays,
            recurrenceEndsAt: draft.recurrenceEndsAt?.millisecondsSince1970
        )

        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/schedule/occurrences",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try payload.jsonData(),
                requiresAuth: true
            )
        )
    }

    func deleteOccurrence(eventID: String, occurrenceStartsAt: Date) async throws {
        struct DeletePayload: Encodable {
            let eventId: String
            let occurrenceStartsAt: Int64
        }

        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/schedule/occurrences/delete",
                method: .post,
                headers: ["Content-Type": "application/json; charset=utf-8"],
                body: try DeletePayload(
                    eventId: eventID,
                    occurrenceStartsAt: occurrenceStartsAt.millisecondsSince1970
                ).jsonData(),
                requiresAuth: true
            )
        )
    }

    func deleteAllEvents() async throws {
        _ = try await apiClient.send(
            APIRequest<EmptyResponse>(
                path: "/schedule/events",
                method: .delete,
                requiresAuth: true
            )
        )
    }

    private func schedulePayload(for draft: ScheduleEventDraft) -> some Encodable {
        SchedulePayload(
            type: draft.type,
            category: draft.category,
            title: draft.title,
            startsAt: draft.startsAt.millisecondsSince1970,
            endsAt: draft.endsAt?.millisecondsSince1970,
            location: draft.location,
            locationLatitude: draft.locationLatitude,
            locationLongitude: draft.locationLongitude,
            notes: draft.notes,
            isRecurring: draft.isRecurring,
            recurrenceDays: draft.recurrenceDays,
            recurrenceEndsAt: draft.recurrenceEndsAt?.millisecondsSince1970
        )
    }

    private struct SchedulePayload: Encodable {
        let type: ScheduleEventType
        let category: String
        let title: String
        let startsAt: Int64
        let endsAt: Int64?
        let location: String?
        let locationLatitude: Double?
        let locationLongitude: Double?
        let notes: String?
        let isRecurring: Bool
        let recurrenceDays: [Int]
        let recurrenceEndsAt: Int64?
    }
}

private extension Date {
    var millisecondsSince1970: Int64 {
        Int64((timeIntervalSince1970 * 1000).rounded())
    }
}

private extension String {
    var utf8Data: Data {
        Data(utf8)
    }
}
