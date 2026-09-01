import Foundation
import FirebaseAuth
import FirebaseFunctions

class AuthService {
    static let shared = AuthService()
    private init() {}
    
    var currentUser: FirebaseAuth.User? {
        Auth.auth().currentUser
    }
    
    func signIn(email: String, password: String) async throws -> FirebaseAuth.User {
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return result.user
    }
    
    func signOut() throws {
        try Auth.auth().signOut()
    }
    
    func changePassword(currentPassword: String, newPassword: String) async throws {
        guard let user = currentUser, let email = user.email else {
            throw NSError(domain: "AuthService", code: 401, userInfo: [NSLocalizedDescriptionKey: "No logged in user"])
        }
        
        let credential = EmailAuthProvider.credential(withEmail: email, password: currentPassword)
        try await user.reauthenticate(with: credential)
        try await user.updatePassword(to: newPassword)
    }
    
    func resolveUsername(_ identifier: String) async throws -> String {
        if identifier.contains("@") {
            return identifier
        }
        
        do {
            let functions = Functions.functions()
            let result = try await functions.httpsCallable("resolveAuthEmail").call(["identifier": identifier])
            if let data = result.data as? [String: Any], let resolvedEmail = data["email"] as? String {
                return resolvedEmail
            }
        } catch {
            print("Failed to resolve email via function, falling back: \(error)")
        }
        
        return "\(identifier)@trackapp.org"
    }
}
