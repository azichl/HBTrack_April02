import Foundation
import UIKit
import FirebaseFirestore

class UserActivityLogger {
    static var userAgent: String {
        let device = UIDevice.current
        let model = device.model
        let systemVersion = device.systemVersion
        return "iOS (HBTrack; \(model); iOS \(systemVersion))"
    }
    
    static func logUserActivity(
        userId: String,
        userEmail: String,
        eventType: String,
        details: String = ""
    ) {
        let data: [String: Any] = [
            "userId": userId,
            "userEmail": userEmail,
            "eventType": eventType,
            "details": details,
            "timestamp": FieldValue.serverTimestamp(),
            "userAgent": userAgent
        ]
        
        let db = FirestoreService.shared.db
        Task {
            do {
                try await db.collection("user_activity_logs").addDocument(data: data)
            } catch {
                print("Failed to log user activity: \(error.localizedDescription)")
            }
        }
    }
}
