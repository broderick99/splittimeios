import SwiftUI

struct WorkoutsScene: View {
    enum Section: String, CaseIterable {
        case templates = "Templates"
        case history = "History"
    }

    @ObservedObject var localStore: LocalStore
    let role: UserRole
    let teamService: any TeamServiceProtocol
    @State private var section: Section = .templates
    @State private var showNewTemplate = false
    @State private var editingTemplate: TemplateRoute?
    @State private var selectedWorkout: WorkoutRoute?
    @State private var deleteTarget: WorkoutRoute?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(spacing: 0) {
                topNavigationBar

                TopTabBar(
                    options: Section.allCases,
                    selection: $section,
                    title: { $0.rawValue }
                )

                Group {
                    switch section {
                    case .templates:
                        templatesList
                    case .history:
                        historyList
                    }
                }
            }

            if section == .templates {
                FloatingAddButton {
                    showNewTemplate = true
                }
                .padding(.trailing, 20)
                .padding(.bottom, 18)
            }
        }
        .background(AppTheme.Palette.background)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await refreshTemplatesFromCloud()
        }
        .navigationDestination(isPresented: $showNewTemplate) {
            TemplateEditorScene(localStore: localStore, templateID: nil) {
                await syncTemplatesToCloud()
            }
        }
        .navigationDestination(item: $editingTemplate) { route in
            TemplateEditorScene(localStore: localStore, templateID: route.id) {
                await syncTemplatesToCloud()
            }
        }
        .navigationDestination(item: $selectedWorkout) { route in
            WorkoutDetailScene(localStore: localStore, workoutID: route.id)
        }
        .alert("Delete Workout?", isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                if let deleteTarget {
                    Task {
                        await localStore.deleteWorkout(deleteTarget.id)
                        self.deleteTarget = nil
                    }
                }
            }
        } message: {
            Text("This workout and its results will be permanently removed.")
        }
    }

    private var topNavigationBar: some View {
        HStack(spacing: 12) {
            Color.clear
                .frame(width: 34, height: 34)

            Spacer(minLength: 8)

            Text("Workouts")
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

    private var templatesList: some View {
        Group {
            if localStore.templateSummaries.isEmpty {
                ContentUnavailableView(
                    "No Workouts",
                    systemImage: "list.clipboard",
                    description: Text("Create a structured workout to get started.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 14) {
                        ForEach(localStore.templateSummaries) { template in
                            Button {
                                editingTemplate = TemplateRoute(id: template.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Image(systemName: "clipboard")
                                            .foregroundStyle(AppTheme.Palette.primary)
                                        Text(template.name)
                                            .font(.headline)
                                            .foregroundStyle(AppTheme.Palette.textPrimary)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(AppTheme.Palette.textSecondary)
                                    }
                                    Text("\(template.stepCount) step\(template.stepCount == 1 ? "" : "s")")
                                        .font(.subheadline)
                                        .foregroundStyle(AppTheme.Palette.textSecondary)
                                    Text("Updated \(template.updatedAt.formatted(date: .abbreviated, time: .shortened))")
                                        .font(.footnote)
                                        .foregroundStyle(AppTheme.Palette.textSecondary)
                                }
                                .appCard()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(AppTheme.Metrics.screenPadding)
                    .padding(.bottom, 90)
                }
                .refreshable {
                    await refreshTemplatesFromCloud()
                }
            }
        }
    }

    private var historyList: some View {
        Group {
            if localStore.workoutSummaries.isEmpty {
                ContentUnavailableView(
                    "No Workout History",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Saved workouts will appear here.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 14) {
                        ForEach(localStore.workoutSummaries) { workout in
                            HStack(spacing: 12) {
                                Button {
                                    selectedWorkout = WorkoutRoute(id: workout.id)
                                } label: {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(workout.name)
                                            .font(.headline)
                                            .foregroundStyle(AppTheme.Palette.textPrimary)
                                        Text(workout.date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()))
                                            .font(.subheadline)
                                            .foregroundStyle(AppTheme.Palette.textSecondary)
                                        Text("\(workout.athleteCount) athlete\(workout.athleteCount == 1 ? "" : "s")")
                                            .font(.footnote)
                                            .foregroundStyle(AppTheme.Palette.textSecondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .appCard()
                                }
                                .buttonStyle(.plain)

                                Button(role: .destructive) {
                                    deleteTarget = WorkoutRoute(id: workout.id)
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.headline)
                                }
                            }
                        }
                    }
                    .padding(AppTheme.Metrics.screenPadding)
                }
            }
        }
    }

    private func refreshTemplatesFromCloud() async {
        do {
            let snapshot = try await teamService.fetchTemplateLibrary()
            await localStore.applyRemoteTemplateLibrary(snapshot)
        } catch {
            // Keep local templates when backend fetch is unavailable.
        }
    }

    private func syncTemplatesToCloud() async {
        guard role == .coach else {
            await refreshTemplatesFromCloud()
            return
        }

        do {
            let synced = try await teamService.syncTemplateLibrary(localStore.templateLibrarySnapshot)
            await localStore.applyRemoteTemplateLibrary(synced)
        } catch {
            // Keep local edits even if cloud sync fails; next sync can reconcile.
        }
    }
}

struct TemplateRoute: Identifiable, Hashable {
    let id: String
}

struct WorkoutRoute: Identifiable, Hashable {
    let id: String
}
