import SwiftUI
import PhotosUI
import UIKit

private enum SocialTimestampFormatter {
    private static let minute = 60
    private static let hour = 60 * 60
    private static let day = 24 * 60 * 60
    private static let week = 7 * day
    private static let fourWeeks = 4 * week

    private static let shortDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.calendar = .current
        formatter.dateFormat = "M/d/yy"
        return formatter
    }()

    static func string(for date: Date, now: Date = Date()) -> String {
        let elapsedSeconds = max(0, Int(now.timeIntervalSince(date)))

        if elapsedSeconds < hour {
            let minutes = max(1, elapsedSeconds / minute)
            return minutes == 1 ? "1 minute ago" : "\(minutes) minutes ago"
        }

        if elapsedSeconds < day {
            let hours = elapsedSeconds / hour
            return hours == 1 ? "1 hour ago" : "\(hours) hours ago"
        }

        if elapsedSeconds < week {
            let days = elapsedSeconds / day
            return days == 1 ? "1 day ago" : "\(days) days ago"
        }

        if elapsedSeconds < fourWeeks {
            let weeks = elapsedSeconds / week
            return weeks <= 1 ? "1 week ago" : "\(weeks) weeks ago"
        }

        return shortDateFormatter.string(from: date)
    }
}

private func isTaskCancellation(_ error: Error) -> Bool {
    if error is CancellationError {
        return true
    }

    let nsError = error as NSError
    return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
}

@MainActor
private final class TeamAnnouncementsViewModel: ObservableObject {
    @Published private(set) var announcements: [Announcement] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let service: any AnnouncementServiceProtocol

    init(service: any AnnouncementServiceProtocol) {
        self.service = service
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            announcements = try await service.fetchAnnouncements().sorted { $0.createdAt > $1.createdAt }
            errorMessage = nil
        } catch {
            if isTaskCancellation(error) {
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    func create(title: String, body: String) async {
        do {
            let announcement = try await service.createAnnouncement(
                AnnouncementDraft(title: title, body: body)
            )
            announcements.insert(announcement, at: 0)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
private final class AnnouncementCommentsStore: ObservableObject {
    @Published private var commentsByAnnouncementID: [String: [AnnouncementComment]] = [:]
    @Published private var loadingAnnouncementIDs: Set<String> = []
    @Published private(set) var errorMessage: String?

    private let service: any AnnouncementServiceProtocol

    init(service: any AnnouncementServiceProtocol) {
        self.service = service
    }

    func comments(for announcementID: String) -> [AnnouncementComment] {
        (commentsByAnnouncementID[announcementID] ?? []).sorted { $0.createdAt < $1.createdAt }
    }

    func isLoading(announcementID: String) -> Bool {
        loadingAnnouncementIDs.contains(announcementID)
    }

    func refresh(announcementID: String) async {
        guard !loadingAnnouncementIDs.contains(announcementID) else { return }
        loadingAnnouncementIDs.insert(announcementID)
        defer { loadingAnnouncementIDs.remove(announcementID) }

        do {
            let comments = try await service.fetchComments(announcementID: announcementID)
            commentsByAnnouncementID[announcementID] = comments.sorted { $0.createdAt < $1.createdAt }
            errorMessage = nil
        } catch {
            if isTaskCancellation(error) {
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func addComment(announcementID: String, body: String) async -> Bool {
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedBody.isEmpty else { return false }

        do {
            let comment = try await service.createComment(
                announcementID: announcementID,
                draft: AnnouncementCommentDraft(body: trimmedBody)
            )

            var comments = commentsByAnnouncementID[announcementID] ?? []
            comments.append(comment)
            comments.sort { $0.createdAt < $1.createdAt }
            commentsByAnnouncementID[announcementID] = comments
            errorMessage = nil
            return true
        } catch {
            if isTaskCancellation(error) {
                return false
            }
            errorMessage = error.localizedDescription
            return false
        }
    }
}


@MainActor
private final class TeamChatViewModel: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published var draft = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let service: any ChatServiceProtocol

    init(service: any ChatServiceProtocol) {
        self.service = service
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            messages = try await service.fetchMessages().sorted { $0.createdAt < $1.createdAt }
            errorMessage = nil
        } catch {
            if isTaskCancellation(error) {
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func send(attachment: ChatAttachmentUpload?) async -> Bool {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty || attachment != nil else { return false }

        do {
            var sentMessages: [ChatMessage] = []

            if let attachment {
                let imageMessage = try await service.sendMessage(body: "", attachment: attachment)
                sentMessages.append(imageMessage)
            }

            if !body.isEmpty {
                let textMessage = try await service.sendMessage(body: body, attachment: nil)
                sentMessages.append(textMessage)
            }

            messages.append(contentsOf: sentMessages)
            draft = ""
            errorMessage = nil
            return true
        } catch {
            if isTaskCancellation(error) {
                return false
            }
            errorMessage = error.localizedDescription
            return false
        }
    }
}

struct TeamScene: View {
    enum Section: String, CaseIterable {
        case overview = "Overview"
        case roster = "Roster"
        case chat = "Chat"
    }

    enum RosterSection: String, CaseIterable {
        case athletes = "Athletes"
        case groups = "Groups"
        case attendance = "Attendance"
    }

    let role: UserRole
    let currentUserID: String
    let currentUserName: String
    let teamName: String?
    let teamJoinCode: String?
    @ObservedObject var localStore: LocalStore
    let environment: AppEnvironment

    @StateObject private var announcementsViewModel: TeamAnnouncementsViewModel
    @StateObject private var chatViewModel: TeamChatViewModel
    @StateObject private var announcementCommentsStore: AnnouncementCommentsStore

    @State private var section: Section = .overview
    @State private var rosterSection: RosterSection = .athletes
    @State private var showAnnouncementComposer = false
    @State private var showAthleteComposer = false
    @State private var showGroupComposer = false
    @State private var editingGroup: TeamGroup?
    @State private var attendanceDate = Date()
    @State private var attendanceRecordsByKey: [String: AttendanceRecord] = [:]
    @State private var attendancePendingKeys: Set<String> = []
    @State private var isAttendanceLoading = false
    @State private var attendanceErrorMessage: String?
    @State private var selectedAttendanceAthlete: Athlete?
    @State private var selectedAthleteRoute: AthleteRoute?
    @State private var showTeamLogoPhotoLibrary = false
    @State private var teamLogoPickerItem: PhotosPickerItem?
    @State private var showTeamLogoCamera = false
    @AppStorage("splitTimeTeam.teamLogoJPEGData") private var teamLogoData = Data()

    init(
        role: UserRole,
        currentUserID: String,
        currentUserName: String,
        teamName: String?,
        teamJoinCode: String?,
        localStore: LocalStore,
        environment: AppEnvironment
    ) {
        self.role = role
        self.currentUserID = currentUserID
        self.currentUserName = currentUserName
        self.teamName = teamName
        self.teamJoinCode = teamJoinCode
        self.localStore = localStore
        self.environment = environment
        _announcementsViewModel = StateObject(
            wrappedValue: TeamAnnouncementsViewModel(service: environment.announcementService)
        )
        _chatViewModel = StateObject(
            wrappedValue: TeamChatViewModel(service: environment.chatService)
        )
        _announcementCommentsStore = StateObject(
            wrappedValue: AnnouncementCommentsStore(service: environment.announcementService)
        )
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(spacing: 0) {
                topNavigationBar

                TopTabBar(
                    options: Section.allCases,
                    selection: $section,
                    title: { $0.rawValue }
                )

                switch section {
                case .overview:
                    overviewContent
                case .roster:
                    rosterContent
                case .chat:
                    chatContent
                }
            }

            if role == .coach, let addAction = floatingAction {
                FloatingAddButton(action: addAction)
                    .padding(.trailing, 20)
                    .padding(.bottom, 18)
            }
        }
        .background(AppTheme.Palette.background)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await syncRemoteTeamState()
            await loadRemoteTeamBranding()
            await announcementsViewModel.refresh()
            await chatViewModel.refresh()
        }
        .sheet(isPresented: $showAnnouncementComposer) {
            AnnouncementComposerSheet {
                title, body in
                Task {
                    await announcementsViewModel.create(title: title, body: body)
                }
            }
        }
        .sheet(isPresented: $showAthleteComposer) {
            AthleteComposerSheet(localStore: localStore) {
                await syncLocalTeamToRemote()
            }
        }
        .sheet(isPresented: $showGroupComposer) {
            GroupEditorSheet(localStore: localStore, group: nil) {
                await syncLocalTeamToRemote()
            }
        }
        .sheet(item: $editingGroup) { group in
            GroupEditorSheet(localStore: localStore, group: group) {
                await syncLocalTeamToRemote()
            }
        }
        .sheet(item: $selectedAttendanceAthlete) { athlete in
            AttendanceHistorySheet(
                athlete: athlete,
                teamService: environment.teamService
            )
        }
        .photosPicker(isPresented: $showTeamLogoPhotoLibrary, selection: $teamLogoPickerItem, matching: .images)
        .onChange(of: teamLogoPickerItem) { _, newItem in
            guard let newItem else { return }
            Task {
                await loadTeamLogoPhotoItem(newItem)
            }
        }
        .sheet(isPresented: $showTeamLogoCamera) {
            CameraImagePicker { image in
                saveTeamLogo(image)
            }
            .ignoresSafeArea()
        }
        .navigationDestination(item: $selectedAthleteRoute) { route in
            AthleteDetailScene(
                localStore: localStore,
                athleteID: route.id,
                isEditable: role == .coach,
                onSave: {
                    await syncLocalTeamToRemote()
                }
            )
        }
        .onChange(of: section) { _, next in
            guard next == .roster else { return }
            guard role == .coach else { return }
            guard rosterSection == .attendance else { return }
            Task {
                await loadAttendance()
            }
        }
        .onChange(of: rosterSection) { _, next in
            guard role == .coach else { return }
            guard next == .attendance else { return }
            Task {
                await loadAttendance()
            }
        }
        .onChange(of: attendanceDate) { _, _ in
            guard role == .coach else { return }
            guard section == .roster, rosterSection == .attendance else { return }
            Task {
                await loadAttendance()
            }
        }
    }

    private var topNavigationBar: some View {
        HStack(spacing: 12) {
            Color.clear
                .frame(width: 34, height: 34)

            Spacer(minLength: 8)

            Text("Team")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)

            Spacer(minLength: 8)

            Color.clear
                .frame(width: 34, height: 34)
        }
        .padding(.horizontal, AppTheme.Metrics.screenPadding)
        .padding(.top, 4)
        .padding(.bottom, 2)
        .background(
            AppTheme.Palette.elevatedSurface
                .ignoresSafeArea(edges: .top)
        )
    }

    private var floatingAction: (() -> Void)? {
        switch section {
        case .overview:
            return { showAnnouncementComposer = true }
        case .roster:
            switch rosterSection {
            case .athletes:
                return { showAthleteComposer = true }
            case .groups:
                return { showGroupComposer = true }
            case .attendance:
                return nil
            }
        case .chat:
            return nil
        }
    }

    private var overviewContent: some View {
        ScrollView {
            VStack(spacing: 18) {
                TeamIdentityCard(
                    teamName: displayTeamName,
                    teamCode: displayTeamCode,
                    logoImage: teamLogoImage,
                    canRemoveLogo: !teamLogoData.isEmpty,
                    canUseCamera: UIImagePickerController.isSourceTypeAvailable(.camera),
                    onChoosePhoto: {
                        showTeamLogoPhotoLibrary = true
                    },
                    onTakePhoto: {
                        showTeamLogoCamera = true
                    },
                    onRemoveLogo: {
                        removeTeamLogo()
                    }
                )

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    StatsCard(title: "Athletes", value: "\(localStore.athletes.count)")
                    StatsCard(title: "Groups", value: "\(localStore.groups.count)")
                    StatsCard(title: "Templates", value: "\(localStore.templateSummaries.count)")
                    StatsCard(title: "History", value: "\(localStore.workoutSummaries.count)")
                }

                if let errorMessage = announcementsViewModel.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .appCard()
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Announcements")
                        .font(.headline)

                    if announcementsViewModel.announcements.isEmpty && !announcementsViewModel.isLoading {
                        ContentUnavailableView(
                            "No Announcements Yet",
                            systemImage: "megaphone",
                            description: Text(role == .coach ? "Post one from the + button." : "Coach updates will appear here.")
                        )
                        .frame(maxWidth: .infinity)
                    } else {
                        ForEach(announcementsViewModel.announcements) { announcement in
                            NavigationLink {
                                AnnouncementDetailScene(
                                    announcement: announcement,
                                    commentsStore: announcementCommentsStore
                                )
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(announcement.title)
                                        .font(.headline)
                                    Text(announcement.body)
                                        .font(.body)
                                    HStack {
                                        Text(announcement.authorName)
                                        Spacer()
                                        Text(SocialTimestampFormatter.string(for: announcement.createdAt))
                                    }
                                    .font(.footnote)
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                                }
                                .appCard()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
            .padding(.bottom, 90)
        }
        .refreshable {
            await syncRemoteTeamState()
            await loadRemoteTeamBranding()
            await announcementsViewModel.refresh()
        }
    }

    private var displayTeamName: String {
        let trimmed = teamName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "Your Team" : trimmed
    }

    private var displayTeamCode: String? {
        let trimmed = teamJoinCode?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private var teamLogoImage: UIImage? {
        guard !teamLogoData.isEmpty else { return nil }
        return UIImage(data: teamLogoData)
    }

    private func loadTeamLogoPhotoItem(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            return
        }

        await MainActor.run {
            saveTeamLogo(image)
            teamLogoPickerItem = nil
        }
    }

    private func saveTeamLogo(_ image: UIImage) {
        guard let jpeg = image.jpegData(compressionQuality: 0.88) else { return }
        teamLogoData = jpeg
        Task {
            await syncTeamLogoToRemote()
        }
    }

    private func removeTeamLogo() {
        teamLogoData = Data()
        Task {
            await syncTeamLogoToRemote()
        }
    }

    private func loadRemoteTeamBranding() async {
        do {
            let branding = try await environment.teamService.fetchTeamBranding()
            guard let base64 = branding.logoBase64, !base64.isEmpty else {
                teamLogoData = Data()
                return
            }

            if let decoded = Data(base64Encoded: base64) {
                teamLogoData = decoded
            }
        } catch {
            // Keep locally cached logo when remote branding is unavailable.
        }
    }

    private func syncTeamLogoToRemote() async {
        guard role == .coach else { return }
        let branding = TeamBranding(
            logoBase64: teamLogoData.isEmpty ? nil : teamLogoData.base64EncodedString()
        )

        do {
            _ = try await environment.teamService.updateTeamBranding(branding)
        } catch {
            // Keep local changes; coach can retry by editing logo again.
        }
    }

    private var rosterContent: some View {
        Group {
            if role == .athlete {
                rosterAthletesList
            } else {
                VStack(spacing: 0) {
                    Picker("Roster Section", selection: $rosterSection) {
                        ForEach(RosterSection.allCases, id: \.self) { option in
                            Text(option.rawValue)
                                .tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
                    .padding(.top, 10)
                    .padding(.bottom, 8)

                    Group {
                        switch rosterSection {
                        case .athletes:
                            rosterAthletesList
                        case .groups:
                            rosterGroupsList
                        case .attendance:
                            rosterAttendanceList
                        }
                    }
                }
            }
        }
        .background(AppTheme.Palette.background)
    }

    private var rosterAthletesList: some View {
        ScrollView {
            VStack(spacing: 0) {
                if localStore.athletes.isEmpty {
                    ContentUnavailableView("No Athletes Yet", systemImage: "person.2")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 50)
                } else {
                    ForEach(Array(localStore.athletes.enumerated()), id: \.element.id) { index, athlete in
                        Button {
                            selectedAthleteRoute = AthleteRoute(id: athlete.id)
                        } label: {
                            HStack(spacing: 14) {
                                AthleteListAvatar(name: athlete.name, photoURL: athlete.photoURL, size: 62)

                                VStack(alignment: .leading, spacing: 4) {
                                    let groupName = localStore.groups.first(where: { $0.id == athlete.groupID })?.name

                                    Text(athlete.name)
                                        .font(.title3.weight(.semibold))
                                        .foregroundStyle(AppTheme.Palette.textPrimary)

                                    if role == .coach, let groupName {
                                        Text(groupName)
                                            .font(.subheadline)
                                            .foregroundStyle(AppTheme.Palette.textSecondary)
                                    }
                                }

                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, AppTheme.Metrics.screenPadding)
                            .padding(.vertical, 18)
                        }
                        .buttonStyle(.plain)

                        if index < localStore.athletes.count - 1 {
                            Divider()
                        }
                    }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 90)
        }
        .refreshable {
            await syncRemoteTeamState()
        }
        .background(AppTheme.Palette.background)
    }

    private var rosterGroupsList: some View {
        ScrollView {
            VStack(spacing: 14) {
                if localStore.groups.isEmpty {
                    ContentUnavailableView("No Groups Yet", systemImage: "person.3.sequence")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 50)
                } else {
                    ForEach(localStore.groups) { group in
                        Button {
                            editingGroup = group
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Circle()
                                        .fill(Color(hex: group.colorHex))
                                        .frame(width: 10, height: 10)
                                    Text(group.name)
                                        .font(.headline)
                                        .foregroundStyle(AppTheme.Palette.textPrimary)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption.bold())
                                        .foregroundStyle(AppTheme.Palette.textSecondary)
                                }
                                Text("\(localStore.athletes.filter { $0.groupID == group.id }.count) athlete\(localStore.athletes.filter { $0.groupID == group.id }.count == 1 ? "" : "s")")
                                    .font(.subheadline)
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                            .appCard()
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
            .padding(.bottom, 90)
        }
        .refreshable {
            await syncRemoteTeamState()
        }
        .background(AppTheme.Palette.background)
    }

    private var rosterAttendanceList: some View {
        ScrollView {
            VStack(spacing: 14) {
                attendanceDateCard

                if let attendanceErrorMessage {
                    Text(attendanceErrorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .appCard()
                }

                if isAttendanceLoading {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Loading attendance...")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                        Spacer()
                    }
                    .appCard()
                }

                if localStore.athletes.isEmpty {
                    ContentUnavailableView("No Athletes Yet", systemImage: "person.2")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 50)
                } else {
                    ForEach(localStore.athletes) { athlete in
                        attendanceAthleteRow(athlete)
                    }
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
            .padding(.bottom, 90)
        }
        .refreshable {
            await syncRemoteTeamState()
            await loadAttendance()
        }
        .background(AppTheme.Palette.background)
    }

    private var attendanceDateCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Button {
                    shiftAttendanceDate(days: -1)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.subheadline.bold())
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(AppTheme.Palette.surface))
                }
                .buttonStyle(.plain)

                Text(attendanceDate.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().year()))
                    .font(.headline)

                Spacer()

                DatePicker(
                    "",
                    selection: $attendanceDate,
                    displayedComponents: .date
                )
                .labelsHidden()
                .datePickerStyle(.compact)

                Button {
                    shiftAttendanceDate(days: 1)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.subheadline.bold())
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(AppTheme.Palette.surface))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 8) {
                attendanceCountBadge(.present)
                    .frame(maxWidth: .infinity)
                attendanceCountBadge(.late)
                    .frame(maxWidth: .infinity)
                attendanceCountBadge(.excused)
                    .frame(maxWidth: .infinity)
                attendanceCountBadge(.absent)
                    .frame(maxWidth: .infinity)
            }
        }
        .appCard()
    }

    @ViewBuilder
    private func attendanceAthleteRow(_ athlete: Athlete) -> some View {
        let key = attendanceKey(for: athlete)
        let selectedStatus = attendanceRecordsByKey[key]?.status
        let isPending = attendancePendingKeys.contains(key)

        VStack(alignment: .leading, spacing: 12) {
            Button {
                selectedAttendanceAthlete = athlete
            } label: {
                HStack(spacing: 12) {
                    AthleteListAvatar(name: athlete.name, photoURL: athlete.photoURL, size: 46)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(athlete.name)
                            .font(.headline)
                            .foregroundStyle(AppTheme.Palette.textPrimary)

                        if let groupName = localStore.groups.first(where: { $0.id == athlete.groupID })?.name {
                            Text(groupName)
                                .font(.caption)
                                .foregroundStyle(AppTheme.Palette.textSecondary)
                        }
                    }

                    Spacer()

                    if isPending {
                        ProgressView()
                            .controlSize(.small)
                    }

                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                ForEach(AttendanceStatus.allCases, id: \.self) { status in
                    Button {
                        Task {
                            await toggleAttendance(for: athlete, status: status)
                        }
                    } label: {
                        Text(status.title)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity)
                            .frame(height: 34)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(selectedStatus == status ? attendanceStatusColor(status).opacity(0.18) : AppTheme.Palette.surface)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(selectedStatus == status ? attendanceStatusColor(status) : AppTheme.Palette.border, lineWidth: selectedStatus == status ? 1.6 : 1)
                            )
                            .foregroundStyle(selectedStatus == status ? attendanceStatusColor(status) : AppTheme.Palette.textSecondary)
                    }
                    .buttonStyle(.plain)
                    .disabled(isPending)
                }
            }
        }
        .appCard()
    }

    private func attendanceCountBadge(_ status: AttendanceStatus) -> some View {
        let count = attendanceRecordsByKey.values.reduce(into: 0) { running, record in
            if record.status == status {
                running += 1
            }
        }

        return HStack(spacing: 5) {
            Circle()
                .fill(attendanceStatusColor(status))
                .frame(width: 8, height: 8)
            Text("\(status.title) \(count)")
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(AppTheme.Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .background(
            Capsule(style: .continuous)
                .fill(AppTheme.Palette.surface)
        )
    }

    private func attendanceStatusColor(_ status: AttendanceStatus) -> Color {
        switch status {
        case .present:
            return AppTheme.Palette.success
        case .late:
            return .orange
        case .excused:
            return AppTheme.Palette.primary
        case .absent:
            return AppTheme.Palette.danger
        }
    }

    private func attendanceKey(for athlete: Athlete) -> String {
        if let remoteUserID = athlete.remoteUserID, !remoteUserID.isEmpty {
            return "u:\(remoteUserID)"
        }
        return "l:\(athlete.id)"
    }

    private func attendanceKey(for record: AttendanceRecord) -> String? {
        if let athleteUserID = record.athleteUserID, !athleteUserID.isEmpty {
            return "u:\(athleteUserID)"
        }
        if let athleteLocalID = record.athleteLocalID, !athleteLocalID.isEmpty {
            return "l:\(athleteLocalID)"
        }
        return nil
    }

    private func shiftAttendanceDate(days: Int) {
        if let shifted = Calendar.current.date(byAdding: .day, value: days, to: attendanceDate) {
            attendanceDate = shifted
        }
    }

    private func loadAttendance() async {
        guard role == .coach else { return }
        isAttendanceLoading = true
        defer { isAttendanceLoading = false }

        do {
            let records = try await environment.teamService.fetchAttendance(date: attendanceDate)
            var mapped: [String: AttendanceRecord] = [:]
            for record in records {
                guard let key = attendanceKey(for: record) else { continue }
                mapped[key] = record
            }
            attendanceRecordsByKey = mapped
            attendanceErrorMessage = nil
        } catch {
            if isCancellation(error) {
                return
            }
            attendanceErrorMessage = error.localizedDescription
        }
    }

    private func toggleAttendance(for athlete: Athlete, status: AttendanceStatus) async {
        guard role == .coach else { return }
        let key = attendanceKey(for: athlete)
        guard !attendancePendingKeys.contains(key) else { return }
        attendancePendingKeys.insert(key)
        defer { attendancePendingKeys.remove(key) }

        let previous = attendanceRecordsByKey[key]
        let nextStatus: AttendanceStatus? = previous?.status == status ? nil : status

        if let nextStatus {
            attendanceRecordsByKey[key] = AttendanceRecord(
                id: previous?.id ?? "pending-\(UUID().uuidString)",
                date: Calendar.current.startOfDay(for: attendanceDate),
                athleteUserID: athlete.remoteUserID,
                athleteLocalID: athlete.remoteUserID == nil ? athlete.id : nil,
                status: nextStatus,
                note: previous?.note,
                markedByUserID: currentUserID,
                createdAt: previous?.createdAt ?? Date(),
                updatedAt: Date()
            )
        } else {
            attendanceRecordsByKey.removeValue(forKey: key)
        }

        do {
            let updated = try await environment.teamService.markAttendance(
                AttendanceMarkDraft(
                    date: attendanceDate,
                    athleteUserID: athlete.remoteUserID,
                    athleteLocalID: athlete.remoteUserID == nil ? athlete.id : nil,
                    status: nextStatus,
                    note: nil
                )
            )

            if let updated, let updatedKey = attendanceKey(for: updated) {
                attendanceRecordsByKey[updatedKey] = updated
            } else {
                attendanceRecordsByKey.removeValue(forKey: key)
            }

            attendanceErrorMessage = nil
        } catch {
            if let previous {
                attendanceRecordsByKey[key] = previous
            } else {
                attendanceRecordsByKey.removeValue(forKey: key)
            }
            if isCancellation(error) {
                return
            }
            attendanceErrorMessage = error.localizedDescription
        }
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
    }

    private func syncRemoteTeamState() async {
        do {
            let state = try await environment.teamService.fetchTeamState()
            await localStore.applyRemoteTeamState(state)
        } catch {
            do {
                let members = try await environment.rosterService.fetchTeamRoster()
                await localStore.mergeRemoteRosterMembers(members)
            } catch {
                // Keep local roster available when remote sync is unavailable.
            }
        }
    }

    private func syncLocalTeamToRemote() async {
        guard role == .coach else { return }

        do {
            let synced = try await environment.teamService.syncTeamState(localStore.teamStateSnapshot)
            await localStore.applyRemoteTeamState(synced)
        } catch {
            // Keep local edits; they'll retry on next refresh/sync call.
        }
    }

    private var chatContent: some View {
        TeamChatPanel(viewModel: chatViewModel, currentUserID: currentUserID)
    }
}

private struct AthleteRoute: Identifiable, Hashable {
    let id: String
}

private struct TeamChatPanel: View {
    @ObservedObject var viewModel: TeamChatViewModel
    let currentUserID: String

    @FocusState private var isComposerFocused: Bool
    @State private var lastKeyboardAnimationDuration = 0.25
    @State private var pendingAttachment: ChatComposerAttachment?
    @State private var showAttachmentPopover = false
    @State private var showPhotoLibrary = false
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var showCameraPicker = false

    private let bottomAnchorID = "team-chat-bottom-anchor"

    var body: some View {
        VStack(spacing: 0) {
            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Palette.danger)
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
                    .padding(.top, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        if viewModel.messages.isEmpty && !viewModel.isLoading {
                            ContentUnavailableView("No Messages Yet", systemImage: "bubble.left.and.bubble.right")
                                .frame(maxWidth: .infinity)
                                .frame(minHeight: 240)
                        } else {
                            ForEach(viewModel.messages) { message in
                                ChatBubbleRow(message: message, currentUserID: currentUserID)
                                    .id(message.id)
                            }
                        }

                        Color.clear
                            .frame(height: 0)
                            .id(bottomAnchorID)
                    }
                    .padding(.horizontal, AppTheme.Metrics.screenPadding)
                    .padding(.top, AppTheme.Metrics.screenPadding)
                    .padding(.bottom, 0)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    composer(proxy: proxy)
                }
                .onAppear {
                    scrollToLatest(using: proxy, animated: false)
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    scrollToLatest(using: proxy, animated: true)
                }
                .onChange(of: isComposerFocused) { _, focused in
                    guard focused else { return }
                    scrollToLatest(using: proxy, animated: true, duration: max(0.18, lastKeyboardAnimationDuration))
                }
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
                    guard isComposerFocused else { return }
                    let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
                    lastKeyboardAnimationDuration = duration
                    scrollToLatest(using: proxy, animated: true, duration: max(0.18, duration))
                }
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { notification in
                    let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
                    lastKeyboardAnimationDuration = duration
                }
                .refreshable {
                    await viewModel.refresh()
                }
            }
        }
        .photosPicker(isPresented: $showPhotoLibrary, selection: $photoPickerItem, matching: .images)
        .onChange(of: photoPickerItem) { _, newItem in
            guard let newItem else { return }
            Task {
                await loadPhotoItem(newItem)
            }
        }
        .sheet(isPresented: $showCameraPicker) {
            CameraImagePicker { image in
                pendingAttachment = makeAttachment(from: image)
            }
            .ignoresSafeArea()
        }
    }

    private func composer(proxy: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let pendingAttachment {
                HStack {
                    ZStack(alignment: .topTrailing) {
                        Image(uiImage: pendingAttachment.image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 88, height: 88)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .stroke(AppTheme.Palette.border, lineWidth: 1)
                            )

                        Button {
                            self.pendingAttachment = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(.white, Color.black.opacity(0.6))
                        }
                        .offset(x: 8, y: -8)
                    }

                    Spacer()
                }
                .padding(.horizontal, 44)
            }

            HStack(alignment: .center, spacing: 10) {
                Button {
                    showAttachmentPopover = true
                } label: {
                    Circle()
                        .fill(AppTheme.Palette.elevatedSurface)
                        .frame(width: 34, height: 34)
                        .overlay {
                            Image(systemName: "plus")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(AppTheme.Palette.textSecondary)
                        }
                        .overlay(
                            Circle()
                                .stroke(AppTheme.Palette.border, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showAttachmentPopover, attachmentAnchor: .rect(.bounds), arrowEdge: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Button {
                            showAttachmentPopover = false
                            showPhotoLibrary = true
                        } label: {
                            Label("Choose Photo", systemImage: "photo.on.rectangle")
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)

                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button {
                                showAttachmentPopover = false
                                showCameraPicker = true
                            } label: {
                                Label("Take Photo", systemImage: "camera")
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                        }

                        if pendingAttachment != nil {
                            Divider()
                            Button(role: .destructive) {
                                showAttachmentPopover = false
                                pendingAttachment = nil
                            } label: {
                                Label("Remove Photo", systemImage: "trash")
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                        }
                    }
                    .frame(minWidth: 210)
                    .padding(.vertical, 6)
                    .presentationCompactAdaptation(.popover)
                }

                HStack(alignment: .center, spacing: 8) {
                    TextField("Send a message", text: $viewModel.draft)
                        .focused($isComposerFocused)
                        .font(.system(size: 16))
                        .textInputAutocapitalization(.sentences)
                        .autocorrectionDisabled(false)
                        .submitLabel(.send)
                        .onSubmit {
                            guard canSend else { return }
                            Task {
                                let attachment = pendingAttachment?.upload
                                let didSend = await viewModel.send(attachment: attachment)
                                if didSend {
                                    pendingAttachment = nil
                                    scrollToLatest(using: proxy, animated: true)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        Task {
                            let attachment = pendingAttachment?.upload
                            let didSend = await viewModel.send(attachment: attachment)
                            if didSend {
                                pendingAttachment = nil
                                scrollToLatest(using: proxy, animated: true)
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(canSend ? AppTheme.Palette.primary : AppTheme.Palette.textSecondary.opacity(0.45))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSend)
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
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 6)
    }

    private func scrollToLatest(using proxy: ScrollViewProxy, animated: Bool, duration: Double = 0.22) {
        DispatchQueue.main.async {
            if animated {
                withAnimation(.easeOut(duration: duration)) {
                    proxy.scrollTo(bottomAnchorID, anchor: .bottom)
                }
            } else {
                proxy.scrollTo(bottomAnchorID, anchor: .bottom)
            }
        }
    }

    private var canSend: Bool {
        pendingAttachment != nil || !viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func loadPhotoItem(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            return
        }

        await MainActor.run {
            pendingAttachment = makeAttachment(from: image)
            photoPickerItem = nil
        }
    }

    private func makeAttachment(from image: UIImage) -> ChatComposerAttachment? {
        guard let data = image.jpegData(compressionQuality: 0.88) else { return nil }
        return ChatComposerAttachment(
            image: image,
            upload: ChatAttachmentUpload(
                data: data,
                filename: "chat-photo-\(UUID().uuidString).jpg",
                mimeType: "image/jpeg"
            )
        )
    }
}

private struct StatsCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textSecondary)
            Text(value)
                .font(.system(size: 32, weight: .bold, design: .rounded))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .appCard()
    }
}

private struct TeamIdentityCard: View {
    let teamName: String
    let teamCode: String?
    let logoImage: UIImage?
    let canRemoveLogo: Bool
    let canUseCamera: Bool
    let onChoosePhoto: () -> Void
    let onTakePhoto: () -> Void
    let onRemoveLogo: () -> Void

    @State private var showLogoActions = false

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Team")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.Palette.muted)
                    .textCase(.uppercase)

                Text(teamName)
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .lineLimit(2)

                if let teamCode, !teamCode.isEmpty {
                    HStack(spacing: 8) {
                        Text("Team Code")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textSecondary)

                        Text(teamCode)
                            .font(.caption.monospaced().weight(.semibold))
                            .foregroundStyle(AppTheme.Palette.textPrimary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(AppTheme.Palette.surface)
                            )

                        Button {
                            UIPasteboard.general.string = teamCode
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.caption.weight(.semibold))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                    }
                    .padding(.top, 2)
                }
            }

            Spacer(minLength: 12)

            Button {
                showLogoActions = true
            } label: {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(AppTheme.Palette.surface)

                    if let logoImage {
                        Image(uiImage: logoImage)
                            .resizable()
                            .scaledToFill()
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    } else {
                        VStack(spacing: 6) {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 24, weight: .semibold))
                                .foregroundStyle(AppTheme.Palette.muted)
                            Text("Add Logo")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(AppTheme.Palette.muted)
                        }
                    }
                }
                .frame(width: 94, height: 94)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(
                            AppTheme.Palette.border,
                            style: StrokeStyle(lineWidth: 1, dash: logoImage == nil ? [5, 4] : [])
                        )
                )
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showLogoActions, attachmentAnchor: .rect(.bounds), arrowEdge: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Button {
                        showLogoActions = false
                        onChoosePhoto()
                    } label: {
                        Label("Choose Photo", systemImage: "photo.on.rectangle")
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)

                    if canUseCamera {
                        Button {
                            showLogoActions = false
                            onTakePhoto()
                        } label: {
                            Label("Take Photo", systemImage: "camera")
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }

                    if canRemoveLogo {
                        Divider()
                        Button(role: .destructive) {
                            showLogoActions = false
                            onRemoveLogo()
                        } label: {
                            Label("Remove Logo", systemImage: "trash")
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                }
                .frame(minWidth: 210)
                .padding(.vertical, 6)
                .presentationCompactAdaptation(.popover)
            }
        }
        .appCard()
    }
}

private struct AnnouncementDetailScene: View {
    let announcement: Announcement
    @ObservedObject var commentsStore: AnnouncementCommentsStore

    @State private var draftComment = ""
    @State private var isSubmittingComment = false
    @FocusState private var isComposerFocused: Bool

    private var comments: [AnnouncementComment] {
        commentsStore.comments(for: announcement.id)
    }

    private var canSend: Bool {
        !draftComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSubmittingComment
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                postCard

                Text("Comments")
                    .font(.headline)

                if commentsStore.isLoading(announcementID: announcement.id), comments.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                }

                if let errorMessage = commentsStore.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                }

                if !comments.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(comments.enumerated()), id: \.element.id) { index, comment in
                            commentRow(comment)
                            if index < comments.count - 1 {
                                Divider()
                                    .padding(.leading, 44)
                            }
                        }
                    }
                }
            }
            .padding(AppTheme.Metrics.screenPadding)
            .padding(.bottom, 90)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(AppTheme.Palette.background)
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            commentComposer
        }
        .task {
            await commentsStore.refresh(announcementID: announcement.id)
        }
        .refreshable {
            await commentsStore.refresh(announcementID: announcement.id)
        }
    }

    private var postCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                AthleteListAvatar(name: announcement.authorName, photoURL: nil, size: 44)

                VStack(alignment: .leading, spacing: 4) {
                    Text(announcement.authorName)
                        .font(.subheadline.weight(.semibold))
                    Text(SocialTimestampFormatter.string(for: announcement.createdAt))
                        .font(.caption)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }

                Spacer()
            }

            if !announcement.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(announcement.title)
                    .font(.title3.weight(.bold))
            }

            Text(announcement.body)
                .font(.body)
                .foregroundStyle(AppTheme.Palette.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .appCard()
    }

    private func commentRow(_ comment: AnnouncementComment) -> some View {
        HStack(alignment: .top, spacing: 12) {
            AthleteListAvatar(name: comment.authorName, photoURL: nil, size: 36)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(comment.authorName)
                        .font(.subheadline.weight(.semibold))
                    Text("•")
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                    Text(SocialTimestampFormatter.string(for: comment.createdAt))
                        .font(.caption2)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }

                Text(comment.body)
                    .font(.callout)
                    .foregroundStyle(AppTheme.Palette.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 8)
    }

    private var commentComposer: some View {
        HStack(alignment: .center, spacing: 8) {
            TextField("Add a comment", text: $draftComment, axis: .vertical)
                .focused($isComposerFocused)
                .font(.system(size: 16))
                .textInputAutocapitalization(.sentences)
                .autocorrectionDisabled(false)
                .lineLimit(1...4)
                .submitLabel(.send)
                .onSubmit {
                    sendComment()
                }
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                sendComment()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(canSend ? AppTheme.Palette.primary : AppTheme.Palette.textSecondary.opacity(0.45))
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
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

    private func sendComment() {
        guard canSend else { return }
        let body = draftComment
        Task {
            isSubmittingComment = true
            defer { isSubmittingComment = false }

            let didSend = await commentsStore.addComment(
                announcementID: announcement.id,
                body: body
            )

            guard didSend else { return }
            draftComment = ""
            isComposerFocused = true
        }
    }
}

private struct AnnouncementComposerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var messageBody = ""
    let onSave: (String, String) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Announcement title", text: $title)
                }
                Section("Body") {
                    TextField("Write the announcement", text: $messageBody, axis: .vertical)
                        .lineLimit(4...10)
                }
            }
            .navigationTitle("New Announcement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Post") {
                        onSave(
                            title.trimmingCharacters(in: .whitespacesAndNewlines),
                            messageBody.trimmingCharacters(in: .whitespacesAndNewlines)
                        )
                        dismiss()
                    }
                    .fontWeight(.bold)
                }
            }
        }
    }
}

private struct AthleteComposerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var localStore: LocalStore
    let onSave: () async -> Void
    @State private var name = ""
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var age = ""
    @State private var grade = ""
    @State private var groupID: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Athlete") {
                    TextField("Display Name", text: $name)
                        .textInputAutocapitalization(.words)
                    TextField("First Name", text: $firstName)
                        .textInputAutocapitalization(.words)
                    TextField("Last Name", text: $lastName)
                        .textInputAutocapitalization(.words)
                }

                Section("Contact") {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                    TextField("Phone", text: $phone)
                        .keyboardType(.phonePad)
                }

                Section("Details") {
                    TextField("Age", text: $age)
                        .keyboardType(.numberPad)
                    TextField("Grade", text: $grade)
                }

                Section("Group") {
                    Picker("Group", selection: $groupID) {
                        Text("Unassigned").tag(String?.none)
                        ForEach(localStore.groups) { group in
                            Text(group.name).tag(String?.some(group.id))
                        }
                    }
                }
            }
            .navigationTitle("Add Athlete")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        Task {
                            _ = await localStore.addAthlete(
                                name: resolvedDisplayName,
                                groupID: groupID,
                                firstName: normalized(firstName),
                                lastName: normalized(lastName),
                                email: normalized(email),
                                phone: normalized(phone),
                                age: Int(age.trimmingCharacters(in: .whitespacesAndNewlines)),
                                grade: normalized(grade)
                            )
                            await onSave()
                            dismiss()
                        }
                    }
                    .disabled(resolvedDisplayName.isEmpty)
                    .fontWeight(.bold)
                }
            }
        }
    }

    private var resolvedDisplayName: String {
        let explicit = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !explicit.isEmpty { return explicit }

        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(first) \(last)".trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalized(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AthleteDetailScene: View {
    @ObservedObject var localStore: LocalStore
    let athleteID: String
    let isEditable: Bool
    let onSave: () async -> Void

    @State private var name = ""
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var age = ""
    @State private var grade = ""
    @State private var groupID: String?
    @State private var hasLoaded = false
    @State private var isSaving = false
    @State private var isEditing = false

    private var athlete: Athlete? {
        localStore.athletes.first(where: { $0.id == athleteID })
    }

    var body: some View {
        Group {
            if let athlete {
                Form {
                    Section {
                        HStack(spacing: 14) {
                            AthleteListAvatar(name: athlete.name, photoURL: athlete.photoURL, size: 58)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(athlete.name)
                                    .font(.headline)
                                Text("Joined \(athlete.createdAt.formatted(date: .abbreviated, time: .omitted))")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }

                    if canEditGeneralFields {
                        Section("Profile") {
                            TextField("Display Name", text: $name)
                                .textInputAutocapitalization(.words)
                                .disabled(!canEditGeneralFields)
                            TextField("First Name", text: $firstName)
                                .textInputAutocapitalization(.words)
                                .disabled(!canEditGeneralFields)
                            TextField("Last Name", text: $lastName)
                                .textInputAutocapitalization(.words)
                                .disabled(!canEditGeneralFields)
                        }

                        Section("Details") {
                            TextField("Age", text: $age)
                                .keyboardType(.numberPad)
                                .disabled(!canEditGeneralFields)
                            TextField("Grade", text: $grade)
                                .disabled(!canEditGeneralFields)
                        }

                        Section {
                            TextField("Email", text: $email)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.emailAddress)
                                .disabled(!canEditContactFields)
                            TextField("Phone", text: $phone)
                                .keyboardType(.phonePad)
                                .disabled(!canEditContactFields)
                        } header: {
                            Text("Contact")
                        } footer: {
                            if isEditable, athlete.remoteUserID != nil {
                                Text("Email and phone are managed by the athlete account and can’t be edited by coach.")
                            }
                        }

                        Section("Group") {
                            Picker("Group", selection: $groupID) {
                                Text("Unassigned").tag(String?.none)
                                ForEach(localStore.groups) { group in
                                    Text(group.name).tag(String?.some(group.id))
                                }
                            }
                            .disabled(!canEditGeneralFields)
                        }
                    } else {
                        Section("Details") {
                            AthleteProfileValueRow(label: "Age", value: athlete.age.map(String.init) ?? "Not set")
                            AthleteProfileValueRow(label: "Grade", value: athlete.grade ?? "Not set")
                            AthleteProfileValueRow(label: "Email", value: athlete.email ?? "Not set")
                            AthleteProfileValueRow(label: "Phone", value: athlete.phone ?? "Not set")
                            if let groupName = localStore.groups.first(where: { $0.id == athlete.groupID })?.name {
                                AthleteProfileValueRow(label: "Group", value: groupName)
                            }
                        }
                    }
                }
            } else {
                ContentUnavailableView("Athlete Not Found", systemImage: "person.crop.circle.badge.exclamationmark")
            }
        }
        .navigationTitle("Athlete")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isEditable {
                ToolbarItem(placement: .topBarLeading) {
                    if isEditing {
                        Button("Cancel") {
                            if let athlete {
                                loadFields(from: athlete)
                            }
                            isEditing = false
                        }
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    if isEditing {
                        Button("Save") {
                            Task {
                                await saveChanges()
                            }
                        }
                        .disabled(isSaving || resolvedDisplayName.isEmpty)
                        .fontWeight(.bold)
                    } else {
                        Button("Edit") {
                            isEditing = true
                        }
                        .fontWeight(.bold)
                    }
                }
            }
        }
        .task {
            guard !hasLoaded, let athlete else { return }
            hasLoaded = true
            loadFields(from: athlete)
        }
    }

    private var canEditGeneralFields: Bool {
        isEditable && isEditing
    }

    private var canEditContactFields: Bool {
        canEditGeneralFields && (athlete?.remoteUserID == nil)
    }

    private var resolvedDisplayName: String {
        let explicit = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !explicit.isEmpty { return explicit }

        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(first) \(last)".trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalized(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func loadFields(from athlete: Athlete) {
        name = athlete.name
        firstName = athlete.firstName ?? ""
        lastName = athlete.lastName ?? ""
        email = athlete.email ?? ""
        phone = athlete.phone ?? ""
        age = athlete.age.map(String.init) ?? ""
        grade = athlete.grade ?? ""
        groupID = athlete.groupID
    }

    private func saveChanges() async {
        guard resolvedDisplayName.isEmpty == false else { return }
        isSaving = true
        await localStore.updateAthlete(
            athleteID: athleteID,
            name: resolvedDisplayName,
            firstName: normalized(firstName),
            lastName: normalized(lastName),
            email: canEditContactFields ? normalized(email) : nil,
            phone: canEditContactFields ? normalized(phone) : nil,
            age: Int(age.trimmingCharacters(in: .whitespacesAndNewlines)),
            grade: normalized(grade),
            groupID: .some(groupID)
        )
        await onSave()
        isSaving = false
        isEditing = false
    }
}

private struct AthleteProfileValueRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Text("\(label):")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textSecondary)
            Text(value)
                .font(.body)
                .foregroundStyle(AppTheme.Palette.textPrimary)
            Spacer()
        }
    }
}

private struct AthleteListAvatar: View {
    let name: String
    let photoURL: URL?
    var size: CGFloat = 44

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
        Text(initials)
            .font(.system(size: max(12, size * 0.34), weight: .bold))
            .foregroundStyle(AppTheme.Palette.textSecondary)
    }

    private var initials: String {
        let compactName = name
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: \.isWhitespace)
            .joined()

        guard !compactName.isEmpty else {
            return "??"
        }

        return String(compactName.prefix(2)).uppercased()
    }
}

private struct AttendanceHistorySheet: View {
    @Environment(\.dismiss) private var dismiss

    let athlete: Athlete
    let teamService: any TeamServiceProtocol

    @State private var displayedMonth: Date
    @State private var statusesByDay: [Int: AttendanceStatus] = [:]
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let calendar = Calendar.current

    init(athlete: Athlete, teamService: any TeamServiceProtocol) {
        self.athlete = athlete
        self.teamService = teamService
        _displayedMonth = State(initialValue: Self.startOfMonth(Date()))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    headerCard
                    legendCard
                    calendarCard
                }
                .padding(AppTheme.Metrics.screenPadding)
                .padding(.bottom, 24)
            }
            .background(AppTheme.Palette.background)
            .navigationTitle("Attendance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .task {
            await loadMonth()
        }
        .onChange(of: displayedMonth) { _, _ in
            Task {
                await loadMonth()
            }
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                AthleteListAvatar(name: athlete.name, photoURL: athlete.photoURL, size: 48)

                VStack(alignment: .leading, spacing: 2) {
                    Text(athlete.name)
                        .font(.headline)
                        .foregroundStyle(AppTheme.Palette.textPrimary)
                    Text("Monthly attendance")
                        .font(.caption)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }

                Spacer()
            }

            HStack {
                Button {
                    shiftMonth(by: -1)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.subheadline.bold())
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(AppTheme.Palette.surface))
                }
                .buttonStyle(.plain)

                Spacer()

                Text(displayedMonth.formatted(.dateTime.month(.wide).year()))
                    .font(.headline)
                    .foregroundStyle(AppTheme.Palette.textPrimary)

                Spacer()

                Button {
                    shiftMonth(by: 1)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.subheadline.bold())
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(AppTheme.Palette.surface))
                }
                .buttonStyle(.plain)
            }
        }
        .appCard()
    }

    private var legendCard: some View {
        HStack(spacing: 8) {
            legendBadge(.present)
            legendBadge(.late)
            legendBadge(.excused)
            legendBadge(.absent)
        }
        .appCard()
    }

    private var calendarCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Palette.danger)
            }

            if isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Loading month...")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 7), spacing: 8) {
                ForEach(Array(weekdaySymbols.enumerated()), id: \.offset) { _, symbol in
                    Text(symbol)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                        .frame(maxWidth: .infinity)
                }

                ForEach(Array(monthGrid.enumerated()), id: \.offset) { _, day in
                    if let day {
                        dayCell(day)
                    } else {
                        Color.clear
                            .frame(height: 52)
                    }
                }
            }
        }
        .appCard()
    }

    private var weekdaySymbols: [String] {
        let symbols = calendar.shortStandaloneWeekdaySymbols
        guard symbols.count == 7 else { return symbols }
        let offset = max(0, min(6, calendar.firstWeekday - 1))
        return Array(symbols[offset...]) + Array(symbols[..<offset])
    }

    private var monthGrid: [Int?] {
        let monthStart = Self.startOfMonth(displayedMonth)
        let firstWeekday = calendar.component(.weekday, from: monthStart)
        let leadingSpaces = (firstWeekday - calendar.firstWeekday + 7) % 7
        let daysInMonth = calendar.range(of: .day, in: .month, for: monthStart)?.count ?? 0

        var grid: [Int?] = Array(repeating: nil, count: leadingSpaces)
        grid.append(contentsOf: (1...daysInMonth).map { Optional($0) })

        let trailingSpaces = (7 - (grid.count % 7)) % 7
        grid.append(contentsOf: Array(repeating: nil, count: trailingSpaces))
        return grid
    }

    @ViewBuilder
    private func dayCell(_ day: Int) -> some View {
        let status = statusesByDay[day]

        VStack(alignment: .leading, spacing: 5) {
            Text("\(day)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.Palette.textPrimary)

            Spacer(minLength: 0)

            if let status {
                HStack {
                    Spacer(minLength: 0)

                    HStack(spacing: 5) {
                        Circle()
                            .fill(color(for: status))
                            .frame(width: 7, height: 7)

                        Text(status.shortLabel)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(color(for: status))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule(style: .continuous)
                            .fill(color(for: status).opacity(0.14))
                    )

                    Spacer(minLength: 0)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .topLeading)
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.Palette.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(
                    status.map { color(for: $0).opacity(0.75) } ?? AppTheme.Palette.border,
                    lineWidth: status == nil ? 1 : 1.4
                )
        )
    }

    private func legendBadge(_ status: AttendanceStatus) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color(for: status))
                .frame(width: 8, height: 8)
            Text(status.title)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(AppTheme.Palette.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            Capsule(style: .continuous)
                .fill(AppTheme.Palette.surface)
        )
    }

    private func shiftMonth(by offset: Int) {
        guard let shifted = calendar.date(byAdding: .month, value: offset, to: displayedMonth) else { return }
        displayedMonth = Self.startOfMonth(shifted)
    }

    private func loadMonth() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let records = try await teamService.fetchAttendanceMonth(containing: displayedMonth)
            let targetComponents = calendar.dateComponents([.year, .month], from: displayedMonth)
            var mapped: [Int: AttendanceStatus] = [:]

            for record in records where belongsToAthlete(record) {
                let dateComponents = calendar.dateComponents([.year, .month, .day], from: record.date)
                guard dateComponents.year == targetComponents.year,
                      dateComponents.month == targetComponents.month,
                      let day = dateComponents.day else {
                    continue
                }
                mapped[day] = record.status
            }

            statusesByDay = mapped
            errorMessage = nil
        } catch {
            if isCancellation(error) {
                return
            }
            statusesByDay = [:]
            errorMessage = error.localizedDescription
        }
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
    }

    private func belongsToAthlete(_ record: AttendanceRecord) -> Bool {
        if let athleteUserID = athlete.remoteUserID,
           !athleteUserID.isEmpty,
           record.athleteUserID == athleteUserID {
            return true
        }

        return record.athleteLocalID == athlete.id
    }

    private func color(for status: AttendanceStatus) -> Color {
        switch status {
        case .present:
            return AppTheme.Palette.success
        case .late:
            return .orange
        case .excused:
            return AppTheme.Palette.primary
        case .absent:
            return AppTheme.Palette.danger
        }
    }

    private static func startOfMonth(_ date: Date) -> Date {
        let calendar = Calendar.current
        return calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
    }
}

private struct GroupEditorSheet: View {
    private struct GroupColorOption: Identifiable {
        let name: String
        let hex: String

        var id: String { hex }
    }

    private static let palette: [GroupColorOption] = [
        GroupColorOption(name: "Blue", hex: "3B82F6"),
        GroupColorOption(name: "Green", hex: "22C55E"),
        GroupColorOption(name: "Red", hex: "EF4444"),
        GroupColorOption(name: "Orange", hex: "F59E0B"),
        GroupColorOption(name: "Purple", hex: "8B5CF6"),
        GroupColorOption(name: "Teal", hex: "14B8A6")
    ]

    @Environment(\.dismiss) private var dismiss
    @ObservedObject var localStore: LocalStore
    let group: TeamGroup?
    let onSave: () async -> Void

    @State private var name = ""
    @State private var colorHex = Self.palette.first?.hex ?? "3B82F6"
    @State private var selectedAthleteIDs: Set<String> = []
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Group") {
                    TextField("Name", text: $name)
                    Picker("Color", selection: $colorHex) {
                        ForEach(Self.palette) { option in
                            HStack {
                                Circle()
                                    .fill(Color(hex: option.hex))
                                    .frame(width: 10, height: 10)
                                Text(option.name)
                            }
                            .tag(option.hex)
                        }
                    }
                }

                Section("Athletes") {
                    if localStore.athletes.isEmpty {
                        Text("No athletes available yet.")
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    } else {
                        HStack {
                            Button("Select All") {
                                selectedAthleteIDs = Set(localStore.athletes.map(\.id))
                            }
                            .disabled(selectedAthleteIDs.count == localStore.athletes.count)

                            Spacer()

                            Button("Clear") {
                                selectedAthleteIDs.removeAll()
                            }
                            .disabled(selectedAthleteIDs.isEmpty)
                        }
                        .font(.subheadline.weight(.semibold))

                        ForEach(localStore.athletes) { athlete in
                            Button {
                                if selectedAthleteIDs.contains(athlete.id) {
                                    selectedAthleteIDs.remove(athlete.id)
                                } else {
                                    selectedAthleteIDs.insert(athlete.id)
                                }
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: selectedAthleteIDs.contains(athlete.id) ? "checkmark.square.fill" : "square")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundStyle(
                                            selectedAthleteIDs.contains(athlete.id)
                                            ? AppTheme.Palette.primary
                                            : AppTheme.Palette.textSecondary
                                        )

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(athlete.name)
                                            .foregroundStyle(AppTheme.Palette.textPrimary)

                                        if let groupID = athlete.groupID,
                                           let existingGroup = localStore.groups.first(where: { $0.id == groupID }) {
                                            Text("Currently in group \"\(existingGroup.name)\"")
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.Palette.textSecondary)
                                        }
                                    }

                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if group != nil {
                    Section {
                        Button("Delete Group", role: .destructive) {
                            showDeleteConfirmation = true
                        }
                    } footer: {
                        Text("Deleting a group removes it for everyone and unassigns its athletes.")
                    }
                }
            }
            .navigationTitle(group == nil ? "Add Group" : "Edit Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        Task {
                            if let group {
                                await localStore.updateGroup(groupID: group.id, name: name, colorHex: colorHex)
                                await localStore.setGroupMembers(groupID: group.id, athleteIDs: Array(selectedAthleteIDs))
                            } else {
                                let newGroup = await localStore.addGroup(name: name, colorHex: colorHex)
                                await localStore.setGroupMembers(groupID: newGroup.id, athleteIDs: Array(selectedAthleteIDs))
                            }
                            await onSave()
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .fontWeight(.bold)
                }
            }
            .task {
                guard let group else { return }
                if name.isEmpty {
                    name = group.name
                    colorHex = group.colorHex
                    selectedAthleteIDs = Set(localStore.athletes.filter { $0.groupID == group.id }.map(\.id))
                }
            }
            .alert("Delete Group?", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    guard let group else { return }
                    Task {
                        await localStore.deleteGroup(group.id)
                        await onSave()
                        dismiss()
                    }
                }
            } message: {
                Text("Are you sure you want to delete \"\(group?.name ?? "this group")\"? This cannot be undone.")
            }
        }
    }
}

private struct ChatBubbleRow: View {
    let message: ChatMessage
    let currentUserID: String

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 40) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 6) {
                if !isMine {
                    Text(message.senderName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.Palette.textSecondary)
                }

                if let imageURL = message.imageURL {
                    AsyncImage(url: imageURL) { phase in
                        switch phase {
                        case let .success(image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .failure:
                            ZStack {
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .fill(AppTheme.Palette.surface)
                                Image(systemName: "photo")
                                    .font(.system(size: 26, weight: .semibold))
                                    .foregroundStyle(AppTheme.Palette.textSecondary)
                            }
                        case .empty:
                            ZStack {
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .fill(AppTheme.Palette.surface)
                                ProgressView()
                            }
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .frame(width: 230, height: 230)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(AppTheme.Palette.border, lineWidth: 1)
                    )
                }

                if !trimmedBody.isEmpty {
                    Text(trimmedBody)
                        .font(.body)
                        .foregroundStyle(isMine ? Color.white : AppTheme.Palette.textPrimary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(isMine ? AppTheme.Palette.primary : AppTheme.Palette.elevatedSurface)
                        )
                }
            }
            .frame(maxWidth: 240, alignment: isMine ? .trailing : .leading)
            if !isMine { Spacer(minLength: 40) }
        }
    }

    private var isMine: Bool {
        message.senderUserID == currentUserID
    }

    private var trimmedBody: String {
        message.body.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private struct ChatComposerAttachment {
    let image: UIImage
    let upload: ChatAttachmentUpload
}

private struct CameraImagePicker: UIViewControllerRepresentable {
    let onImagePicked: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        picker.allowsEditing = false
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: CameraImagePicker

        init(parent: CameraImagePicker) {
            self.parent = parent
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                parent.onImagePicked(image)
            }
            parent.dismiss()
        }
    }
}
