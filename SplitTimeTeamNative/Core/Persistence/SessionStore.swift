import Foundation

actor SessionStore {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let sessionKey = "splitTimeTeam.session"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func loadSession() -> AuthSession? {
        guard let data = defaults.data(forKey: sessionKey) else {
            return nil
        }

        return try? decoder.decode(AuthSession.self, from: data)
    }

    func persist(_ session: AuthSession) {
        guard let data = try? encoder.encode(session) else {
            return
        }

        defaults.set(data, forKey: sessionKey)
    }

    func clear() {
        defaults.removeObject(forKey: sessionKey)
    }
}
