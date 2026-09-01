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
    
    init() {
        listenForAuthChanges()
    }
    
    func login(identifier: String, password: String) async {
        isLoading = true
        authError = nil
        
        do {
            let resolvedEmail = try await AuthService.shared.resolveUsername(identifier)
            let user = try await AuthService.shared.signIn(email: resolvedEmail, password: password)
            self.currentUser = user
            await loadUserProfile()
            
            if let profile = self.userProfile {
                let access = profile.appAccess ?? []
                if !access.contains("ios") {
                    try AuthService.shared.signOut()
                    self.authError = "App access denied for iOS."
                    self.isAuthenticated = false
                    self.currentUser = nil
                    self.userProfile = nil
                } else {
                    self.isAuthenticated = true
                }
            } else {
                self.authError = "User profile not found."
            }
        } catch {
            self.authError = error.localizedDescription
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
        guard let uid = currentUser?.uid else { return }
        do {
            let profile: UserProfile? = try await FirestoreService.shared.getDocument(collection: "users", documentId: uid)
            self.userProfile = profile
        } catch {
            print("Error loading user profile: \(error)")
        }
    }
    
    func listenForAuthChanges() {
        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self = self else { return }
            Task { @MainActor in
                self.currentUser = user
                if user != nil {
                    await self.loadUserProfile()
                    if let profile = self.userProfile, (profile.appAccess ?? []).contains("ios") {
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
        let isManager = profile.role == "Manager"
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
