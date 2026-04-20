import Charts
import MapKit
import PhotosUI
import SwiftUI
import UIKit
import WebKit

private enum YouPrimaryTab: String, CaseIterable, Identifiable {
    case overview = "Overview"
    case activities = "Activities"

    var id: String { rawValue }
}

private enum RouteMapProvider {
    case openStreetMap
    case apple
}

private struct WeeklyOverviewPoint: Identifiable {
    let index: Int
    let weekStart: Date
    let weekEnd: Date
    let distanceMiles: Double
    let runCount: Int
    let movingSeconds: Int
    let elevationFeet: Double

    var id: Int { index }
}

@MainActor
private final class YouViewModel: ObservableObject {
    private let pageSize = 10
    private let overviewWindowWeeks = 10
    private let overviewFetchPageSize = 25
    private let overviewFetchPageLimit = 12

    @Published var isLoading = false
    @Published var isSyncing = false
    @Published var isLoadingMore = false
    @Published var canLoadMore = false
    @Published var errorMessage: String?
    @Published var stravaStatus = StravaConnectionStatus(connected: false, athleteName: nil, expiresAt: nil)
    @Published var feed: [ActivityFeedItem] = []
    @Published var overviewFeed: [ActivityFeedItem] = []
    @Published var scope: ActivityFeedScope = .me
    @Published private(set) var viewerOptions: [TeamRosterMember] = []
    @Published var selectedViewerUserID: String?
    @Published var connectURL: URL?
    @Published var showConnectSheet = false
    @Published var lastSyncSummary: String?

    private let activityService: any ActivityServiceProtocol
    private let integrationService: any IntegrationServiceProtocol
    private let rosterService: any RosterServiceProtocol
    private var feedOffset = 0
    private var currentUserID = ""
    private var currentUserName = ""
    private var isCoach = false

    init(
        activityService: any ActivityServiceProtocol,
        integrationService: any IntegrationServiceProtocol,
        rosterService: any RosterServiceProtocol
    ) {
        self.activityService = activityService
        self.integrationService = integrationService
        self.rosterService = rosterService
    }

    var selectedViewerName: String {
        if !isCoach {
            return currentUserName
        }

        if selectedViewerUserID == nil {
            return currentUserName
        }

        if let selectedViewerUserID,
           let viewer = viewerOptions.first(where: { $0.id == selectedViewerUserID }) {
            return viewer.fullName
        }

        return currentUserName
    }

    var selectedViewerMenuName: String {
        if isCoach, selectedViewerUserID == nil {
            return "Me"
        }
        return selectedViewerName
    }

    var selectedViewerInitials: String {
        initials(for: selectedViewerName)
    }

    func configure(for user: AuthUser) async {
        currentUserID = user.id
        currentUserName = user.fullName
        isCoach = user.role == .coach
        scope = isCoach ? .team : .me

        if isCoach {
            await loadViewerOptions()
        } else {
            selectedViewerUserID = user.id
            viewerOptions = []
        }
    }

    func selectViewer(userID: String) {
        guard selectedViewerUserID != userID else { return }
        selectedViewerUserID = userID
    }

    func selectViewerMe() {
        guard selectedViewerUserID != nil else { return }
        selectedViewerUserID = nil
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        var latestError: Error?

        do {
            stravaStatus = try await integrationService.fetchStravaStatus()
        } catch {
            latestError = error
        }

        do {
            let items = try await fetchFeedPage(offset: 0)
            feed = items
            feedOffset = items.count
            canLoadMore = items.count == pageSize
            errorMessage = nil
        } catch {
            latestError = error
        }

        do {
            overviewFeed = try await fetchOverviewWindowFeed()
        } catch {
            latestError = error
        }

        if let latestError {
            handle(latestError)
        }
    }

    func refreshFeedOnly() async {
        do {
            let items = try await fetchFeedPage(offset: 0)
            feed = items
            feedOffset = items.count
            canLoadMore = items.count == pageSize
            errorMessage = nil
        } catch {
            handle(error)
            return
        }

        do {
            overviewFeed = try await fetchOverviewWindowFeed()
        } catch {
            handle(error)
        }
    }

    func refreshActivitiesWithAutoSync() async {
        isLoading = true
        defer { isLoading = false }

        var latestError: Error?

        do {
            let status = try await integrationService.fetchStravaStatus()
            stravaStatus = status

            if status.connected {
                let result = try await integrationService.syncStravaActivities()
                lastSyncSummary = "Imported \(result.imported) new runs."
            }
        } catch {
            latestError = error
        }

        do {
            let items = try await fetchFeedPage(offset: 0)
            feed = items
            feedOffset = items.count
            canLoadMore = items.count == pageSize
            errorMessage = nil
        } catch {
            latestError = error
        }

        do {
            overviewFeed = try await fetchOverviewWindowFeed()
        } catch {
            latestError = error
        }

        if let latestError {
            handle(latestError)
        }
    }

    func startConnect() async {
        do {
            let start = try await integrationService.startStravaConnect()
            connectURL = start.authorizeURL
            showConnectSheet = true
            errorMessage = nil
        } catch {
            handle(error)
        }
    }

    func didCloseConnectSheet() async {
        do {
            stravaStatus = try await integrationService.fetchStravaStatus()
            if stravaStatus.connected {
                let result = try await integrationService.syncStravaActivities()
                lastSyncSummary = "Imported \(result.imported) new runs."
            }
            await refreshFeedOnly()
        } catch {
            handle(error)
        }
    }

    func syncStrava() async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let result = try await integrationService.syncStravaActivities()
            lastSyncSummary = "Imported \(result.imported) new runs."
            await refreshFeedOnly()
        } catch {
            handle(error)
        }
    }

    func disconnectStrava() async {
        do {
            try await integrationService.disconnectStrava()
            stravaStatus = StravaConnectionStatus(connected: false, athleteName: nil, expiresAt: nil)
            lastSyncSummary = nil
            errorMessage = nil
            await refreshFeedOnly()
        } catch {
            handle(error)
        }
    }

    func loadNextPageIfNeeded(currentItemID: String, isSearchActive: Bool) async {
        guard !isSearchActive else { return }
        guard canLoadMore, !isLoadingMore else { return }
        guard feed.last?.id == currentItemID else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let next = try await fetchFeedPage(offset: feedOffset)
            feedOffset += next.count
            canLoadMore = next.count == pageSize
            feed.append(contentsOf: next)
            errorMessage = nil
        } catch {
            handle(error)
        }
    }

    private func handle(_ error: Error) {
        if shouldIgnore(error) {
            errorMessage = nil
            return
        }

        errorMessage = error.localizedDescription
    }

    private func shouldIgnore(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        if let urlError = error as? URLError, urlError.code == .cancelled {
            return true
        }

        if case let APIError.transport(message) = error {
            let normalized = message
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            if normalized == "cancelled" || normalized == "canceled" {
                return true
            }
        }

        return false
    }

    private func loadViewerOptions() async {
        do {
            let roster = try await rosterService.fetchTeamRoster()
            let athletes = roster
                .filter { $0.role == .athlete }
                .sorted { $0.fullName.localizedCaseInsensitiveCompare($1.fullName) == .orderedAscending }

            viewerOptions = athletes

            if let selectedViewerUserID, athletes.contains(where: { $0.id == selectedViewerUserID }) {
                return
            }

            selectedViewerUserID = nil
        } catch {
            handle(error)
        }
    }

    private func fetchFeedPage(offset: Int) async throws -> [ActivityFeedItem] {
        try await fetchFeedPage(offset: offset, limit: pageSize)
    }

    private func fetchFeedPage(offset: Int, limit: Int) async throws -> [ActivityFeedItem] {
        if isCoach {
            if let ownerUserID = selectedViewerUserID, !ownerUserID.isEmpty {
                return try await activityService.fetchFeed(
                    scope: .team,
                    ownerUserID: ownerUserID,
                    limit: limit,
                    offset: offset
                )
            }

            return try await activityService.fetchFeed(
                scope: .me,
                ownerUserID: nil,
                limit: limit,
                offset: offset
            )
        }

        return try await activityService.fetchFeed(
            scope: scope,
            ownerUserID: nil,
            limit: limit,
            offset: offset
        )
    }

    private func fetchOverviewWindowFeed() async throws -> [ActivityFeedItem] {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4

        let now = Date()
        let currentWeek = calendar.dateInterval(of: .weekOfYear, for: now)
            ?? DateInterval(start: calendar.startOfDay(for: now), duration: 7 * 24 * 60 * 60)
        let earliestNeededStart = calendar.date(byAdding: .weekOfYear, value: -(overviewWindowWeeks - 1), to: currentWeek.start)
            ?? currentWeek.start
        let latestNeededEnd = calendar.date(byAdding: .day, value: 7, to: currentWeek.start)
            ?? currentWeek.end

        var allItems: [ActivityFeedItem] = []
        var offset = 0

        for _ in 0..<overviewFetchPageLimit {
            let pageItems = try await fetchFeedPage(offset: offset, limit: overviewFetchPageSize)
            guard !pageItems.isEmpty else { break }

            allItems.append(contentsOf: pageItems)

            if let oldestInPage = pageItems.last?.startAt, oldestInPage < earliestNeededStart {
                break
            }

            if pageItems.count < overviewFetchPageSize {
                break
            }

            offset += pageItems.count
        }

        return allItems
            .filter { $0.startAt >= earliestNeededStart && $0.startAt < latestNeededEnd }
            .sorted(by: { $0.startAt > $1.startAt })
    }
}

@MainActor
private final class ActivityCommentsViewModel: ObservableObject {
    @Published private(set) var comments: [ActivityComment] = []
    @Published var draft = ""
    @Published var isLoading = false
    @Published var isSending = false
    @Published var errorMessage: String?

    private let activityID: String
    private let activityService: any ActivityServiceProtocol

    init(activityID: String, activityService: any ActivityServiceProtocol) {
        self.activityID = activityID
        self.activityService = activityService
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            comments = try await activityService.fetchComments(activityID: activityID)
            errorMessage = nil
        } catch {
            handle(error)
        }
    }

    func send() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }

        isSending = true
        defer { isSending = false }

        do {
            let created = try await activityService.createComment(
                activityID: activityID,
                draft: ActivityCommentDraft(body: body)
            )
            comments.append(created)
            comments.sort { $0.createdAt < $1.createdAt }
            draft = ""
            errorMessage = nil
        } catch {
            handle(error)
        }
    }

    private func handle(_ error: Error) {
        if shouldIgnore(error) {
            errorMessage = nil
            return
        }

        errorMessage = error.localizedDescription
    }

    private func shouldIgnore(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        if let urlError = error as? URLError, urlError.code == .cancelled {
            return true
        }

        if case let APIError.transport(message) = error {
            let normalized = message
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            if normalized == "cancelled" || normalized == "canceled" {
                return true
            }
        }

        return false
    }
}

@MainActor
private final class ActivityMapSnapshotCache {
    static let shared = ActivityMapSnapshotCache()

    private var images: [String: UIImage] = [:]

    private init() {
        images.reserveCapacity(600)
    }

    func image(for key: String) -> UIImage? {
        images[key]
    }

    func set(_ image: UIImage, for key: String) {
        images[key] = image
    }
}

@MainActor
private final class ActivityWorkoutDetailViewModel: ObservableObject {
    @Published private(set) var detail: ActivityWorkoutDetail?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let item: ActivityFeedItem
    private let activityService: any ActivityServiceProtocol

    init(item: ActivityFeedItem, activityService: any ActivityServiceProtocol) {
        self.item = item
        self.activityService = activityService
    }

    func refreshIfNeeded() async {
        guard item.source == .workout else { return }
        guard detail == nil else { return }
        await refresh()
    }

    func refresh() async {
        guard item.source == .workout else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            detail = try await activityService.fetchWorkoutDetail(activityID: item.id)
            errorMessage = nil
        } catch {
            handle(error)
        }
    }

    private func handle(_ error: Error) {
        if shouldIgnore(error) {
            errorMessage = nil
            return
        }

        errorMessage = error.localizedDescription
    }

    private func shouldIgnore(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        if let urlError = error as? URLError, urlError.code == .cancelled {
            return true
        }

        if case let APIError.transport(message) = error {
            let normalized = message
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            if normalized == "cancelled" || normalized == "canceled" {
                return true
            }
        }

        return false
    }
}

struct YouScene: View {
    let session: AuthSession
    @ObservedObject var appModel: AppModel
    @ObservedObject var localStore: LocalStore
    let environment: AppEnvironment
    @StateObject private var viewModel: YouViewModel
    @State private var isLoggingOut = false
    @State private var selectedTab: YouPrimaryTab = .overview
    @State private var activitySearchText = ""
    @State private var isActivitiesListVisible = false
    @State private var hasBootstrapped = false
    @State private var isSettingsPresented = false
    @State private var selectedOverviewWeekIndex = 9
    @State private var selectedProfilePhotoItem: PhotosPickerItem?
    @State private var isSavingProfilePhoto = false
    @State private var profilePhotoErrorMessage: String?
    @State private var isCoachProfileEditPresented = false
    @State private var coachEditingAthleteID: String?
    @State private var coachEditingAthleteName = ""
    @State private var coachEditingAthleteRemoteUserID: String?
    @State private var coachEditingPhotoURL: URL?
    @State private var coachEditingPhotoItem: PhotosPickerItem?
    @State private var coachEditingPhotoData: Data?
    @State private var isSavingCoachProfilePhoto = false

    init(session: AuthSession, appModel: AppModel, localStore: LocalStore, environment: AppEnvironment) {
        self.session = session
        self.appModel = appModel
        self.localStore = localStore
        self.environment = environment
        _viewModel = StateObject(
            wrappedValue: YouViewModel(
                activityService: environment.activityService,
                integrationService: environment.integrationService,
                rosterService: environment.rosterService
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            topNavigationBar
            TopTabBar(
                options: YouPrimaryTab.allCases,
                selection: $selectedTab,
                title: { $0.rawValue }
            )

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if selectedTab == .overview {
                        overviewContent
                    } else {
                        activitiesContent
                    }
                }
                .padding(.top, 14)
                .padding(.bottom, 32)
            }
            .refreshable {
                if selectedTab == .activities {
                    await viewModel.refreshActivitiesWithAutoSync()
                    if viewModel.feed.isEmpty {
                        isActivitiesListVisible = false
                    } else {
                        withAnimation(.easeOut(duration: 0.18)) {
                            isActivitiesListVisible = true
                        }
                    }
                } else {
                    await viewModel.refresh()
                }
            }
        }
        .background(AppTheme.Palette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $isSettingsPresented) {
            settingsScene
        }
        .task {
            guard !hasBootstrapped else { return }
            hasBootstrapped = true
            await viewModel.configure(for: session.user)
            await viewModel.refresh()
            if selectedTab == .activities, !viewModel.feed.isEmpty {
                withAnimation(.easeOut(duration: 0.18)) {
                    isActivitiesListVisible = true
                }
            }
        }
        .onChange(of: viewModel.selectedViewerUserID) { _, _ in
            guard session.user.role == .coach else { return }
            guard hasBootstrapped else { return }
            Task {
                if selectedTab == .activities {
                    isActivitiesListVisible = false
                }
                viewModel.feed = []
                await viewModel.refreshFeedOnly()
                if selectedTab == .activities, !viewModel.feed.isEmpty {
                    withAnimation(.easeOut(duration: 0.18)) {
                        isActivitiesListVisible = true
                    }
                }
            }
        }
        .onChange(of: selectedTab) { _, next in
            guard next == .activities else { return }
            if viewModel.feed.isEmpty {
                isActivitiesListVisible = false
                Task {
                    await viewModel.refreshFeedOnly()
                    if !viewModel.feed.isEmpty {
                        withAnimation(.easeOut(duration: 0.18)) {
                            isActivitiesListVisible = true
                        }
                    }
                }
            } else {
                withAnimation(.easeOut(duration: 0.12)) {
                    isActivitiesListVisible = true
                }
            }
        }
        .onChange(of: viewModel.feed.count) { _, count in
            guard selectedTab == .activities else { return }
            guard count > 0 else { return }
            guard !isActivitiesListVisible else { return }
            withAnimation(.easeOut(duration: 0.18)) {
                isActivitiesListVisible = true
            }
        }
        .onChange(of: selectedProfilePhotoItem) { _, item in
            guard let item else { return }
            Task {
                await updateOwnProfilePhoto(from: item)
                selectedProfilePhotoItem = nil
            }
        }
        .onChange(of: coachEditingPhotoItem) { _, item in
            guard let item else { return }
            Task {
                do {
                    guard let data = try await item.loadTransferable(type: Data.self),
                          let normalized = normalizedProfilePhotoData(from: data) else {
                        throw APIError.decoding("Could not read selected photo.")
                    }
                    coachEditingPhotoData = normalized
                    profilePhotoErrorMessage = nil
                } catch {
                    profilePhotoErrorMessage = error.localizedDescription
                }
                coachEditingPhotoItem = nil
            }
        }
        .sheet(isPresented: $viewModel.showConnectSheet, onDismiss: {
            Task {
                await viewModel.didCloseConnectSheet()
            }
        }) {
            if let url = viewModel.connectURL {
                NavigationStack {
                    EphemeralAuthSheet(
                        url: url,
                        callbackPathFragment: "/integrations/strava/callback"
                    ) {
                        viewModel.showConnectSheet = false
                    }
                        .ignoresSafeArea()
                        .navigationTitle("Connect Strava")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("Done") {
                                    viewModel.showConnectSheet = false
                                }
                            }
                        }
                }
            }
        }
        .sheet(isPresented: $isCoachProfileEditPresented) {
            NavigationStack {
                Form {
                    Section("Athlete") {
                        HStack(spacing: 12) {
                            coachEditingAvatar
                            VStack(alignment: .leading, spacing: 3) {
                                Text(coachEditingAthleteName)
                                    .font(.headline)
                                Text("Profile photo")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }

                    Section("Photo") {
                        PhotosPicker(selection: $coachEditingPhotoItem, matching: .images, photoLibrary: .shared()) {
                            Label("Choose Photo", systemImage: "photo.on.rectangle")
                        }
                        .disabled(isSavingCoachProfilePhoto)
                    }
                }
                .navigationTitle("Edit Athlete")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Cancel") {
                            isCoachProfileEditPresented = false
                            resetCoachProfileEditor()
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Save") {
                            Task {
                                await saveCoachProfilePhotoEdit()
                            }
                        }
                        .fontWeight(.bold)
                        .disabled(isSavingCoachProfilePhoto || coachEditingPhotoData == nil)
                    }
                }
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
    }

    private var topNavigationBar: some View {
        HStack(spacing: 12) {
            if session.user.role == .coach {
                viewerSelectorMenu
            } else {
                Color.clear
                    .frame(width: 34, height: 34)
            }

            Spacer(minLength: 8)

            Text("You")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)

            Spacer(minLength: 8)

            Button {
                isSettingsPresented = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .frame(width: 34, height: 34)
                    .background(
                        Circle()
                            .fill(AppTheme.Palette.surface)
                    )
                    .overlay(
                        Circle()
                            .stroke(AppTheme.Palette.border, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
        .padding(.top, 4)
        .padding(.bottom, 2)
        .background(
            AppTheme.Palette.elevatedSurface
                .ignoresSafeArea(edges: .top)
        )
    }

    private var overviewContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            profileHeaderCard
            profileStatsCard
            weeklyTrendCard

            if let profilePhotoErrorMessage {
                Text(profilePhotoErrorMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Palette.danger)
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
            }

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Palette.danger)
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
            }

        }
    }

    private var activitiesContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(AppTheme.Palette.textSecondary)
                TextField("Search activities", text: $activitySearchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(AppTheme.Palette.elevatedSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
            )
            .padding(.horizontal, AppTheme.Metrics.screenPadding)

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Palette.danger)
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
            }

            feedSection
        }
    }

    private var viewerSelectorMenu: some View {
        Menu {
            Text("Currently viewing \(viewModel.selectedViewerMenuName)")

            Button {
                viewModel.selectViewerMe()
            } label: {
                HStack {
                    Text("Me")
                    if viewModel.selectedViewerUserID == nil {
                        Image(systemName: "checkmark")
                    }
                }
            }

            if !viewModel.viewerOptions.isEmpty {
                Divider()

                Section("Athletes") {
                    ForEach(viewModel.viewerOptions) { member in
                        Button {
                            viewModel.selectViewer(userID: member.id)
                        } label: {
                            HStack {
                                Text(member.fullName)
                                if viewModel.selectedViewerUserID == member.id {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                }
            }
        } label: {
            Circle()
                .fill(AppTheme.Palette.surface)
                .frame(width: 34, height: 34)
                .overlay(
                    Text(viewModel.selectedViewerInitials)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                )
                .overlay(
                    Circle()
                        .stroke(AppTheme.Palette.border, lineWidth: 1)
                )
        }
        .menuStyle(.button)
    }

    private var profileHeaderCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if canShowCoachProfileEditButton {
                HStack {
                    Spacer()
                    Button("Edit") {
                        startCoachProfileEdit()
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.Palette.primary)
                }
            }

            HStack(alignment: .center, spacing: 14) {
                ZStack(alignment: .bottomTrailing) {
                    ProfileHeaderAvatar(name: profileDisplayName, photoURL: profilePhotoURL, size: 72)

                    if canEditOwnProfilePhoto {
                        PhotosPicker(selection: $selectedProfilePhotoItem, matching: .images, photoLibrary: .shared()) {
                            ZStack {
                                Circle()
                                    .fill(AppTheme.Palette.primary)
                                    .frame(width: 26, height: 26)
                                if isSavingProfilePhoto {
                                    ProgressView()
                                        .scaleEffect(0.72)
                                        .tint(.white)
                                } else {
                                    Image(systemName: "camera.fill")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(.white)
                                }
                            }
                            .overlay(
                                Circle()
                                    .stroke(AppTheme.Palette.elevatedSurface, lineWidth: 2)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(isSavingProfilePhoto)
                        .accessibilityLabel("Change profile photo")
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(profileDisplayName)
                        .font(.title3.weight(.semibold))

                    Text(profileSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
                Spacer(minLength: 0)
            }
        }
        .appCard()
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
    }

    private var profileStatsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(selectedOverviewWeekRangeLabel)
                .font(.headline)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                overviewStatCell(label: "Runs", value: "\(selectedOverviewStats.runCount)")
                overviewStatCell(label: "Distance", value: formattedMiles(selectedOverviewStats.distanceMiles))
                overviewStatCell(label: "Time", value: formattedDuration(selectedOverviewStats.movingSeconds))
                overviewStatCell(label: "Elev Gain", value: formattedFeet(selectedOverviewStats.elevationFeet))
            }
        }
        .appCard()
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
    }

    private var weeklyTrendCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Weekly Distance")
                    .font(.headline)
                Spacer()
                Text("Last 10 weeks")
                    .font(.caption)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }

            if overviewWeeklyPoints.allSatisfy({ $0.distanceMiles <= 0.001 }) {
                Text("Complete and sync runs to see your trend.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
            } else {
                Chart(overviewWeeklyPoints) { point in
                    RuleMark(
                        x: .value("Week", point.index)
                    )
                    .foregroundStyle(point.index == clampedSelectedOverviewWeekIndex ? AppTheme.Palette.primary.opacity(0.82) : AppTheme.Palette.border.opacity(0.58))
                    .lineStyle(StrokeStyle(lineWidth: point.index == clampedSelectedOverviewWeekIndex ? 1.35 : 1.0))

                    AreaMark(
                        x: .value("Week", point.index),
                        y: .value("Miles", point.distanceMiles)
                    )
                    .interpolationMethod(.linear)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [
                                AppTheme.Palette.primary.opacity(0.28),
                                AppTheme.Palette.primary.opacity(0.05)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value("Week", point.index),
                        y: .value("Miles", point.distanceMiles)
                    )
                    .interpolationMethod(.linear)
                    .lineStyle(StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
                    .foregroundStyle(AppTheme.Palette.primary)

                    PointMark(
                        x: .value("Week", point.index),
                        y: .value("Miles", point.distanceMiles)
                    )
                    .symbolSize(point.index == clampedSelectedOverviewWeekIndex ? 48 : 24)
                    .foregroundStyle(point.index == clampedSelectedOverviewWeekIndex ? AppTheme.Palette.primary : AppTheme.Palette.primary.opacity(0.9))
                }
                .frame(height: 170)
                .chartOverlay { proxy in
                    GeometryReader { geometry in
                        Rectangle()
                            .fill(.clear)
                            .contentShape(Rectangle())
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { value in
                                        let plotAreaFrame = geometry[proxy.plotAreaFrame]
                                        let relativeX = value.location.x - plotAreaFrame.origin.x

                                        guard relativeX >= 0, relativeX <= plotAreaFrame.width else { return }
                                        guard let rawIndex = proxy.value(atX: relativeX, as: Double.self) else { return }
                                        updateSelectedOverviewWeekIndex(Int(rawIndex.rounded()))
                                    }
                            )
                    }
                }
                .chartXAxis {
                    AxisMarks(values: overviewWeeklyPoints.map(\.index)) { value in
                        AxisTick(stroke: StrokeStyle(lineWidth: 0.6))
                            .foregroundStyle(AppTheme.Palette.border.opacity(0.7))
                        AxisValueLabel {
                            if let index = value.as(Int.self),
                               let monthLabel = monthAxisLabel(for: index) {
                                Text(monthLabel)
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.35))
                            .foregroundStyle(AppTheme.Palette.border.opacity(0.35))
                        AxisValueLabel {
                            if let miles = value.as(Double.self) {
                                Text(formattedMilesAxisLabel(miles))
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                        }
                    }
                }
                .chartYScale(domain: 0...(maxWeeklyDistanceMiles * 1.12))
            }
        }
        .appCard()
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
    }

    private func overviewStatCell(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textSecondary)
            Text(value)
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.Palette.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
    }

    private var settingsScene: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                stravaCard

                if let summary = viewModel.lastSyncSummary {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                        .padding(.horizontal, AppTheme.Metrics.screenPadding)
                }

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                        .padding(.horizontal, AppTheme.Metrics.screenPadding)
                }

                logoutButton
            }
            .padding(.top, 14)
            .padding(.bottom, 32)
        }
        .background(AppTheme.Palette.background.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
    }

    private var profileDisplayName: String {
        if session.user.role == .coach {
            return viewModel.selectedViewerName
        }

        return session.user.fullName
    }

    private var profileInitials: String {
        initials(for: profileDisplayName)
    }

    private var profileSubtitle: String {
        let teamName = (session.team?.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !teamName.isEmpty {
            return teamName
        }
        return "SplitTime Team"
    }

    private var isViewingOwnCoachProfile: Bool {
        session.user.role == .coach && viewModel.selectedViewerUserID == nil
    }

    private var canEditOwnProfilePhoto: Bool {
        session.user.role == .athlete || isViewingOwnCoachProfile
    }

    private var canShowCoachProfileEditButton: Bool {
        session.user.role == .coach && profileAthlete != nil
    }

    private var coachEditingAvatar: some View {
        Group {
            if let data = coachEditingPhotoData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 52, height: 52)
                    .clipShape(Circle())
                    .overlay(
                        Circle()
                            .stroke(AppTheme.Palette.border, lineWidth: 1)
                    )
            } else {
                ProfileHeaderAvatar(name: coachEditingAthleteName, photoURL: coachEditingPhotoURL, size: 52)
            }
        }
    }

    private var profilePhotoURL: URL? {
        if let photoURL = profileAthlete?.photoURL {
            return photoURL
        }

        if isViewingOwnCoachProfile {
            return persistedProfilePhotoURL(for: session.user.id)
        }

        return nil
    }

    private var profileAthlete: Athlete? {
        switch session.user.role {
        case .coach:
            guard let viewerUserID = viewModel.selectedViewerUserID else {
                return localStore.athletes.first(where: { $0.remoteUserID == session.user.id })
            }
            return localStore.athletes.first(where: { $0.remoteUserID == viewerUserID })
        case .athlete:
            return localStore.athletes.first(where: { $0.remoteUserID == session.user.id })
        }
    }

    private var overviewWeeklyPoints: [WeeklyOverviewPoint] {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4

        let now = Date()
        let currentWeek = calendar.dateInterval(of: .weekOfYear, for: now)
            ?? DateInterval(start: calendar.startOfDay(for: now), duration: 7 * 24 * 60 * 60)

        return (0..<10).map { step in
            let weeksBack = 9 - step
            let weekStart = calendar.date(byAdding: .weekOfYear, value: -weeksBack, to: currentWeek.start) ?? currentWeek.start
            let weekEnd = calendar.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart.addingTimeInterval(7 * 24 * 60 * 60)

            let weekItems = viewModel.overviewFeed.filter {
                $0.startAt >= weekStart && $0.startAt < weekEnd
            }

            let distanceMeters = weekItems.reduce(0.0) { partial, item in
                partial + (item.distanceMeters ?? 0)
            }
            let movingSeconds = weekItems.reduce(0) { partial, item in
                partial + (item.movingSeconds ?? item.elapsedSeconds ?? 0)
            }
            let elevationMeters = weekItems.reduce(0.0) { partial, item in
                partial + (item.elevationGainMeters ?? 0)
            }

            return WeeklyOverviewPoint(
                index: step,
                weekStart: weekStart,
                weekEnd: weekEnd,
                distanceMiles: distanceMeters / 1609.344,
                runCount: weekItems.count,
                movingSeconds: movingSeconds,
                elevationFeet: elevationMeters * 3.28084
            )
        }
    }

    private var maxWeeklyDistanceMiles: Double {
        max(1.0, overviewWeeklyPoints.map(\.distanceMiles).max() ?? 1.0)
    }

    private var clampedSelectedOverviewWeekIndex: Int {
        min(max(selectedOverviewWeekIndex, 0), max(0, overviewWeeklyPoints.count - 1))
    }

    private var selectedOverviewPoint: WeeklyOverviewPoint? {
        guard !overviewWeeklyPoints.isEmpty else { return nil }
        return overviewWeeklyPoints[clampedSelectedOverviewWeekIndex]
    }

    private var selectedOverviewStats: (runCount: Int, distanceMiles: Double, movingSeconds: Int, elevationFeet: Double) {
        guard let point = selectedOverviewPoint else {
            return (runCount: 0, distanceMiles: 0, movingSeconds: 0, elevationFeet: 0)
        }
        return (
            runCount: point.runCount,
            distanceMiles: point.distanceMiles,
            movingSeconds: point.movingSeconds,
            elevationFeet: point.elevationFeet
        )
    }

    private var selectedOverviewWeekRangeLabel: String {
        guard let point = selectedOverviewPoint else { return overviewWeekRangeLabel }
        return formattedWeekRange(DateInterval(start: point.weekStart, end: point.weekEnd))
    }

    private func monthAxisLabel(for index: Int) -> String? {
        guard overviewWeeklyPoints.indices.contains(index) else { return nil }

        let calendar = Calendar.current
        let month = calendar.component(.month, from: overviewWeeklyPoints[index].weekStart)

        if index == 0 {
            return overviewWeeklyPoints[index].weekStart.formatted(.dateTime.month(.abbreviated))
        }

        let previousMonth = calendar.component(.month, from: overviewWeeklyPoints[index - 1].weekStart)
        guard month != previousMonth else { return nil }

        return overviewWeeklyPoints[index].weekStart.formatted(.dateTime.month(.abbreviated))
    }

    private func formattedMilesAxisLabel(_ miles: Double) -> String {
        if abs(miles.rounded() - miles) < 0.001 {
            return "\(Int(miles.rounded())) mi"
        }
        return "\(String(format: "%.1f", miles)) mi"
    }

    private func formattedMiles(_ miles: Double) -> String {
        if miles <= 0.0001 {
            return "--"
        }
        return String(format: "%.2f mi", miles)
    }

    private func formattedFeet(_ feet: Double) -> String {
        if feet <= 0.0001 {
            return "--"
        }
        return "\(Int(feet.rounded())) ft"
    }

    private func updateSelectedOverviewWeekIndex(_ index: Int) {
        guard !overviewWeeklyPoints.isEmpty else { return }
        selectedOverviewWeekIndex = min(max(index, 0), overviewWeeklyPoints.count - 1)
    }

    private var overviewWeekInterval: DateInterval {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4

        if let interval = calendar.dateInterval(of: .weekOfYear, for: Date()) {
            return interval
        }

        let start = calendar.startOfDay(for: Date())
        return DateInterval(start: start, duration: 7 * 24 * 60 * 60)
    }

    private var overviewWeekRangeLabel: String {
        formattedWeekRange(overviewWeekInterval)
    }

    private func updateOwnProfilePhoto(from item: PhotosPickerItem) async {
        guard canEditOwnProfilePhoto else { return }
        guard !isSavingProfilePhoto else { return }
        isSavingProfilePhoto = true
        defer { isSavingProfilePhoto = false }

        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let photoData = normalizedProfilePhotoData(from: data) else {
                throw APIError.decoding("Could not read selected photo.")
            }

            let fileURL = try persistProfilePhoto(photoData, remoteUserID: session.user.id)
            if session.user.role == .athlete {
                let athlete = try await ensureSelfAthleteProfileExists()
                await localStore.updateAthlete(athleteID: athlete.id, photoURL: fileURL)
            } else if let athlete = localStore.athletes.first(where: { $0.remoteUserID == session.user.id }) {
                await localStore.updateAthlete(athleteID: athlete.id, photoURL: fileURL)
            }
            profilePhotoErrorMessage = nil
        } catch {
            profilePhotoErrorMessage = error.localizedDescription
        }
    }

    private func startCoachProfileEdit() {
        guard session.user.role == .coach else { return }
        guard let athlete = profileAthlete else {
            profilePhotoErrorMessage = "Select an athlete first to edit their photo."
            return
        }

        coachEditingAthleteID = athlete.id
        coachEditingAthleteName = athlete.name
        coachEditingAthleteRemoteUserID = athlete.remoteUserID
        coachEditingPhotoURL = athlete.photoURL
        coachEditingPhotoData = nil
        coachEditingPhotoItem = nil
        profilePhotoErrorMessage = nil
        isCoachProfileEditPresented = true
    }

    private func resetCoachProfileEditor() {
        coachEditingAthleteID = nil
        coachEditingAthleteName = ""
        coachEditingAthleteRemoteUserID = nil
        coachEditingPhotoURL = nil
        coachEditingPhotoData = nil
        coachEditingPhotoItem = nil
        isSavingCoachProfilePhoto = false
    }

    private func saveCoachProfilePhotoEdit() async {
        guard let athleteID = coachEditingAthleteID else { return }
        guard let photoData = coachEditingPhotoData else {
            isCoachProfileEditPresented = false
            resetCoachProfileEditor()
            return
        }

        isSavingCoachProfilePhoto = true
        defer { isSavingCoachProfilePhoto = false }

        do {
            let identifier = coachEditingAthleteRemoteUserID ?? athleteID
            let fileURL = try persistProfilePhoto(photoData, remoteUserID: identifier)
            await localStore.updateAthlete(athleteID: athleteID, photoURL: fileURL)
            profilePhotoErrorMessage = nil
            isCoachProfileEditPresented = false
            resetCoachProfileEditor()
        } catch {
            profilePhotoErrorMessage = error.localizedDescription
        }
    }

    private func ensureSelfAthleteProfileExists() async throws -> Athlete {
        if let existing = localStore.athletes.first(where: { $0.remoteUserID == session.user.id }) {
            return existing
        }

        return await localStore.addAthlete(
            name: session.user.fullName,
            remoteUserID: session.user.id,
            firstName: session.user.firstName,
            lastName: session.user.lastName,
            email: session.user.email,
            phone: session.user.phone,
            age: session.user.age,
            grade: session.user.grade,
            photoURL: nil
        )
    }

    private func persistProfilePhoto(_ photoData: Data, remoteUserID: String) throws -> URL {
        let fileManager = FileManager.default
        let fileURL = profilePhotoFileURL(for: remoteUserID)
        let directory = fileURL.deletingLastPathComponent()

        if !fileManager.fileExists(atPath: directory.path) {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        }

        try photoData.write(to: fileURL, options: [.atomic])
        return fileURL
    }

    private func persistedProfilePhotoURL(for remoteUserID: String) -> URL? {
        let fileURL = profilePhotoFileURL(for: remoteUserID)
        return FileManager.default.fileExists(atPath: fileURL.path) ? fileURL : nil
    }

    private func profilePhotoFileURL(for remoteUserID: String) -> URL {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = appSupport
            .appendingPathComponent("SplitTimeTeamNative", isDirectory: true)
            .appendingPathComponent("profile-photos", isDirectory: true)

        let safeIdentifier = remoteUserID
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "/", with: "_")
        return directory.appendingPathComponent("\(safeIdentifier).jpg")
    }

    private func normalizedProfilePhotoData(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }

        let maxDimension: CGFloat = 900
        let originalSize = image.size
        guard originalSize.width > 0, originalSize.height > 0 else { return nil }

        let largestSide = max(originalSize.width, originalSize.height)
        let scale = min(1, maxDimension / largestSide)
        let targetSize = CGSize(
            width: max(1, floor(originalSize.width * scale)),
            height: max(1, floor(originalSize.height * scale))
        )

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }

        return resized.jpegData(compressionQuality: 0.82)
    }

    private var stravaCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Strava", systemImage: "figure.run")
                    .font(.headline)
                Spacer()
                if viewModel.stravaStatus.connected {
                    Text("Connected")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.green)
                } else {
                    Text("Not connected")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
            }

            if let athleteName = viewModel.stravaStatus.athleteName, !athleteName.isEmpty {
                Text(athleteName)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }

            HStack(spacing: 10) {
                Button {
                    Task {
                        if viewModel.stravaStatus.connected {
                            await viewModel.syncStrava()
                        } else {
                            await viewModel.startConnect()
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        if viewModel.isSyncing {
                            ProgressView()
                                .progressViewStyle(.circular)
                        }
                        Text(viewModel.stravaStatus.connected ? "Sync Runs" : "Connect Strava")
                            .font(.subheadline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSyncing)

                if viewModel.stravaStatus.connected {
                    Button("Disconnect", role: .destructive) {
                        Task {
                            await viewModel.disconnectStrava()
                        }
                    }
                    .buttonStyle(.bordered)
                }
            }

            if !viewModel.stravaStatus.connected {
                Text("Connect once, then pull-to-refresh or tap Sync Runs to import your GPS activities.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }
        }
        .appCard()
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
    }

    private var feedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Activity")
                .font(.headline)
                .padding(.horizontal, AppTheme.Metrics.screenPadding)

            if viewModel.isLoading && viewModel.feed.isEmpty {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: 280)
            } else if filteredFeed.isEmpty {
                ContentUnavailableView(
                    "No Activity Yet",
                    systemImage: "figure.run",
                    description: Text(activitySearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Connect Strava and sync to populate your feed." : "No activities match your search.")
                )
                .frame(maxWidth: .infinity)
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(filteredFeed) { item in
                        NavigationLink {
                            ActivityDetailScene(
                                item: item,
                                activityService: environment.activityService,
                                mapProvider: .apple
                            )
                        } label: {
                            ActivityFeedCard(
                                item: item,
                                showOwner: session.user.role == .coach && viewModel.selectedViewerUserID == nil,
                                mapProvider: .apple
                            )
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, AppTheme.Metrics.screenPadding)
                        .onAppear {
                            Task {
                                await viewModel.loadNextPageIfNeeded(
                                    currentItemID: item.id,
                                    isSearchActive: !activitySearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                )
                            }
                        }
                    }

                    if viewModel.isLoadingMore {
                        HStack {
                            Spacer()
                            ProgressView()
                                .padding(.vertical, 8)
                            Spacer()
                        }
                    }
                }
                .opacity(isActivitiesListVisible ? 1 : 0)
            }
        }
    }

    private var filteredFeed: [ActivityFeedItem] {
        let query = activitySearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return viewModel.feed }

        return viewModel.feed.filter { item in
            item.title.localizedCaseInsensitiveContains(query)
                || item.ownerName.localizedCaseInsensitiveContains(query)
                || item.activityType.localizedCaseInsensitiveContains(query)
        }
    }

    private var logoutButton: some View {
        Button(role: .destructive) {
            isLoggingOut = true
            Task {
                await appModel.logout()
                isLoggingOut = false
            }
        } label: {
            HStack {
                Spacer()
                if isLoggingOut {
                    ProgressView()
                } else {
                    Text("Log Out")
                }
                Spacer()
            }
        }
        .buttonStyle(.bordered)
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
        .padding(.top, 8)
    }
}

private struct ProfileHeaderAvatar: View {
    let name: String
    let photoURL: URL?
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(AppTheme.Palette.surface)

            if let photoURL {
                AsyncImage(url: photoURL) { phase in
                    switch phase {
                    case let .success(image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        initialsView
                    }
                }
            } else {
                initialsView
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(
            Circle()
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
    }

    private var initialsView: some View {
        Text(initials(for: name))
            .font(.system(size: max(14, size * 0.33), weight: .bold))
            .foregroundStyle(AppTheme.Palette.textSecondary)
    }
}

private struct ActivityDetailScene: View {
    let item: ActivityFeedItem
    let activityService: any ActivityServiceProtocol
    let mapProvider: RouteMapProvider
    @StateObject private var workoutDetailViewModel: ActivityWorkoutDetailViewModel

    init(item: ActivityFeedItem, activityService: any ActivityServiceProtocol, mapProvider: RouteMapProvider) {
        self.item = item
        self.activityService = activityService
        self.mapProvider = mapProvider
        _workoutDetailViewModel = StateObject(
            wrappedValue: ActivityWorkoutDetailViewModel(item: item, activityService: activityService)
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if item.source == .workout {
                    workoutSplitsCard
                } else {
                    NavigationLink {
                        ActivityRouteMapScene(item: item, mapProvider: mapProvider)
                    } label: {
                        ActivityMapPreview(
                            cacheKeyBase: "detail-\(item.id)",
                            polyline: item.polyline ?? "",
                            mapProvider: mapProvider
                        )
                            .frame(height: 210)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(alignment: .topTrailing) {
                                Image(systemName: "arrow.up.left.and.arrow.down.right")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .padding(8)
                                    .background(Color.black.opacity(0.45), in: Circle())
                                    .padding(10)
                            }
                    }
                    .buttonStyle(.plain)
                }

                activitySummaryCard

                NavigationLink {
                    ActivityDiscussionScene(item: item, activityService: activityService)
                } label: {
                    HStack {
                        Label("Discussion", systemImage: "bubble.right")
                            .font(.headline)
                        Spacer()
                        Text("\(item.commentCount)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(AppTheme.Palette.elevatedSurface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(AppTheme.Palette.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(AppTheme.Metrics.screenPadding)
        }
        .background(AppTheme.Palette.background)
        .navigationTitle(item.source == .workout ? "Workout" : "Run")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: item.id) {
            await workoutDetailViewModel.refreshIfNeeded()
        }
    }

    private var activitySummaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(item.title)
                .font(.title3.weight(.semibold))

            Text("\(item.ownerName) • \(relativeDate(item.startAt))")
                .font(.subheadline)
                .foregroundStyle(AppTheme.Palette.textSecondary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ActivityStatCell(label: "Distance", value: formattedDistance(item.distanceMeters))
                ActivityStatCell(label: "Avg Pace", value: formattedPace(distanceMeters: item.distanceMeters, movingSeconds: item.movingSeconds))
                ActivityStatCell(label: "Moving Time", value: formattedDuration(item.movingSeconds ?? item.elapsedSeconds))
                ActivityStatCell(label: "Type", value: item.activityType.isEmpty ? "--" : item.activityType.capitalized)
            }
        }
        .appCard()
    }

    private var workoutSplitsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Workout Splits")
                .font(.headline)

            if workoutDetailViewModel.isLoading, workoutDetailViewModel.detail == nil {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Loading split data...")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
                .padding(.vertical, 6)
            } else if let errorMessage = workoutDetailViewModel.errorMessage,
                      workoutDetailViewModel.detail == nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                    Button("Try Again") {
                        Task {
                            await workoutDetailViewModel.refresh()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else if let detail = workoutDetailViewModel.detail {
                Text("\(detail.athleteName) • \(detail.splits.count) splits")
                    .font(.caption)
                    .foregroundStyle(AppTheme.Palette.textSecondary)

                ActivityWorkoutSplitsTable(detail: detail)
            } else {
                Text("No split data found for this workout yet.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }
        }
        .appCard()
    }
}

private struct ActivityDiscussionScene: View {
    let item: ActivityFeedItem
    let activityService: any ActivityServiceProtocol
    @StateObject private var viewModel: ActivityCommentsViewModel

    init(item: ActivityFeedItem, activityService: any ActivityServiceProtocol) {
        self.item = item
        self.activityService = activityService
        _viewModel = StateObject(
            wrappedValue: ActivityCommentsViewModel(activityID: item.id, activityService: activityService)
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(AppTheme.Palette.surface)
                        .frame(width: 40, height: 40)
                        .overlay(
                            Text(initials(for: item.ownerName))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(AppTheme.Palette.textSecondary)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.ownerName)
                            .font(.subheadline.weight(.semibold))
                        Text("\(relativeDate(item.startAt)) • \(formattedDistance(item.distanceMeters))")
                            .font(.caption)
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    }
                }

                Text(item.title)
                    .font(.title3.weight(.semibold))
                    .padding(.top, 2)

                Divider()
                    .padding(.vertical, 4)

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                }

                VStack(spacing: 0) {
                    ForEach(Array(viewModel.comments.enumerated()), id: \.element.id) { index, comment in
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(AppTheme.Palette.surface)
                                .frame(width: 38, height: 38)
                                .overlay(
                                    Text(initials(for: comment.authorName))
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(AppTheme.Palette.textSecondary)
                                )
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 5) {
                                    Text(comment.authorName)
                                        .font(.subheadline.weight(.semibold))
                                    Text("•")
                                        .foregroundStyle(AppTheme.Palette.textSecondary)
                                    Text(relativeDate(comment.createdAt))
                                        .font(.caption2)
                                        .foregroundStyle(AppTheme.Palette.textSecondary)
                                }
                                Text(comment.body)
                                    .font(.callout)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 9)

                        if index < viewModel.comments.count - 1 {
                            Divider()
                                .padding(.leading, 48)
                        }
                    }
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
            .padding(.bottom, 90)
        }
        .background(AppTheme.Palette.background)
        .navigationTitle("Discussion")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            commentComposer
        }
        .task {
            await viewModel.refresh()
        }
        .refreshable {
            await viewModel.refresh()
        }
    }

    private var commentComposer: some View {
        HStack(spacing: 8) {
            TextField("Add a comment", text: $viewModel.draft, axis: .vertical)
                .font(.system(size: 16))
                .textInputAutocapitalization(.sentences)
                .lineLimit(1...4)
                .submitLabel(.send)
                .onSubmit {
                    Task {
                        await viewModel.send()
                    }
                }

            Button {
                Task {
                    await viewModel.send()
                }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(
                        viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? AppTheme.Palette.textSecondary.opacity(0.5)
                        : AppTheme.Palette.primary
                    )
            }
            .buttonStyle(.plain)
            .disabled(viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
        }
        .padding(.leading, 12)
        .padding(.trailing, 8)
        .frame(height: 38)
        .background(
            Capsule(style: .continuous)
                .fill(AppTheme.Palette.elevatedSurface)
        )
        .overlay(
            Capsule(style: .continuous)
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 6)
    }
}

private struct ActivityFeedCard: View {
    let item: ActivityFeedItem
    let showOwner: Bool
    let mapProvider: RouteMapProvider

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                if showOwner {
                    Circle()
                        .fill(AppTheme.Palette.surface)
                        .frame(width: 34, height: 34)
                        .overlay(
                            Text(initials(for: item.ownerName))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(AppTheme.Palette.textSecondary)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.ownerName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textPrimary)
                        Text(relativeDate(item.startAt))
                            .font(.caption)
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    }
                } else {
                    Text(relativeDate(item.startAt))
                        .font(.caption)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }

                Spacer()

                Text(item.activityType.capitalized)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }

            Text(item.title)
                .font(.headline)
                .foregroundStyle(AppTheme.Palette.textPrimary)

            HStack(spacing: 18) {
                metricBlock(title: "Distance", value: formattedDistance(item.distanceMeters))
                metricBlock(title: "Pace", value: formattedPace(distanceMeters: item.distanceMeters, movingSeconds: item.movingSeconds))
                metricBlock(title: "Time", value: formattedDuration(item.movingSeconds ?? item.elapsedSeconds))
            }

            if let polyline = item.polyline, !polyline.isEmpty {
                ActivityMapPreview(
                    cacheKeyBase: "feed-\(item.id)",
                    polyline: polyline,
                    mapProvider: mapProvider
                )
                    .frame(height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            Label("\(item.commentCount)", systemImage: "bubble.right")
                .font(.caption)
                .foregroundStyle(AppTheme.Palette.textSecondary)
        }
        .appCard()
    }

    @ViewBuilder
    private func metricBlock(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(AppTheme.Palette.textSecondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)
        }
    }
}

private struct ActivityWorkoutSplitsTable: View {
    let detail: ActivityWorkoutDetail

    var body: some View {
        VStack(spacing: 0) {
            headerRow
            Divider()
                .background(AppTheme.Palette.border)

            ForEach(Array(detail.splits.enumerated()), id: \.element.id) { index, split in
                row(for: split)
                if index < detail.splits.count - 1 {
                    Divider()
                        .background(AppTheme.Palette.border)
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(AppTheme.Palette.elevatedSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.Palette.border, lineWidth: 1)
        )
    }

    private var headerRow: some View {
        HStack(spacing: 8) {
            Text("Step")
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Split")
                .frame(width: 78, alignment: .trailing)
            Text("Lap")
                .frame(width: 78, alignment: .trailing)
            Text("Pace")
                .frame(width: 86, alignment: .trailing)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(AppTheme.Palette.textSecondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func row(for split: ActivityWorkoutSplit) -> some View {
        HStack(spacing: 8) {
            Text(stepTitle(for: split))
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
                .foregroundStyle(split.stepType == .recovery ? Color.orange : AppTheme.Palette.textPrimary)
            Text(formattedSplitMilliseconds(split.elapsedMilliseconds))
                .frame(width: 78, alignment: .trailing)
            Text(formattedSplitMilliseconds(split.lapMilliseconds))
                .frame(width: 78, alignment: .trailing)
            Text(formattedLapPace(split))
                .frame(width: 86, alignment: .trailing)
                .foregroundStyle(split.stepType == .recovery ? Color.orange : AppTheme.Palette.textPrimary)
        }
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .monospacedDigit()
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
    }

    private func stepTitle(for split: ActivityWorkoutSplit) -> String {
        let normalizedLabel = split.stepLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if split.isFinal {
            return normalizedLabel.isEmpty ? "Finish" : normalizedLabel
        }

        if !normalizedLabel.isEmpty {
            return normalizedLabel
        }

        if let distanceValue = split.stepDistanceValue,
           let unit = split.stepDistanceUnit {
            return formattedStepDistance(value: distanceValue, unit: unit)
        }

        if split.stepType == .recovery {
            return "Recovery"
        }

        return "Split \(split.splitNumber)"
    }

    private func formattedStepDistance(value: Double, unit: DistanceUnit) -> String {
        let rounded = value.rounded()
        let stringValue: String
        if abs(value - rounded) < 0.0001 {
            stringValue = String(Int(rounded))
        } else {
            stringValue = String(format: "%.1f", value)
        }

        switch unit {
        case .meters:
            return "\(stringValue)m"
        case .kilometers:
            return "\(stringValue)km"
        case .miles:
            return "\(stringValue)mi"
        }
    }

    private func formattedLapPace(_ split: ActivityWorkoutSplit) -> String {
        if split.stepType == .recovery {
            return "--"
        }

        guard let distanceValue = split.stepDistanceValue,
              let unit = split.stepDistanceUnit,
              distanceValue > 0,
              split.lapMilliseconds > 0 else {
            return "--"
        }

        let meters: Double
        switch unit {
        case .meters:
            meters = distanceValue
        case .kilometers:
            meters = distanceValue * 1_000
        case .miles:
            meters = distanceValue * 1_609.344
        }

        guard meters > 0 else { return "--" }
        let lapSeconds = Double(split.lapMilliseconds) / 1_000
        let secondsPerMile = lapSeconds / (meters / 1_609.344)
        let roundedTotalSeconds = Int(secondsPerMile.rounded())
        let minutes = roundedTotalSeconds / 60
        let seconds = roundedTotalSeconds % 60
        return String(format: "%d:%02d/mi", minutes, seconds)
    }
}

private struct ActivityMapPreview: View {
    let cacheKeyBase: String
    let polyline: String
    let mapProvider: RouteMapProvider
    @State private var snapshotImage: UIImage?
    @State private var isGeneratingSnapshot = false
    @State private var loadedSnapshotKey: String?
    @Environment(\.displayScale) private var displayScale

    private var coordinates: [CLLocationCoordinate2D] {
        decodePolyline(polyline)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                if let snapshotImage {
                    Image(uiImage: snapshotImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .clipped()
                } else {
                    Rectangle()
                        .fill(AppTheme.Palette.surface)
                }
            }
            .task(id: snapshotCacheKey(for: proxy.size)) {
                await ensureSnapshotLoaded(for: proxy.size)
            }
        }
    }

    private func snapshotCacheKey(for size: CGSize) -> String {
        let width = quantizedDimension(size.width)
        let height = quantizedDimension(size.height)
        return "\(cacheKeyBase)-\(mapProviderCacheKey)-\(width)x\(height)-\(polylineHash)"
    }

    private var mapProviderCacheKey: String {
        switch mapProvider {
        case .apple:
            return "apple"
        case .openStreetMap:
            return "osm"
        }
    }

    private var polylineHash: Int {
        polyline.hashValue
    }

    private func quantizedDimension(_ value: CGFloat) -> Int {
        let bucket: CGFloat = 24
        let quantized = (value / bucket).rounded() * bucket
        return max(72, Int(quantized))
    }

    @MainActor
    private func ensureSnapshotLoaded(for size: CGSize) async {
        guard size.width > 0, size.height > 0 else { return }

        let key = snapshotCacheKey(for: size)
        if loadedSnapshotKey == key, snapshotImage != nil {
            return
        }

        if let cached = ActivityMapSnapshotCache.shared.image(for: key) {
            snapshotImage = cached
            loadedSnapshotKey = key
            return
        }

        guard !isGeneratingSnapshot else { return }
        isGeneratingSnapshot = true
        defer { isGeneratingSnapshot = false }

        guard let image = await generateSnapshot(size: size, coordinates: coordinates) else { return }
        ActivityMapSnapshotCache.shared.set(image, for: key)
        snapshotImage = image
        loadedSnapshotKey = key
    }

    private func generateSnapshot(size: CGSize, coordinates: [CLLocationCoordinate2D]) async -> UIImage? {
        let options = MKMapSnapshotter.Options()
        options.size = size
        options.scale = displayScale
        options.mapType = .standard
        options.showsBuildings = false
        options.pointOfInterestFilter = .excludingAll

        if coordinates.count >= 2 {
            options.region = mapRegion(for: coordinates)
        } else if let first = coordinates.first {
            options.region = MKCoordinateRegion(
                center: first,
                span: MKCoordinateSpan(latitudeDelta: 0.008, longitudeDelta: 0.008)
            )
        } else {
            options.region = MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 21.4819, longitude: -157.9624),
                span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
            )
        }

        let snapshotter = MKMapSnapshotter(options: options)

        do {
            let snapshot = try await snapshotter.start()
            return drawRoute(on: snapshot, coordinates: coordinates)
        } catch {
            return nil
        }
    }

    private func drawRoute(on snapshot: MKMapSnapshotter.Snapshot, coordinates: [CLLocationCoordinate2D]) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = displayScale
        let renderer = UIGraphicsImageRenderer(size: snapshot.image.size, format: format)

        return renderer.image { _ in
            snapshot.image.draw(at: .zero)
            guard coordinates.count >= 2 else { return }

            let routePath = UIBezierPath()
            routePath.lineWidth = 4
            routePath.lineCapStyle = .round
            routePath.lineJoinStyle = .round
            UIColor.systemBlue.setStroke()

            for (index, coordinate) in coordinates.enumerated() {
                let point = snapshot.point(for: coordinate)
                if index == 0 {
                    routePath.move(to: point)
                } else {
                    routePath.addLine(to: point)
                }
            }

            routePath.stroke()
        }
    }
}

private struct ActivityRouteMapScene: View {
    let item: ActivityFeedItem
    let mapProvider: RouteMapProvider
    @Environment(\.openURL) private var openURL

    private var coordinates: [CLLocationCoordinate2D] {
        decodePolyline(item.polyline ?? "")
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            RouteMapSurface(
                coordinates: coordinates,
                mapProvider: mapProvider,
                interactive: true
            )
            .ignoresSafeArea(edges: .bottom)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.headline)
                Text("\(item.ownerName) • \(relativeDate(item.startAt))")
                    .font(.caption)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
        .navigationTitle("Route")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Google") {
                    guard let url = googleMapsURL(for: coordinates) else { return }
                    openURL(url)
                }
                .disabled(googleMapsURL(for: coordinates) == nil)
            }
        }
    }
}

private struct ActivityStatCell: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption)
                .foregroundStyle(AppTheme.Palette.textSecondary)
            Text(value)
                .font(.headline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.Palette.surface)
        )
    }
}

private struct RouteMapSurface: UIViewRepresentable {
    let coordinates: [CLLocationCoordinate2D]
    let mapProvider: RouteMapProvider
    let interactive: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView(frame: .zero)
        mapView.delegate = context.coordinator
        mapView.pointOfInterestFilter = .excludingAll
        mapView.showsCompass = interactive
        mapView.showsScale = interactive
        mapView.mapType = .standard
        configureInteraction(for: mapView)
        context.coordinator.render(on: mapView, with: coordinates, mapProvider: mapProvider, interactive: interactive)
        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        configureInteraction(for: mapView)
        context.coordinator.render(on: mapView, with: coordinates, mapProvider: mapProvider, interactive: interactive)
    }

    private func configureInteraction(for mapView: MKMapView) {
        mapView.isScrollEnabled = interactive
        mapView.isZoomEnabled = interactive
        mapView.isRotateEnabled = interactive
        mapView.isPitchEnabled = interactive
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        func render(
            on mapView: MKMapView,
            with coordinates: [CLLocationCoordinate2D],
            mapProvider: RouteMapProvider,
            interactive: Bool
        ) {
            mapView.removeOverlays(mapView.overlays)

            if mapProvider == .openStreetMap {
                let tile = MKTileOverlay(urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
                tile.canReplaceMapContent = true
                tile.minimumZ = 0
                tile.maximumZ = 19
                mapView.addOverlay(tile, level: .aboveLabels)
            }

            guard !coordinates.isEmpty else {
                mapView.setRegion(
                    MKCoordinateRegion(
                        center: CLLocationCoordinate2D(latitude: 21.4819, longitude: -157.9624),
                        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
                    ),
                    animated: false
                )
                return
            }

            if coordinates.count == 1 {
                mapView.setRegion(
                    MKCoordinateRegion(
                        center: coordinates[0],
                        span: MKCoordinateSpan(latitudeDelta: 0.006, longitudeDelta: 0.006)
                    ),
                    animated: false
                )
                return
            }

            let polyline = MKPolyline(coordinates: coordinates, count: coordinates.count)
            mapView.addOverlay(polyline, level: .aboveLabels)
            let edgePadding = UIEdgeInsets(
                top: interactive ? 28 : 18,
                left: interactive ? 18 : 14,
                bottom: interactive ? 42 : 18,
                right: interactive ? 18 : 14
            )
            let fitted = mapView.mapRectThatFits(polyline.boundingMapRect, edgePadding: edgePadding)
            mapView.setVisibleMapRect(fitted, animated: false)
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let tileOverlay = overlay as? MKTileOverlay {
                return MKTileOverlayRenderer(tileOverlay: tileOverlay)
            }

            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = UIColor.systemBlue
                renderer.lineWidth = 4
                renderer.lineCap = .round
                renderer.lineJoin = .round
                return renderer
            }

            return MKOverlayRenderer(overlay: overlay)
        }
    }
}

private struct EphemeralAuthSheet: UIViewRepresentable {
    let url: URL
    let callbackPathFragment: String
    let onCallback: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(callbackPathFragment: callbackPathFragment, onCallback: onCallback)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.load(
            URLRequest(
                url: url,
                cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
                timeoutInterval: 60
            )
        )
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url == nil {
            webView.load(
                URLRequest(
                    url: url,
                    cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
                    timeoutInterval: 60
                )
            )
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let callbackPathFragment: String
        private let onCallback: () -> Void
        private var handledCallback = false

        init(callbackPathFragment: String, onCallback: @escaping () -> Void) {
            self.callbackPathFragment = callbackPathFragment
            self.onCallback = onCallback
        }

        private func handleIfCallbackURL(_ url: URL?) {
            guard !handledCallback, let url else { return }
            guard url.path.contains(callbackPathFragment) else { return }
            handledCallback = true
            DispatchQueue.main.async {
                self.onCallback()
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            handleIfCallbackURL(navigationAction.request.url)
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            handleIfCallbackURL(webView.url)
        }
    }
}

private func formattedDistance(_ meters: Double?) -> String {
    guard let meters else { return "--" }
    let miles = meters / 1609.344
    return String(format: "%.2f mi", miles)
}

private func formattedSplitMilliseconds(_ milliseconds: Int?) -> String {
    guard let milliseconds, milliseconds >= 0 else { return "--" }

    let totalSeconds = milliseconds / 1_000
    let centiseconds = (milliseconds % 1_000) / 10
    let hours = totalSeconds / 3_600
    let minutes = (totalSeconds % 3_600) / 60
    let seconds = totalSeconds % 60

    if hours > 0 {
        return String(format: "%d:%02d:%02d.%02d", hours, minutes, seconds, centiseconds)
    }

    return String(format: "%d:%02d.%02d", minutes, seconds, centiseconds)
}

private func formattedDuration(_ seconds: Int?) -> String {
    guard let seconds, seconds > 0 else { return "--" }
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60
    let remaining = seconds % 60

    if hours > 0 {
        return String(format: "%d:%02d:%02d", hours, minutes, remaining)
    }

    return String(format: "%d:%02d", minutes, remaining)
}

private func formattedElevationFeet(_ meters: Double?) -> String {
    guard let meters else { return "--" }
    let feet = meters * 3.28084
    return "\(Int(feet.rounded())) ft"
}

private func formattedWeekRange(_ interval: DateInterval) -> String {
    var calendar = Calendar.current
    calendar.firstWeekday = 2
    calendar.minimumDaysInFirstWeek = 4

    let start = interval.start
    let end = calendar.date(byAdding: .day, value: 6, to: start) ?? start

    let startMonth = calendar.component(.month, from: start)
    let endMonth = calendar.component(.month, from: end)
    let startYear = calendar.component(.year, from: start)
    let endYear = calendar.component(.year, from: end)

    if startYear == endYear, startMonth == endMonth {
        let month = start.formatted(.dateTime.month(.abbreviated))
        let startDay = start.formatted(.dateTime.day())
        let endDay = end.formatted(.dateTime.day())
        return "\(month) \(startDay)-\(endDay)"
    }

    if startYear == endYear {
        return "\(start.formatted(.dateTime.month(.abbreviated).day()))-\(end.formatted(.dateTime.month(.abbreviated).day()))"
    }

    return "\(start.formatted(.dateTime.month(.abbreviated).day().year(.twoDigits)))-\(end.formatted(.dateTime.month(.abbreviated).day().year(.twoDigits)))"
}

private func formattedPace(distanceMeters: Double?, movingSeconds: Int?) -> String {
    guard let distanceMeters, let movingSeconds, distanceMeters > 1, movingSeconds > 0 else {
        return "-- /mi"
    }

    let miles = distanceMeters / 1609.344
    guard miles > 0 else { return "-- /mi" }
    let secondsPerMile = Double(movingSeconds) / miles
    let minutes = Int(secondsPerMile) / 60
    let seconds = Int(secondsPerMile) % 60
    return String(format: "%d:%02d /mi", minutes, seconds)
}

private func relativeDate(_ date: Date, now: Date = Date()) -> String {
    let elapsed = max(0, Int(now.timeIntervalSince(date)))
    let minute = 60
    let hour = 3600
    let day = 86_400

    if elapsed < hour {
        let minutes = max(1, elapsed / minute)
        return minutes == 1 ? "1m ago" : "\(minutes)m ago"
    }

    if elapsed < day {
        let hours = elapsed / hour
        return hours == 1 ? "1h ago" : "\(hours)h ago"
    }

    let days = elapsed / day
    if days < 7 {
        return days == 1 ? "1d ago" : "\(days)d ago"
    }

    return date.formatted(date: .abbreviated, time: .shortened)
}

private func initials(for name: String) -> String {
    let compact = name
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .split(whereSeparator: \.isWhitespace)
        .joined()
    guard !compact.isEmpty else { return "?" }
    return String(compact.prefix(2)).uppercased()
}

private func mapRegion(for coordinates: [CLLocationCoordinate2D]) -> MKCoordinateRegion {
    guard let first = coordinates.first else {
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 37.3349, longitude: -122.009),
            span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
        )
    }

    var minLat = first.latitude
    var maxLat = first.latitude
    var minLon = first.longitude
    var maxLon = first.longitude

    for coordinate in coordinates {
        minLat = min(minLat, coordinate.latitude)
        maxLat = max(maxLat, coordinate.latitude)
        minLon = min(minLon, coordinate.longitude)
        maxLon = max(maxLon, coordinate.longitude)
    }

    let center = CLLocationCoordinate2D(
        latitude: (minLat + maxLat) / 2,
        longitude: (minLon + maxLon) / 2
    )
    let span = MKCoordinateSpan(
        latitudeDelta: max((maxLat - minLat) * 1.15, 0.002),
        longitudeDelta: max((maxLon - minLon) * 1.15, 0.002)
    )
    return MKCoordinateRegion(center: center, span: span)
}

private func googleMapsURL(for coordinates: [CLLocationCoordinate2D]) -> URL? {
    guard !coordinates.isEmpty else { return nil }
    let center = coordinates[coordinates.count / 2]
    return URL(string: "https://www.google.com/maps/search/?api=1&query=\(center.latitude),\(center.longitude)")
}

private func decodePolyline(_ encoded: String) -> [CLLocationCoordinate2D] {
    guard !encoded.isEmpty else { return [] }

    var coordinates: [CLLocationCoordinate2D] = []
    var index = encoded.startIndex
    var latitude = 0
    var longitude = 0

    func decodeValue() -> Int? {
        var result = 0
        var shift = 0

        while index < encoded.endIndex {
            let byte = Int(encoded[index].asciiValue ?? 63) - 63
            index = encoded.index(after: index)
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20 {
                let value = (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
                return value
            }
        }

        return nil
    }

    while let latDelta = decodeValue(), let lonDelta = decodeValue() {
        latitude += latDelta
        longitude += lonDelta

        let coordinate = CLLocationCoordinate2D(
            latitude: Double(latitude) / 1_00000.0,
            longitude: Double(longitude) / 1_00000.0
        )

        coordinates.append(coordinate)
    }

    return coordinates
}
