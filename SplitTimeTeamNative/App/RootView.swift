import SwiftUI

struct RootView: View {
    @ObservedObject var appModel: AppModel
    @ObservedObject var localStore: LocalStore
    @ObservedObject var timerRuntimeStore: TimerRuntimeStore
    let environment: AppEnvironment
    @State private var isLaunchScreenVisible = true

    var body: some View {
        SwiftUI.Group {
            if appModel.isHydrating || isLaunchScreenVisible {
                SplashScene()
            } else if appModel.needsOnboarding {
                OnboardingScene {
                    appModel.completeOnboarding()
                }
            } else if appModel.session == nil {
                NavigationStack {
                    AuthScene(appModel: appModel)
                }
            } else if let session = appModel.session {
                MainTabContainer(
                    session: session,
                    appModel: appModel,
                    localStore: localStore,
                    timerRuntimeStore: timerRuntimeStore,
                    environment: environment
                )
            }
        }
        .background(AppTheme.Palette.background.ignoresSafeArea())
        .task {
            guard isLaunchScreenVisible else { return }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            isLaunchScreenVisible = false
        }
    }
}

private struct SplashScene: View {
    @State private var logoOpacity = 0.0
    @State private var logoScale = 0.88
    @State private var logoOffsetY: CGFloat = 10

    var body: some View {
        ZStack {
            AppTheme.Palette.elevatedSurface.ignoresSafeArea()

            Group {
                if UIImage(named: "AppLogo") != nil {
                    Image("AppLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 220, height: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                } else {
                    Image(systemName: "figure.run.circle.fill")
                        .font(.system(size: 72))
                        .foregroundStyle(AppTheme.Palette.primary)
                }
            }
            .opacity(logoOpacity)
            .scaleEffect(logoScale)
            .offset(y: logoOffsetY)
            .onAppear {
                withAnimation(.spring(response: 0.72, dampingFraction: 0.84)) {
                    logoOpacity = 1
                    logoScale = 1
                    logoOffsetY = 0
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.72) {
                    withAnimation(.easeInOut(duration: 0.28)) {
                        logoOpacity = 0.82
                        logoScale = 0.985
                    }
                }
            }
        }
    }
}

private struct MainTabContainer: View {
    let session: AuthSession
    @ObservedObject var appModel: AppModel
    @ObservedObject var localStore: LocalStore
    @ObservedObject var timerRuntimeStore: TimerRuntimeStore
    let environment: AppEnvironment
    @State private var didBootstrapCloudSync = false

    var body: some View {
        Group {
            if session.user.role == .coach {
                CoachTabs(
                    session: session,
                    appModel: appModel,
                    localStore: localStore,
                    timerRuntimeStore: timerRuntimeStore,
                    environment: environment
                )
            } else {
                AthleteTabs(
                    session: session,
                    appModel: appModel,
                    localStore: localStore,
                    timerRuntimeStore: timerRuntimeStore,
                    environment: environment
                )
            }
        }
        .task(id: session.token) {
            await bootstrapCloudStateIfNeeded()
        }
        .onChange(of: localStore.athletes) { _, athletes in
            timerRuntimeStore.refreshAthleteMetadata(athletes: athletes, groups: localStore.groups)
        }
        .onChange(of: localStore.groups) { _, groups in
            timerRuntimeStore.refreshAthleteMetadata(athletes: localStore.athletes, groups: groups)
        }
    }

    private func bootstrapCloudStateIfNeeded() async {
        guard !didBootstrapCloudSync else { return }
        didBootstrapCloudSync = true

        do {
            let snapshot = try await environment.teamService.fetchTeamState()
            await localStore.applyRemoteTeamState(snapshot)
        } catch {
            // Keep local state if the network is unavailable.
        }

        do {
            let members = try await environment.rosterService.fetchTeamRoster()
            await localStore.mergeRemoteRosterMembers(members)
        } catch {
            // Keep local roster and retry on a later refresh.
        }

        do {
            let templateSnapshot = try await environment.teamService.fetchTemplateLibrary()
            await localStore.applyRemoteTemplateLibrary(templateSnapshot)
        } catch {
            // Keep local templates and retry on a later refresh.
        }
    }
}

private struct CoachTabs: View {
    private enum Tab: Hashable {
        case timer
        case schedule
        case team
        case workouts
        case you
    }

    let session: AuthSession
    @ObservedObject var appModel: AppModel
    @ObservedObject var localStore: LocalStore
    @ObservedObject var timerRuntimeStore: TimerRuntimeStore
    let environment: AppEnvironment
    @State private var selectedTab: Tab = .team

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                TimerScene(localStore: localStore, timerRuntimeStore: timerRuntimeStore)
            }
            .toolbar(.hidden, for: .navigationBar)
            .tabItem {
                Label("Timer", systemImage: "clock")
            }
            .tag(Tab.timer)

            NavigationStack {
                ScheduleScene(
                    role: session.user.role,
                    scheduleService: environment.scheduleService
                )
            }
            .tabItem {
                Label("Schedule", systemImage: "calendar")
            }
            .tag(Tab.schedule)

            NavigationStack {
                TeamScene(
                    role: session.user.role,
                    currentUserID: session.user.id,
                    currentUserName: session.user.fullName,
                    teamName: session.team?.name,
                    teamJoinCode: session.team?.joinCode,
                    localStore: localStore,
                    environment: environment
                )
            }
            .tabItem {
                Label("Team", systemImage: "person.3")
            }
            .tag(Tab.team)

            NavigationStack {
                WorkoutsScene(
                    localStore: localStore,
                    role: session.user.role,
                    teamService: environment.teamService
                )
            }
            .tabItem {
                Label("Workouts", systemImage: "list.clipboard")
            }
            .tag(Tab.workouts)

            NavigationStack {
                YouScene(session: session, appModel: appModel, localStore: localStore, environment: environment)
            }
            .tabItem {
                Label("You", systemImage: "person")
            }
            .tag(Tab.you)
        }
        .tint(AppTheme.Palette.primary)
    }
}

private struct AthleteTabs: View {
    private enum Tab: Hashable {
        case schedule
        case team
        case you
    }

    let session: AuthSession
    @ObservedObject var appModel: AppModel
    @ObservedObject var localStore: LocalStore
    @ObservedObject var timerRuntimeStore: TimerRuntimeStore
    let environment: AppEnvironment
    @State private var selectedTab: Tab = .team

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                ScheduleScene(
                    role: session.user.role,
                    scheduleService: environment.scheduleService
                )
            }
            .tabItem {
                Label("Schedule", systemImage: "calendar")
            }
            .tag(Tab.schedule)

            NavigationStack {
                TeamScene(
                    role: session.user.role,
                    currentUserID: session.user.id,
                    currentUserName: session.user.fullName,
                    teamName: session.team?.name,
                    teamJoinCode: session.team?.joinCode,
                    localStore: localStore,
                    environment: environment
                )
            }
            .tabItem {
                Label("Team", systemImage: "person.3")
            }
            .tag(Tab.team)

            NavigationStack {
                YouScene(session: session, appModel: appModel, localStore: localStore, environment: environment)
            }
            .tabItem {
                Label("You", systemImage: "person")
            }
            .tag(Tab.you)
        }
        .tint(AppTheme.Palette.primary)
    }
}
