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
    
    func resolveUsername(_ identifier: String) async -> String {
        let clean = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return clean }
        
        // Tier 1: If input already contains '@', use directly
        if clean.contains("@") {
            return clean
        }
        
        // Tier 2: Call the Cloud Function resolveAuthEmail via HTTP POST
        if let url = URL(string: "https://us-central1-trackapp-v2.cloudfunctions.net/resolveAuthEmail") {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 10
            
            let body = ["identifier": clean]
            if let httpBody = try? JSONSerialization.data(withJSONObject: body) {
                request.httpBody = httpBody
                do {
                    let (data, response) = try await URLSession.shared.data(for: request)
                    if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let resolvedEmail = json["email"] as? String,
                           !resolvedEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            return resolvedEmail.trimmingCharacters(in: .whitespacesAndNewlines)
                        }
                    }
                } catch {
                    print("HTTP resolveAuthEmail failed: \(error.localizedDescription)")
                }
            }
        }
        
        // Tier 3: Fallback domain
        return "\(clean.lowercased())@trackapp.org"
    }
}
