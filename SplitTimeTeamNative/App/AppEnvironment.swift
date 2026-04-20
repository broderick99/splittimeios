import Foundation

struct AppConfiguration: Sendable {
    static let defaultAPIBaseURLString = "https://splitteam-api-dev.broderick99.workers.dev"

    let apiBaseURL: URL?

    static func load(
        bundle: Bundle = .main,
        processInfo: ProcessInfo = .processInfo
    ) -> AppConfiguration {
        let raw = (
            processInfo.environment["API_BASE_URL"]
            ?? bundle.object(forInfoDictionaryKey: "API_BASE_URL") as? String
            ?? Self.defaultAPIBaseURLString
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .trimmingTrailingSlashes()

        return AppConfiguration(apiBaseURL: raw.isEmpty ? nil : URL(string: raw))
    }
}

struct AppEnvironment {
    let configuration: AppConfiguration
    let sessionStore: SessionStore
    let localDataRepository: LocalDataRepository
    let apiClient: APIClient
    let authService: any AuthServiceProtocol
    let announcementService: any AnnouncementServiceProtocol
    let chatService: any ChatServiceProtocol
    let rosterService: any RosterServiceProtocol
    let teamService: any TeamServiceProtocol
    let activityService: any ActivityServiceProtocol
    let integrationService: any IntegrationServiceProtocol
    let scheduleService: any ScheduleServiceProtocol

    static func live() -> AppEnvironment {
        let configuration = AppConfiguration.load()
        let sessionStore = SessionStore()
        let localDataRepository = LocalDataRepository()
        let apiClient = APIClient(baseURL: configuration.apiBaseURL, sessionStore: sessionStore)

        return AppEnvironment(
            configuration: configuration,
            sessionStore: sessionStore,
            localDataRepository: localDataRepository,
            apiClient: apiClient,
            authService: LiveAuthService(apiClient: apiClient),
            announcementService: LiveAnnouncementService(apiClient: apiClient),
            chatService: LiveChatService(apiClient: apiClient),
            rosterService: LiveRosterService(apiClient: apiClient),
            teamService: LiveTeamService(apiClient: apiClient),
            activityService: LiveActivityService(apiClient: apiClient),
            integrationService: LiveIntegrationService(apiClient: apiClient),
            scheduleService: LiveScheduleService(apiClient: apiClient)
        )
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var isHydrating = true
    @Published private(set) var needsOnboarding = true
    @Published private(set) var session: AuthSession?

    private let authService: any AuthServiceProtocol
    private let sessionStore: SessionStore
    private let defaults: UserDefaults
    private let onboardingKey = "splitTimeTeam.onboardingCompleted"

    init(
        authService: any AuthServiceProtocol,
        sessionStore: SessionStore,
        defaults: UserDefaults = .standard
    ) {
        self.authService = authService
        self.sessionStore = sessionStore
        self.defaults = defaults

        Task {
            await bootstrap()
        }
    }

    func bootstrap() async {
        needsOnboarding = defaults.bool(forKey: onboardingKey) == false

        guard let storedSession = await sessionStore.loadSession() else {
            session = nil
            isHydrating = false
            return
        }

        do {
            let refreshed = try await authService.refreshCurrentSession(using: storedSession.token)
            session = refreshed
            await sessionStore.persist(refreshed)
        } catch {
            session = storedSession
        }

        isHydrating = false
    }

    func completeOnboarding() {
        defaults.set(true, forKey: onboardingKey)
        needsOnboarding = false
    }

    func login(email: String, password: String) async throws {
        let nextSession = try await authService.login(email: email, password: password)
        session = nextSession
        await sessionStore.persist(nextSession)
    }

    func startSocialLogin(provider: SocialAuthProvider) async throws -> SocialAuthStart {
        try await authService.startSocialLogin(provider: provider)
    }

    func pollSocialLogin(state: String) async throws -> SocialAuthPollResult {
        try await authService.pollSocialLogin(state: state)
    }

    func completeSocialLogin(code: String) async throws {
        let nextSession = try await authService.exchangeSocialLogin(code: code)
        session = nextSession
        await sessionStore.persist(nextSession)
    }

    func requestPasswordReset(email: String) async throws {
        try await authService.requestPasswordReset(email: email)
    }

    func confirmPasswordReset(email: String, code: String, newPassword: String) async throws {
        try await authService.confirmPasswordReset(email: email, code: code, newPassword: newPassword)
    }

    func signupCoach(_ request: CoachSignupRequest) async throws {
        let nextSession = try await authService.signupCoach(request)
        session = nextSession
        await sessionStore.persist(nextSession)
    }

    func signupAthlete(_ request: AthleteSignupRequest) async throws {
        let nextSession = try await authService.signupAthlete(request)
        session = nextSession
        await sessionStore.persist(nextSession)
    }

    func logout() async {
        session = nil
        await sessionStore.clear()
    }
}

private extension String {
    func trimmingTrailingSlashes() -> String {
        var value = self
        while value.last == "/" {
            value.removeLast()
        }
        return value
    }
}
