import Foundation

protocol AuthServiceProtocol: Sendable {
    func login(email: String, password: String) async throws -> AuthSession
    func startSocialLogin(provider: SocialAuthProvider) async throws -> SocialAuthStart
    func pollSocialLogin(state: String) async throws -> SocialAuthPollResult
    func exchangeSocialLogin(code: String) async throws -> AuthSession
    func requestPasswordReset(email: String) async throws
    func confirmPasswordReset(email: String, code: String, newPassword: String) async throws
    func signupCoach(_ request: CoachSignupRequest) async throws -> AuthSession
    func signupAthlete(_ request: AthleteSignupRequest) async throws -> AuthSession
    func refreshCurrentSession(using token: String) async throws -> AuthSession
}

protocol AnnouncementServiceProtocol: Sendable {
    func fetchAnnouncements() async throws -> [Announcement]
    func createAnnouncement(_ draft: AnnouncementDraft) async throws -> Announcement
    func fetchComments(announcementID: String) async throws -> [AnnouncementComment]
    func createComment(announcementID: String, draft: AnnouncementCommentDraft) async throws -> AnnouncementComment
}

protocol ChatServiceProtocol: Sendable {
    func fetchMessages() async throws -> [ChatMessage]
    func sendMessage(body: String, attachment: ChatAttachmentUpload?) async throws -> ChatMessage
    func fetchDirectMessageConversations() async throws -> [DirectMessageConversation]
    func fetchDirectMessages(withUserID: String) async throws -> [DirectMessage]
    func sendDirectMessage(toUserID: String, body: String, attachment: ChatAttachmentUpload?) async throws -> DirectMessage
    func markDirectMessagesRead(withUserID: String) async throws
}

protocol RosterServiceProtocol: Sendable {
    func fetchTeamRoster() async throws -> [TeamRosterMember]
}

protocol TeamServiceProtocol: Sendable {
    func fetchTeamState() async throws -> TeamStateSnapshot
    func syncTeamState(_ snapshot: TeamStateSnapshot) async throws -> TeamStateSnapshot
    func uploadProfilePhoto(imageData: Data, filename: String, mimeType: String, athleteID: String?, userID: String?) async throws -> URL
    func fetchAttendance(date: Date) async throws -> [AttendanceRecord]
    func fetchAttendanceMonth(containing date: Date) async throws -> [AttendanceRecord]
    func markAttendance(_ draft: AttendanceMarkDraft) async throws -> AttendanceRecord?
    func fetchTemplateLibrary() async throws -> TemplateLibrarySnapshot
    func syncTemplateLibrary(_ snapshot: TemplateLibrarySnapshot) async throws -> TemplateLibrarySnapshot
    func fetchProfilePhotoURL(userID: String?) async throws -> URL?
    func fetchCompletedWorkoutHistory(limit: Int) async throws -> CompletedWorkoutHistorySnapshot
    func fetchTeamBranding() async throws -> TeamBranding
    func updateTeamBranding(_ branding: TeamBranding) async throws -> TeamBranding
    func uploadCompletedWorkout(_ workout: CompletedWorkoutUpload) async throws
}

protocol ActivityServiceProtocol: Sendable {
    func fetchFeed(scope: ActivityFeedScope, ownerUserID: String?, limit: Int, offset: Int) async throws -> [ActivityFeedItem]
    func fetchWorkoutDetail(activityID: String) async throws -> ActivityWorkoutDetail
    func fetchComments(activityID: String) async throws -> [ActivityComment]
    func createComment(activityID: String, draft: ActivityCommentDraft) async throws -> ActivityComment
}

protocol IntegrationServiceProtocol: Sendable {
    func fetchStravaStatus(ownerUserID: String?) async throws -> StravaConnectionStatus
    func startStravaConnect() async throws -> StravaConnectStart
    func syncStravaActivities(ownerUserID: String?) async throws -> StravaSyncResult
    func disconnectStrava() async throws
}

protocol ScheduleServiceProtocol: Sendable {
    func fetchSchedule() async throws -> ScheduleSnapshot
    func createEvent(_ draft: ScheduleEventDraft) async throws -> ScheduleEvent
    func updateEvent(eventID: String, draft: ScheduleEventDraft) async throws -> ScheduleEvent
    func deleteEvent(eventID: String) async throws
    func updateOccurrence(eventID: String, occurrenceStartsAt: Date, draft: ScheduleEventDraft) async throws
    func deleteOccurrence(eventID: String, occurrenceStartsAt: Date) async throws
    func deleteAllEvents() async throws
}
