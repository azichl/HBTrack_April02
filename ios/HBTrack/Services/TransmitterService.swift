import Foundation
import FirebaseFirestore
import UIKit

class TransmitterService {
    static let shared = TransmitterService()
    private init() {}
    
    // In-memory caching
    private var cachedTransmitters: [Transmitter]?
    private var cachedBirds: [Bird]?
    private var cachedPositions: [Position]?
    private var cachedAlerts: [Alert]?
    private var lastCacheTime: Date?
    private let cacheTTL: TimeInterval = 300 // 5 minutes
    
    func invalidateCache() {
        cachedTransmitters = nil
        cachedBirds = nil
        cachedPositions = nil
        cachedAlerts = nil
        lastCacheTime = nil
    }
    
    func fetchAllTransmitters(forceRefresh: Bool = false) async throws -> [Transmitter] {
        if !forceRefresh, let cached = cachedTransmitters, let last = lastCacheTime, Date().timeIntervalSince(last) < cacheTTL {
            return cached
        }
        
        let transmitters: [Transmitter] = try await FirestoreService.shared.getDocuments(collection: "transmitters")
        self.cachedTransmitters = transmitters
        self.lastCacheTime = Date()
        return transmitters
    }
    
    func fetchAllBirds(forceRefresh: Bool = false) async throws -> [Bird] {
        if !forceRefresh, let cached = cachedBirds, let last = lastCacheTime, Date().timeIntervalSince(last) < cacheTTL {
            return cached
        }
        
        let birds: [Bird] = try await FirestoreService.shared.getDocuments(collection: "birds")
        self.cachedBirds = birds
        return birds
    }
    
    func fetchLatestPositions(forceRefresh: Bool = false) async throws -> [Position] {
        if !forceRefresh, let cached = cachedPositions, let last = lastCacheTime, Date().timeIntervalSince(last) < cacheTTL {
            return cached
        }
        
        // Query recent positions limit to avoid freezing on massive datasets
        let snapshot = try await FirestoreService.shared.db
            .collection("positions")
            .order(by: "timestamp", descending: true)
            .limit(to: 300)
            .getDocuments()
        
        let positions = snapshot.documents.compactMap { try? $0.data(as: Position.self, decoder: Firestore.Decoder()) }
        self.cachedPositions = positions
        return positions
    }
    
    func fetchHistoricalPositions(transmitterId: String, startDate: Date, endDate: Date, locationType: String?) async throws -> [Position] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let startStr = formatter.string(from: startDate)
        let endStr = formatter.string(from: endDate)
        
        var query: Query = FirestoreService.shared.db.collection("positions")
            .whereField("transmitter_id", isEqualTo: transmitterId)
            .whereField("timestamp", isGreaterThanOrEqualTo: startStr)
            .whereField("timestamp", isLessThanOrEqualTo: endStr)
            
        if let locType = locationType, locType != "all", locType != "All" {
            query = query.whereField("locationType", isEqualTo: locType)
        }
        
        let snapshot = try await query.order(by: "timestamp", descending: false).limit(to: 1000).getDocuments()
        return snapshot.documents.compactMap { try? $0.data(as: Position.self, decoder: Firestore.Decoder()) }
    }
    
    func subscribeToPositions(onChange: @escaping ([Position]) -> Void) -> ListenerRegistration {
        return FirestoreService.shared.db
            .collection("positions")
            .order(by: "timestamp", descending: true)
            .limit(to: 50)
            .addSnapshotListener { snapshot, error in
                guard let documents = snapshot?.documents else { return }
                let positions = documents.compactMap { try? $0.data(as: Position.self, decoder: Firestore.Decoder()) }
                onChange(positions)
            }
    }
    
    func fetchAlerts(forceRefresh: Bool = false) async throws -> [Alert] {
        if !forceRefresh, let cached = cachedAlerts, let last = lastCacheTime, Date().timeIntervalSince(last) < cacheTTL {
            return cached
        }
        
        let snapshot = try await FirestoreService.shared.db
            .collection("alerts")
            .whereField("status", isEqualTo: "active")
            .limit(to: 50)
            .getDocuments()
            
        let alerts = snapshot.documents.compactMap { try? $0.data(as: Alert.self, decoder: Firestore.Decoder()) }
        self.cachedAlerts = alerts
        return alerts
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
        
        invalidateCache()
    }
    
    func unmarkTransmitterDead(transmitterId: String) async throws {
        let db = FirestoreService.shared.db
        let docRef = db.collection("transmitters").document(transmitterId)
        try await docRef.updateData([
            "derived_status": "Active"
        ])
        invalidateCache()
    }
}
