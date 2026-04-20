import SwiftUI
import AuthenticationServices
import UIKit

struct AuthScene: View {
    enum Mode: String, CaseIterable, Identifiable {
        case login = "Log In"
        case coachSignup = "Coach Sign Up"
        case athleteSignup = "Athlete Sign Up"

        var id: String { rawValue }
    }

    @ObservedObject var appModel: AppModel

    @State private var mode: Mode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var teamName = ""
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var phone = ""
    @State private var teamCode = ""
    @State private var age = ""
    @State private var grade = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var activeSocialAuthSession: ASWebAuthenticationSession?
    @State private var isPasswordResetPresented = false

    private let socialAuthCallbackScheme = "splittimeteamnative"
    private let socialAuthPresentationProvider = SocialAuthPresentationProvider()

    var body: some View {
        Form {
            Section {
                Picker("Mode", selection: $mode) {
                    ForEach(Mode.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            }

            if mode == .coachSignup {
                Section("Team") {
                    TextField("Team name", text: $teamName)
                }
            }

            if mode != .login {
                Section("Profile") {
                    TextField("First name", text: $firstName)
                    TextField("Last name", text: $lastName)
                    TextField("Phone", text: $phone)
                        .keyboardType(.phonePad)
                }
            }

            if mode == .athleteSignup {
                Section("Team Access") {
                    TextField("Team code", text: $teamCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }

                Section("Athlete Details") {
                    TextField("Age", text: $age)
                        .keyboardType(.numberPad)
                    TextField("Grade", text: $grade)
                }
            }

            Section("Credentials") {
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
                SecureField("Password", text: $password)
            }

            if mode == .login {
                Section("Sign In With") {
                    socialSignInButton(provider: .google, icon: "globe")
                    socialSignInButton(provider: .apple, icon: "apple.logo")
                    socialSignInButton(provider: .strava, icon: "figure.run")
                }

                Section {
                    Button("Forgot password?") {
                        isPasswordResetPresented = true
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.Palette.primary)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.Palette.danger)
                }
            }

            Section {
                Button(action: submit) {
                    if isSubmitting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text(primaryButtonTitle)
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSubmitting || !isFormValid)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("SplitTime Team")
        .sheet(isPresented: $isPasswordResetPresented) {
            PasswordResetSheet(
                appModel: appModel,
                initialEmail: email.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }
    }

    private var primaryButtonTitle: String {
        switch mode {
        case .login:
            return "Log In"
        case .coachSignup:
            return "Create Coach Account"
        case .athleteSignup:
            return "Join Team"
        }
    }

    private var isFormValid: Bool {
        let emailValid = !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let passwordValid = !password.isEmpty

        switch mode {
        case .login:
            return emailValid && passwordValid
        case .coachSignup:
            return emailValid
                && passwordValid
                && !teamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .athleteSignup:
            return emailValid
                && passwordValid
                && !teamCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && Int(age) != nil
                && !grade.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private func submit() {
        guard !isSubmitting else { return }

        errorMessage = nil
        isSubmitting = true

        Task {
            defer { isSubmitting = false }

            do {
                switch mode {
                case .login:
                    try await appModel.login(
                        email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                        password: password
                    )
                case .coachSignup:
                    try await appModel.signupCoach(
                        CoachSignupRequest(
                            teamName: teamName.trimmingCharacters(in: .whitespacesAndNewlines),
                            firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                            lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
                            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                            password: password,
                            phone: normalizedPhone
                        )
                    )
                case .athleteSignup:
                    try await appModel.signupAthlete(
                        AthleteSignupRequest(
                            teamCode: teamCode.trimmingCharacters(in: .whitespacesAndNewlines),
                            firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                            lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
                            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                            password: password,
                            phone: normalizedPhone,
                            age: Int(age) ?? 0,
                            grade: grade.trimmingCharacters(in: .whitespacesAndNewlines)
                        )
                    )
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private var normalizedPhone: String? {
        let trimmed = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    @ViewBuilder
    private func socialSignInButton(provider: SocialAuthProvider, icon: String) -> some View {
        Button {
            startSocialLogin(provider)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.headline)
                    .frame(width: 22, height: 22)
                Text("Continue with \(provider.displayName)")
                    .font(.headline)
                Spacer(minLength: 0)
            }
            .foregroundStyle(AppTheme.Palette.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 50)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(AppTheme.Palette.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(AppTheme.Palette.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }

    private func startSocialLogin(_ provider: SocialAuthProvider) {
        guard !isSubmitting else { return }

        errorMessage = nil
        isSubmitting = true

        Task {
            defer { isSubmitting = false }

            do {
                let start = try await appModel.startSocialLogin(provider: provider)
                await MainActor.run {
                    launchSocialAuthSession(start: start)
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func launchSocialAuthSession(start: SocialAuthStart) {
        let state = start.state
        let session = ASWebAuthenticationSession(
            url: start.authorizeURL,
            callbackURLScheme: socialAuthCallbackScheme
        ) { callbackURL, callbackError in
            Task { @MainActor in
                activeSocialAuthSession = nil

                if let callbackError {
                    if let authError = callbackError as? ASWebAuthenticationSessionError,
                       authError.code == .canceledLogin {
                        isSubmitting = false
                        return
                    }

                    isSubmitting = false
                    errorMessage = callbackError.localizedDescription
                    return
                }

                guard let callbackURL else {
                    isSubmitting = false
                    errorMessage = "Sign-in was cancelled."
                    return
                }

                completeSocialLoginFromCallbackURL(callbackURL, fallbackState: state)
            }
        }

        session.prefersEphemeralWebBrowserSession = true
        session.presentationContextProvider = socialAuthPresentationProvider

        guard session.start() else {
            isSubmitting = false
            errorMessage = "Could not start secure sign-in. Please try again."
            return
        }

        activeSocialAuthSession = session
    }

    private func completeSocialLoginFromCallbackURL(_ callbackURL: URL, fallbackState: String) {
        let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
        let items = components?.queryItems ?? []
        let serverError = items.first(where: { $0.name == "error" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines)
        let exchangeCode = items.first(where: { $0.name == "exchangeCode" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines)
        let state = items.first(where: { $0.name == "state" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? fallbackState

        if let serverError, !serverError.isEmpty {
            isSubmitting = false
            errorMessage = serverError
            return
        }

        if let exchangeCode, !exchangeCode.isEmpty {
            completeSocialLoginExchange(code: exchangeCode)
            return
        }

        completeSocialLoginAfterBrowserDismiss(state: state)
    }

    private func completeSocialLoginExchange(code: String) {
        isSubmitting = true

        Task {
            defer { isSubmitting = false }

            do {
                let maxAttempts = 10
                let retryDelayNanos: UInt64 = 500_000_000

                for attempt in 1 ... maxAttempts {
                    do {
                        try await appModel.completeSocialLogin(code: code)
                        return
                    } catch let apiError as APIError {
                        let shouldRetry = shouldRetrySocialExchange(error: apiError)
                        if shouldRetry && attempt < maxAttempts {
                            try await Task.sleep(nanoseconds: retryDelayNanos)
                            continue
                        }
                        throw apiError
                    } catch {
                        if attempt < maxAttempts {
                            try await Task.sleep(nanoseconds: retryDelayNanos)
                            continue
                        }
                        throw error
                    }
                }

                throw APIError.serverMessage("Could not complete sign-in. Please try again.")
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func shouldRetrySocialExchange(error: APIError) -> Bool {
        switch error {
        case .httpStatus(let status):
            return status >= 500
        case .transport:
            return true
        case .serverMessage(let message):
            let normalized = message.lowercased()
            return normalized.contains("invalid or already used")
                || normalized.contains("internal server error")
                || normalized.contains("request failed")
        default:
            return false
        }
    }

    private func completeSocialLoginAfterBrowserDismiss(state: String) {
        guard !isSubmitting else { return }

        errorMessage = nil
        isSubmitting = true

        Task {
            defer {
                isSubmitting = false
            }

            do {
                let timeoutNanos: UInt64 = 18_000_000_000
                let stepNanos: UInt64 = 600_000_000
                var elapsed: UInt64 = 0

                while elapsed < timeoutNanos {
                    let poll = try await appModel.pollSocialLogin(state: state)

                    if let error = poll.errorMessage, !error.isEmpty {
                        throw APIError.serverMessage(error)
                    }

                    if let exchangeCode = poll.exchangeCode, !exchangeCode.isEmpty {
                        try await appModel.completeSocialLogin(code: exchangeCode)
                        return
                    }

                    if !poll.isPending {
                        break
                    }

                    try await Task.sleep(nanoseconds: stepNanos)
                    elapsed += stepNanos
                }

                throw APIError.serverMessage("Sign-in was not completed. Please try again.")
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

private final class SocialAuthPresentationProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}

private struct PasswordResetSheet: View {
    @Environment(\.dismiss) private var dismiss

    @ObservedObject var appModel: AppModel
    @State private var email: String
    @State private var code = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var hasRequestedCode = false
    @State private var isSubmitting = false
    @State private var infoMessage: String?
    @State private var errorMessage: String?

    init(appModel: AppModel, initialEmail: String) {
        self.appModel = appModel
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Account Email") {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                }

                Section {
                    Button {
                        requestCode()
                    } label: {
                        if isSubmitting && !hasRequestedCode {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Send Reset Code")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isSubmitting || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                if hasRequestedCode {
                    Section("Reset Password") {
                        TextField("6-digit code", text: $code)
                            .keyboardType(.numberPad)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("New password", text: $newPassword)
                        SecureField("Confirm new password", text: $confirmPassword)
                    }

                    Section {
                        Button {
                            confirmReset()
                        } label: {
                            if isSubmitting {
                                ProgressView().frame(maxWidth: .infinity)
                            } else {
                                Text("Reset Password")
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isSubmitting || !isResetFormValid)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    }
                }

                if let infoMessage {
                    Section {
                        Text(infoMessage)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.Palette.textSecondary)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.Palette.danger)
                    }
                }
            }
            .navigationTitle("Forgot Password")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var isResetFormValid: Bool {
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmedCode.isEmpty
            && newPassword.count >= 6
            && confirmPassword == newPassword
            && !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func requestCode() {
        guard !isSubmitting else { return }

        errorMessage = nil
        infoMessage = nil
        isSubmitting = true
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        Task {
            defer { isSubmitting = false }

            do {
                try await appModel.requestPasswordReset(email: normalizedEmail)
                await MainActor.run {
                    hasRequestedCode = true
                    infoMessage = "If the account exists, a reset code has been sent to that email."
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func confirmReset() {
        guard !isSubmitting, isResetFormValid else { return }

        errorMessage = nil
        infoMessage = nil
        isSubmitting = true

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)

        Task {
            defer { isSubmitting = false }

            do {
                try await appModel.confirmPasswordReset(
                    email: normalizedEmail,
                    code: normalizedCode,
                    newPassword: newPassword
                )
                await MainActor.run {
                    infoMessage = "Password reset successful. You can now log in."
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

struct OnboardingScene: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            Image(systemName: "figure.run.circle.fill")
                .font(.system(size: 82))
                .foregroundStyle(AppTheme.Palette.primary)

            VStack(spacing: 10) {
                Text("Welcome to SplitTime Team")
                    .font(.largeTitle.weight(.bold))
                    .multilineTextAlignment(.center)

                Text("This native rewrite starts from the same product you already built: coach and athlete roles, shared schedule, team communication, workouts, and timing.")
                    .font(.body)
                    .foregroundStyle(AppTheme.Palette.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            Button("Continue", action: onContinue)
                .buttonStyle(PrimaryButtonStyle())
        }
        .padding(AppTheme.Metrics.screenPadding)
        .background(AppTheme.Palette.background.ignoresSafeArea())
    }
}
