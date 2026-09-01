import Foundation
import FirebaseAuth
import FirebaseFirestore

@MainActor
class SettingsViewModel: ObservableObject {
    @Published var fullName = ""
    @Published var email = ""
    @Published var language = "English"
    @Published var selectedTimezone = "System"
    @Published var darkMode = false
    @Published var currentPassword = ""
    @Published var newPassword = ""
    @Published var confirmPassword = ""
    @Published var isSaving = false
    @Published var saveMessage: String?
    @Published var saveError: String?
    
    let timezones = ["System", "UTC", "Asia/Qatar", "Asia/Riyadh", "Asia/Dubai", "Asia/Almaty"]
    
    func loadProfile(from profile: UserProfile?) {
        guard let profile = profile else { return }
        self.fullName = profile.fullName
        self.email = profile.email
        self.selectedTimezone = profile.timezone ?? "System"
    }
    
    func saveProfile(userId: String) async {
        isSaving = true
        saveError = nil
        saveMessage = nil
        
        do {
            let db = Firestore.firestore()
            try await db.collection("users").document(userId).setData([
                "fullName": fullName,
                "timezone": selectedTimezone
            ], merge: true)
            
            if let user = Auth.auth().currentUser {
                let request = user.createProfileChangeRequest()
                request.displayName = fullName
                try await request.commitChanges()
            }
            
            saveMessage = "Profile updated successfully."
        } catch {
            saveError = error.localizedDescription
        }
        
        isSaving = false
    }
    
    func changePassword() async {
        guard !currentPassword.isEmpty, !newPassword.isEmpty, !confirmPassword.isEmpty else {
            saveError = "Please fill in all password fields."
            return
        }
        
        guard newPassword == confirmPassword else {
            saveError = "New passwords do not match."
            return
        }
        
        guard newPassword.count >= 6 else {
            saveError = "Password must be at least 6 characters long."
            return
        }
        
        isSaving = true
        saveError = nil
        saveMessage = nil
        
        do {
            guard let user = Auth.auth().currentUser, let email = user.email else {
                saveError = "User not found."
                isSaving = false
                return
            }
            
            let credential = EmailAuthProvider.credential(withEmail: email, password: currentPassword)
            try await user.reauthenticate(with: credential)
            try await user.updatePassword(to: newPassword)
            
            saveMessage = "Password changed successfully."
            currentPassword = ""
            newPassword = ""
            confirmPassword = ""
        } catch {
            saveError = error.localizedDescription
        }
        
        isSaving = false
    }
    
    func signOut() throws {
        try AuthService.shared.signOut()
    }
}
