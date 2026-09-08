import Foundation
import UIKit
import FirebaseAuth
import FirebaseFirestore

struct UserActivityLogItem: Identifiable, Hashable {
    let id: String
    let userId: String
    let userEmail: String
    let eventType: String
    let details: String
    let timestamp: Date?
    let userAgent: String
    let platform: String
    
    var effectivePlatform: String {
        if !platform.isEmpty { return platform }
        if userAgent.lowercased().contains("ios") { return "iOS" }
        return "Web"
    }
    
    init(documentId: String, data: [String: Any]) {
        self.id = documentId
        self.userId = data["userId"] as? String ?? ""
        self.userEmail = data["userEmail"] as? String ?? (data["email"] as? String ?? "")
        self.eventType = data["eventType"] as? String ?? (data["action"] as? String ?? "UNKNOWN")
        self.details = data["details"] as? String ?? ""
        
        if let ts = data["timestamp"] as? Timestamp {
            self.timestamp = ts.dateValue()
        } else if let str = data["timestamp"] as? String {
            self.timestamp = ISO8601DateFormatter().date(from: str)
        } else {
            self.timestamp = nil
        }
        
        self.userAgent = data["userAgent"] as? String ?? ""
        self.platform = data["platform"] as? String ?? (self.userAgent.lowercased().contains("ios") ? "iOS" : "Web")
    }
}

class UserActivityLogger {
    static let shared = UserActivityLogger()
    
    /// Formatted iOS device User Agent matching web standards
    static var deviceUserAgent: String {
        let device = UIDevice.current
        let systemName = device.systemName
        let systemVersion = device.systemVersion
        let model = device.model
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.0.0"
        let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "2"
        return "iOS / RAF Tracking v\(appVersion) (\(buildNumber)) (\(model); \(systemName) \(systemVersion))"
    }
    
    /// Log an activity event to Firebase Firestore ('user_activity_logs' collection)
    static func logUserActivity(
        userId: String? = nil,
        userEmail: String? = nil,
        eventType: String,
        details: String = "",
        extra: [String: Any]? = nil
    ) {
        let currentAuth = Auth.auth().currentUser
        let resolvedUid = userId ?? currentAuth?.uid ?? "unknown"
        let resolvedEmail = userEmail ?? currentAuth?.email ?? ""
        
        var data: [String: Any] = [
            "userId": resolvedUid,
            "userEmail": resolvedEmail,
            "eventType": eventType,
            "details": details,
            "timestamp": FieldValue.serverTimestamp(),
            "userAgent": deviceUserAgent,
            "platform": "iOS"
        ]
        
        if let extra = extra {
            for (key, val) in extra {
                data[key] = val
            }
        }
        
        Task {
            do {
                let db = FirestoreService.shared.db
                try await db.collection("user_activity_logs").addDocument(data: data)
                #if DEBUG
                print("📝 [UserActivityLogger] Logged [\(eventType)]: \(details)")
                #endif
            } catch {
                print("❌ [UserActivityLogger] Failed to write log: \(error.localizedDescription)")
            }
        }
    }
    
    /// Fetch the most recent user activity logs from Firestore
    static func fetchRecentLogs(limit: Int = 100) async throws -> [UserActivityLogItem] {
        let db = FirestoreService.shared.db
        let snapshot = try await db.collection("user_activity_logs")
            .order(by: "timestamp", descending: true)
            .limit(to: limit)
            .getDocuments()
        
        return snapshot.documents.map { doc in
            UserActivityLogItem(documentId: doc.documentID, data: doc.data())
        }
    }
    
    /// Listen for real-time updates in user activity logs
    static func addLogsListener(limit: Int = 100, onUpdate: @escaping ([UserActivityLogItem]) -> Void) -> ListenerRegistration {
        let db = FirestoreService.shared.db
        return db.collection("user_activity_logs")
            .order(by: "timestamp", descending: true)
            .limit(to: limit)
            .addSnapshotListener { snapshot, error in
                guard let snapshot = snapshot else {
                    if let error = error {
                        print("Error listening to user activity logs: \(error.localizedDescription)")
                    }
                    return
                }
                
                let logs = snapshot.documents.map { doc in
                    UserActivityLogItem(documentId: doc.documentID, data: doc.data())
                }
                onUpdate(logs)
            }
    }
}
