import Foundation
import FirebaseAuth
import FirebaseFirestore

@MainActor
class AuthViewModel: ObservableObject {
    @Published var currentUser: FirebaseAuth.User?
    @Published var userProfile: UserProfile?
    @Published var isAuthenticated: Bool = false
    @Published var isLoading: Bool = false
    @Published var authError: String?
    
    var currentUserRole: String {
        userProfile?.role ?? "Viewer"
    }
    
    private var authListenerHandle: AuthStateDidChangeListenerHandle?
    
    init() {
        listenForAuthChanges()
    }
    
    deinit {
        if let handle = authListenerHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
    }
    
    func login(identifier: String, password: String) async {
        let cleanId = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanId.isEmpty else {
            self.authError = "Please enter your username or email."
            return
        }
        
        isLoading = true
        authError = nil
        
        do {
            var targetEmail = cleanId
            var signedInUser: FirebaseAuth.User? = nil
            
            // Tier 1: If input contains '@', try direct login first
            if cleanId.contains("@") {
                do {
                    signedInUser = try await AuthService.shared.signIn(email: cleanId, password: password)
                } catch {
                    print("Direct email sign in failed, trying resolver: \(error.localizedDescription)")
                }
            }
            
            // Tier 2: If not signed in yet, resolve identifier to email
            if signedInUser == nil {
                targetEmail = await AuthService.shared.resolveUsername(cleanId)
                signedInUser = try await AuthService.shared.signIn(email: targetEmail, password: password)
            }
            
            guard let user = signedInUser else {
                throw NSError(domain: "Auth", code: -1, userInfo: [NSLocalizedDescriptionKey: "Authentication failed."])
            }
            
            self.currentUser = user
            await loadUserProfile()
            
            // Validate App Access (matches web App.tsx logic)
            let profile = self.userProfile ?? createFallbackProfile(for: user)
            self.userProfile = profile
            
            let appAccess = profile.appAccess ?? ["web", "ios"]
            if !appAccess.isEmpty && !appAccess.contains("ios") && !appAccess.contains("web") {
                try? AuthService.shared.signOut()
                self.authError = "Account not authorized for iOS access."
                self.isAuthenticated = false
                self.currentUser = nil
                self.userProfile = nil
            } else {
                self.isAuthenticated = true
                self.authError = nil
            }
        } catch let err as NSError {
            print("Login error: \(err.localizedDescription) [code: \(err.code)]")
            if err.code == AuthErrorCode.wrongPassword.rawValue ||
               err.code == AuthErrorCode.userNotFound.rawValue ||
               err.code == AuthErrorCode.invalidCredential.rawValue ||
               err.code == AuthErrorCode.invalidEmail.rawValue {
                self.authError = "Invalid username or password. Please try again."
            } else if err.code == AuthErrorCode.keychainError.rawValue || err.localizedDescription.lowercased().contains("keychain") {
                self.authError = "Keychain access error. Please restart the app or ensure Keychain Sharing is active."
            } else {
                self.authError = err.localizedDescription
            }
            self.isAuthenticated = false
        }
        
        isLoading = false
    }
    
    func logout() {
        do {
            try AuthService.shared.signOut()
            self.currentUser = nil
            self.userProfile = nil
            self.isAuthenticated = false
        } catch {
            self.authError = error.localizedDescription
        }
    }
    
    func loadUserProfile() async {
        guard let user = currentUser else { return }
        let uid = user.uid
        
        do {
            let docSnap = try await Firestore.firestore().collection("users").document(uid).getDocument()
            if docSnap.exists, let profile = try? docSnap.data(as: UserProfile.self) {
                self.userProfile = profile
            } else {
                self.userProfile = createFallbackProfile(for: user)
            }
        } catch {
            print("Error loading user profile: \(error.localizedDescription)")
            self.userProfile = createFallbackProfile(for: user)
        }
    }
    
    private func createFallbackProfile(for user: FirebaseAuth.User) -> UserProfile {
        let isDefaultAdmin = (user.email == "admin@houbaratracker.com")
        return UserProfile(
            id: user.uid,
            name: user.displayName ?? user.email ?? "User",
            email: user.email ?? "",
            role: isDefaultAdmin ? "Administrator" : "Viewer",
            status: "active",
            permissions: isDefaultAdmin ? ["View Data", "Upload Data", "Manage Database", "Manage Users", "Live Tracking", "Generate Reports", "Manage Alerts", "Manage Transmitters", "API Integration", "System Settings"] : ["View Data", "Live Tracking"],
            appAccess: ["web", "ios", "ios_data_upload"],
            iosDataUpload: true,
            iosPttVisibility: "all",
            iosVisiblePtts: []
        )
    }
    
    func listenForAuthChanges() {
        authListenerHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self = self else { return }
            Task { @MainActor in
                self.currentUser = user
                if let user = user {
                    await self.loadUserProfile()
                    let profile = self.userProfile ?? self.createFallbackProfile(for: user)
                    let appAccess = profile.appAccess ?? ["web", "ios"]
                    if appAccess.isEmpty || appAccess.contains("ios") || appAccess.contains("web") {
                        self.isAuthenticated = true
                    } else {
                        self.isAuthenticated = false
                    }
                } else {
                    self.isAuthenticated = false
                    self.userProfile = nil
                }
            }
        }
    }
    
    func hasPermission(_ permission: String) -> Bool {
        guard let profile = userProfile else { return false }
        if profile.role == "Administrator" { return true }
        return profile.permissions.contains(permission)
    }
    
    var canUploadData: Bool {
        guard let profile = userProfile else { return false }
        let isManager = (profile.role == "Manager" || profile.role == "Administrator")
        let hasIosDataUpload = (profile.iosDataUpload == true)
        let hasAccess = (profile.appAccess ?? []).contains("ios_data_upload")
        
        return isManager || hasIosDataUpload || hasAccess
    }
    
    var canMarkDead: Bool {
        guard let role = userProfile?.role else { return false }
        return role == "Administrator" || role == "Researcher" || role == "Field Coordinator"
    }
    
    func isTransmitterVisible(_ platformId: String) -> Bool {
        guard let profile = userProfile else { return false }
        if profile.role == "Administrator" || profile.role == "Manager" { return true }
        if profile.iosPttVisibility == "custom", let visibleList = profile.iosVisiblePtts, !visibleList.isEmpty {
            return visibleList.contains(platformId)
        }
        return true
    }
}
