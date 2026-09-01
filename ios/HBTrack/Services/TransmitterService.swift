import Foundation
import FirebaseFirestore

class TransmitterService {
    static let shared = TransmitterService()
    private init() {}
    
    func fetchAllTransmitters() async throws -> [Transmitter] {
        return try await FirestoreService.shared.getDocuments(collection: "transmitters")
    }
    
    func fetchAllBirds() async throws -> [Bird] {
        return try await FirestoreService.shared.getDocuments(collection: "birds")
    }
    
    func fetchLatestPositions() async throws -> [Position] {
        return try await FirestoreService.shared.getDocuments(collection: "positions")
    }
    
    func fetchHistoricalPositions(transmitterId: String, startDate: Date, endDate: Date, locationType: String?) async throws -> [Position] {
        var query: Query = FirestoreService.shared.db.collection("positions")
            .whereField("transmitter_id", isEqualTo: transmitterId)
            .whereField("timestamp", isGreaterThanOrEqualTo: startDate)
            .whereField("timestamp", isLessThanOrEqualTo: endDate)
            
        if let locType = locationType {
            query = query.whereField("location_type", isEqualTo: locType)
        }
        
        let snapshot = try await query.order(by: "timestamp", descending: false).getDocuments()
        return snapshot.documents.compactMap { try? $0.data(as: Position.self, decoder: Firestore.Decoder()) }
    }
    
    func subscribeToPositions(onChange: @escaping ([Position]) -> Void) -> ListenerRegistration {
        return FirestoreService.shared.addSnapshotListener(collection: "positions", onChange: onChange)
    }
    
    func fetchAlerts() async throws -> [Alert] {
        return try await FirestoreService.shared.getDocuments(collection: "alerts", whereField: "status", isEqualTo: "active")
    }
    
    func markTransmitterDead(transmitterId: String, userId: String, userEmail: String, userRole: String) async throws {
        let db = FirestoreService.shared.db
        let docRef = db.collection("transmitters").document(transmitterId)
        
        let historyEntry: [String: Any] = [
            "status": "Dead",
            "changed_by": userId,
            "changed_by_email": userEmail,
            "changed_by_role": userRole,
            "timestamp": Timestamp(date: Date()),
            "reason": "Marked dead via iOS App"
        ]
        
        try await docRef.updateData([
            "derived_status": "Dead",
            "status_history": FieldValue.arrayUnion([historyEntry])
        ])
    }
    
    func unmarkTransmitterDead(transmitterId: String) async throws {
        let db = FirestoreService.shared.db
        let docRef = db.collection("transmitters").document(transmitterId)
        try await docRef.updateData([
            "derived_status": "Active"
        ])
    }
}
