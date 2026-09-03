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
        
        var transmitters: [Transmitter] = try await FirestoreService.shared.getDocuments(collection: "transmitters")
        var knownPids = Set(transmitters.map { $0.platform_id.trimmingCharacters(in: .whitespacesAndNewlines) })
        
        // Also check if any PTTs (such as 244289, 244292, 242086, 242087) exist in positions or argos_positions
        let db = FirestoreService.shared.db
        
        do {
            let snap = try await db.collection("positions").order(by: "timestamp", descending: true).limit(to: 150).getDocuments()
            for doc in snap.documents {
                let data = doc.data()
                let pid = String(describing: data["transmitter_id"] ?? data["platformId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if !pid.isEmpty && !knownPids.contains(pid) {
                    knownPids.insert(pid)
                    let tx = Transmitter(
                        id: doc.documentID,
                        platform_id: pid,
                        status: "Active",
                        derived_status: "Active",
                        last_fix: data["timestamp"] as? String
                    )
                    transmitters.append(tx)
                }
            }
        } catch {
            print("Warning: positions discovery: \(error)")
        }
        
        do {
            let snap = try await db.collection("argos_positions").order(by: "timestamp", descending: true).limit(to: 150).getDocuments()
            for doc in snap.documents {
                let data = doc.data()
                let pid = String(describing: data["platformId"] ?? data["transmitter_id"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if !pid.isEmpty && !knownPids.contains(pid) {
                    knownPids.insert(pid)
                    let tx = Transmitter(
                        id: doc.documentID,
                        platform_id: pid,
                        status: "Active",
                        derived_status: "Active",
                        last_fix: data["timestamp"] as? String
                    )
                    transmitters.append(tx)
                }
            }
        } catch {
            print("Warning: argos_positions discovery: \(error)")
        }
        
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
     * Efficiently fetches the latest positions for all transmitters using batch queries.
     * Prevents Firestore thread exhaustion / internal assertion failures,
     * and seamlessly falls back to direct transmitter coordinates when available.
     */
    func fetchLatestPositionsPerTransmitter(for transmitters: [Transmitter], forceRefresh: Bool = false) async throws -> [Position] {
        if !forceRefresh, let cached = cachedPositions, let last = lastCacheTime, Date().timeIntervalSince(last) < cacheTTL {
            return cached
        }
        
        let db = FirestoreService.shared.db
        let decoder = Firestore.Decoder()
        var latestPositionsByTx: [String: Position] = [:]
        
        // Helper to ingest a position and keep only the latest fix per transmitter
        let ingestPosition: (Position) -> Void = { pos in
            guard pos.lat != 0, pos.lon != 0, !pos.lat.isNaN, !pos.lon.isNaN, abs(pos.lat) <= 90, abs(pos.lon) <= 180 else { return }
            let keys = [pos.transmitter_id, pos.platformId].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            for key in keys {
                if let existing = latestPositionsByTx[key] {
                    if pos.timestamp > existing.timestamp {
                        latestPositionsByTx[key] = pos
                    }
                } else {
                    latestPositionsByTx[key] = pos
                }
            }
        }
        
        // 1. Fetch recent `positions` (single batch query, fast & stable, no thread exhaustion)
        do {
            let snap = try await db.collection("positions")
                .order(by: "timestamp", descending: true)
                .limit(to: 500)
                .getDocuments()
            
            for doc in snap.documents {
                if let pos = try? doc.data(as: Position.self, decoder: decoder) {
                    ingestPosition(pos)
                }
            }
        } catch {
            print("Warning: Could not fetch from positions collection: \(error)")
        }
        
        // 2. Fetch recent `argos_positions` (single batch query)
        do {
            let snap = try await db.collection("argos_positions")
                .order(by: "timestamp", descending: true)
                .limit(to: 500)
                .getDocuments()
            
            for doc in snap.documents {
                if let pos = try? doc.data(as: Position.self, decoder: decoder) {
                    ingestPosition(pos)
                }
            }
        } catch {
            print("Warning: Could not fetch from argos_positions collection: \(error)")
        }
        
        // 3. Match transmitters and fallback to direct coordinates when not in recent batches
        var resultPositions: [Position] = []
        for transmitter in transmitters {
            let pid = transmitter.platform_id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !pid.isEmpty else { continue }
            let docId = (transmitter.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            
            if let pos = latestPositionsByTx[pid] ?? (docId.isEmpty ? nil : latestPositionsByTx[docId]) {
                resultPositions.append(pos)
            } else if let directCoord = transmitter.directCoordinate {
                let fallbackPos = Position(
                    id: "tx-direct-\(docId.isEmpty ? pid : docId)",
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
                resultPositions.append(fallbackPos)
            }
        }
        
        self.cachedPositions = resultPositions
        self.lastCacheTime = Date()
        return resultPositions
    }
    
    func fetchHistoricalPositions(transmitterId: String, startDate: Date, endDate: Date, locationType: String?) async throws -> [Position] {
        let db = FirestoreService.shared.db
        let pid = transmitterId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pid.isEmpty else { return [] }
        
        let startMs = startDate.timeIntervalSince1970
        let endMs = endDate.timeIntervalSince1970
        let isNumeric = Int(pid) != nil
        let numId = Int(pid)
        
        var rawDocs: [[String: Any]] = []
        
        // 1. Query positions collection with string transmitter_id
        if let snap = try? await db.collection("positions").whereField("transmitter_id", isEqualTo: pid).getDocuments() {
            rawDocs.append(contentsOf: snap.documents.map { $0.data() })
        }
        
        // 2. Query positions collection with numeric transmitter_id
        if isNumeric, let n = numId, let snap = try? await db.collection("positions").whereField("transmitter_id", isEqualTo: n).getDocuments() {
            rawDocs.append(contentsOf: snap.documents.map { $0.data() })
        }
        
        // 3. Query positions collection with platformId
        if let snap = try? await db.collection("positions").whereField("platformId", isEqualTo: pid).getDocuments() {
            rawDocs.append(contentsOf: snap.documents.map { $0.data() })
        }
        
        // 4. Query argos_positions collection with string platformId
        if let snap = try? await db.collection("argos_positions").whereField("platformId", isEqualTo: pid).getDocuments() {
            rawDocs.append(contentsOf: snap.documents.map { $0.data() })
        }
        
        // 5. Query argos_positions collection with numeric platformId
        if isNumeric, let n = numId, let snap = try? await db.collection("argos_positions").whereField("platformId", isEqualTo: n).getDocuments() {
            rawDocs.append(contentsOf: snap.documents.map { $0.data() })
        }
        
        // 6. Query argos_positions collection with transmitter_id
        if let snap = try? await db.collection("argos_positions").whereField("transmitter_id", isEqualTo: pid).getDocuments() {
            rawDocs.append(contentsOf: snap.documents.map { $0.data() })
        }
        
        var seenKeys = Set<String>()
        var parsedPositions: [Position] = []
        
        for d in rawDocs {
            guard let timeStr = (d["timestamp"] as? String) ?? (d["locationDate"] as? String) else { continue }
            guard let date = DateFormatters.parseDate(timeStr) else { continue }
            let ts = date.timeIntervalSince1970
            guard ts >= startMs && ts <= endMs else { continue }
            
            let rawLat = (d["lat"] as? Double) ?? (d["latitude"] as? Double) ?? (d["lat"] as? NSNumber)?.doubleValue
            let rawLon = (d["lon"] as? Double) ?? (d["longitude"] as? Double) ?? (d["lon"] as? NSNumber)?.doubleValue
            guard let lat = rawLat, let lon = rawLon, lat != 0, lon != 0, !lat.isNaN, !lon.isNaN, abs(lat) <= 90, abs(lon) <= 180 else { continue }
            
            let dedupeKey = "\(Int(ts))_\(String(format: "%.4f", lat))_\(String(format: "%.4f", lon))"
            if seenKeys.contains(dedupeKey) { continue }
            seenKeys.insert(dedupeKey)
            
            let lc = d["lc"] as? String ?? "3"
            let locType = (d["locationType"] as? String) ?? (lc.uppercased() == "GPS" ? "GPS" : (["3", "2", "1", "0", "A", "B", "Z"].contains(lc) ? "Doppler" : "GPS"))
            
            if let filterType = locationType, filterType != "All", filterType != "all" {
                if locType.lowercased() != filterType.lowercased() {
                    continue
                }
            }
            
            let speed = (d["speed_kmh"] as? Double) ?? (d["speed"] as? Double) ?? 0.0
            let course = (d["course"] as? Double) ?? 0.0
            let sat = (d["satellite"] as? String) ?? "GPS"
            
            let pos = Position(
                id: (d["id"] as? String) ?? "\(pid)_\(Int(ts))",
                transmitter_id: pid,
                platformId: pid,
                timestamp: timeStr,
                lat: lat,
                lon: lon,
                lc: lc,
                is_kalman: d["is_kalman"] as? Bool ?? false,
                speed_kmh: speed,
                course: course,
                satellite: sat,
                locationType: locType
            )
            parsedPositions.append(pos)
        }
        
        // Sort chronologically (oldest to newest for smooth polyline trajectory)
        parsedPositions.sort { p1, p2 in
            let d1 = DateFormatters.parseDate(p1.timestamp)?.timeIntervalSince1970 ?? 0
            let d2 = DateFormatters.parseDate(p2.timestamp)?.timeIntervalSince1970 ?? 0
            return d1 < d2
        }
        
        return parsedPositions
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
