import Foundation
import FirebaseFirestore

class UserActivityLogger {
    static func log(userId: String, email: String, action: String, details: String) async {
        let db = FirestoreService.shared.db
        let formatter = ISO8601DateFormatter()
        let timestamp = formatter.string(from: Date())
        
        let data: [String: Any] = [
            "userId": userId,
            "email": email,
            "action": action,
            "details": details,
            "timestamp": timestamp,
            "platform": "ios"
        ]
        
        do {
            try await db.collection("user_activity_logs").addDocument(data: data)
        } catch {
            print("Failed to log user activity: \(error)")
        }
    }
}
