import Foundation
import FirebaseFirestore
import UIKit
import CoreLocation

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
    
    /**
     * Fetches the latest positions for ALL transmitters in the database.
     * Searches both `positions` and `argos_positions` collections across string & numeric IDs,
     * and seamlessly falls back to direct transmitter coordinates when available.
     */
    func fetchLatestPositionsPerTransmitter(for transmitters: [Transmitter], forceRefresh: Bool = false) async throws -> [Position] {
        if !forceRefresh, let cached = cachedPositions, let last = lastCacheTime, Date().timeIntervalSince(last) < cacheTTL {
            return cached
        }
        
        let db = FirestoreService.shared.db
        
        // Execute parallel lookups for all transmitters with concurrency
        let positions = await withTaskGroup(of: Position?.self, returning: [Position].self) { group in
            for transmitter in transmitters {
                let pid = transmitter.platform_id.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !pid.isEmpty else { continue }
                let docId = transmitter.id ?? pid
                
                group.addTask {
                    let decoder = Firestore.Decoder()
                    
                    // 1. Check `positions` collection by transmitter_id (string)
                    if let snap = try? await db.collection("positions")
                        .whereField("transmitter_id", isEqualTo: pid)
                        .order(by: "timestamp", descending: true)
                        .limit(to: 1)
                        .getDocuments(),
                       let doc = snap.documents.first,
                       let pos = try? doc.data(as: Position.self, decoder: decoder),
                       pos.lat != 0, pos.lon != 0 {
                        return pos
                    }
                    
                    // 2. Check `positions` collection by transmitter_id (numeric)
                    if let numId = Int(pid),
                       let snap = try? await db.collection("positions")
                        .whereField("transmitter_id", isEqualTo: numId)
                        .order(by: "timestamp", descending: true)
                        .limit(to: 1)
                        .getDocuments(),
                       let doc = snap.documents.first,
                       let pos = try? doc.data(as: Position.self, decoder: decoder),
                       pos.lat != 0, pos.lon != 0 {
                        return pos
                    }
                    
                    // 3. Check `positions` collection by platformId
                    if let snap = try? await db.collection("positions")
                        .whereField("platformId", isEqualTo: pid)
                        .order(by: "timestamp", descending: true)
                        .limit(to: 1)
                        .getDocuments(),
                       let doc = snap.documents.first,
                       let pos = try? doc.data(as: Position.self, decoder: decoder),
                       pos.lat != 0, pos.lon != 0 {
                        return pos
                    }
                    
                    // 4. Check `argos_positions` collection by platformId (string)
                    if let snap = try? await db.collection("argos_positions")
                        .whereField("platformId", isEqualTo: pid)
                        .order(by: "timestamp", descending: true)
                        .limit(to: 1)
                        .getDocuments(),
                       let doc = snap.documents.first,
                       let pos = try? doc.data(as: Position.self, decoder: decoder),
                       pos.lat != 0, pos.lon != 0 {
                        return pos
                    }

                    // 5. Check `argos_positions` collection by platformId (numeric)
                    if let numId = Int(pid),
                       let snap = try? await db.collection("argos_positions")
                        .whereField("platformId", isEqualTo: numId)
                        .order(by: "timestamp", descending: true)
                        .limit(to: 1)
                        .getDocuments(),
                       let doc = snap.documents.first,
                       let pos = try? doc.data(as: Position.self, decoder: decoder),
                       pos.lat != 0, pos.lon != 0 {
                        return pos
                    }

                    // 6. Check `argos_positions` collection by transmitter_id
                    if let snap = try? await db.collection("argos_positions")
                        .whereField("transmitter_id", isEqualTo: pid)
                        .order(by: "timestamp", descending: true)
                        .limit(to: 1)
                        .getDocuments(),
                       let doc = snap.documents.first,
                       let pos = try? doc.data(as: Position.self, decoder: decoder),
                       pos.lat != 0, pos.lon != 0 {
                        return pos
                    }
                    
                    // 7. Fallback to direct coordinate on the transmitter document itself
                    if let directCoord = transmitter.directCoordinate {
                        return Position(
                            id: "tx-direct-\(docId)",
                            transmitter_id: pid,
                            platformId: pid,
                            timestamp: transmitter.last_fix ?? ISO8601DateFormatter().string(from: Date()),
                            lat: directCoord.latitude,
                            lon: directCoord.longitude,
                            lc: "3",
                            is_kalman: false,
                            speed_kmh: 0,
                            course: 0,
                            satellite: "GPS",
                            locationType: "GPS"
                        )
                    }
                    
                    return nil
                }
            }
            
            var collected: [Position] = []
            for await pos in group {
                if let valid = pos {
                    collected.append(valid)
                }
            }
            return collected
        }
        
        self.cachedPositions = positions
        self.lastCacheTime = Date()
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
        var positions = snapshot.documents.compactMap { try? $0.data(as: Position.self, decoder: Firestore.Decoder()) }
        
        // If empty in `positions`, check `argos_positions`
        if positions.isEmpty {
            let argosSnap = try await FirestoreService.shared.db.collection("argos_positions")
                .whereField("platformId", isEqualTo: transmitterId)
                .whereField("timestamp", isGreaterThanOrEqualTo: startStr)
                .whereField("timestamp", isLessThanOrEqualTo: endStr)
                .order(by: "timestamp", descending: false)
                .limit(to: 1000)
                .getDocuments()
            positions = argosSnap.documents.compactMap { try? $0.data(as: Position.self, decoder: Firestore.Decoder()) }
        }
        
        return positions
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
