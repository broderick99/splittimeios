import SwiftUI

@main
struct SplitTimeTeamNativeApp: App {
    private let environment: AppEnvironment
    @StateObject private var appModel: AppModel
    @StateObject private var localStore: LocalStore
    @StateObject private var timerRuntimeStore: TimerRuntimeStore

    init() {
        let environment = AppEnvironment.live()
        self.environment = environment
        let localStore = LocalStore(repository: environment.localDataRepository)
        _appModel = StateObject(
            wrappedValue: AppModel(
                authService: environment.authService,
                sessionStore: environment.sessionStore
            )
        )
        _localStore = StateObject(wrappedValue: localStore)
        _timerRuntimeStore = StateObject(
            wrappedValue: TimerRuntimeStore(
                localStore: localStore,
                teamService: environment.teamService
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView(
                appModel: appModel,
                localStore: localStore,
                timerRuntimeStore: timerRuntimeStore,
                environment: environment
            )
        }
    }
}
