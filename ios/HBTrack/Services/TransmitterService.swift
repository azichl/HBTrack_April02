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
    
    /**
     * Cloned directly from Web App `getHistoricalPositions` in `firestoreService.ts`.
     * High-speed, indexed queries with instant in-memory timestamp & coordinate deduplication.
     */
    func fetchHistoricalPositions(transmitterIds: [String], startDate: Date, endDate: Date, locationType: String? = nil) async throws -> [String: [Position]] {
        let db = FirestoreService.shared.db
        let startMs = startDate.timeIntervalSince1970 * 1000.0
        let endMs = endDate.timeIntervalSince1970 * 1000.0
        var results: [String: [Position]] = [:]
        
        func parseCoord(_ val: Any?) -> Double? {
            if let d = val as? Double { return d }
            if let num = val as? NSNumber { return num.doubleValue }
            if let s = val as? String { return Double(s.trimmingCharacters(in: .whitespacesAndNewlines)) }
            return nil
        }
        
        for pttId in transmitterIds {
            let pidStr = pttId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !pidStr.isEmpty else { continue }
            let idNum = Int(pidStr)
            var seenKeys = Set<String>()
            var pttDocs: [Position] = []
            
            // Helper matching processDoc in firestoreService.ts
            let processDoc: ([String: Any], String) -> Void = { d, docId in
                guard let rawTs = (d["timestamp"] as? String) ?? (d["locationDate"] as? String) else { return }
                let docTs = DateFormatters.fastParseTimestampMs(rawTs)
                if docTs.isNaN || docTs < startMs || docTs > endMs { return }
                
                let rawLat = parseCoord(d["lat"]) ?? parseCoord(d["latitude"])
                let rawLon = parseCoord(d["lon"]) ?? parseCoord(d["longitude"])
                guard let lat = rawLat, var lon = rawLon, lat != 0, lon != 0, !lat.isNaN, !lon.isNaN, abs(lat) <= 90, abs(lon) <= 180 else {
                    return
                }
                
                // Auto-correct negative longitude for transmitter 242086
                if pidStr == "242086" && lon < 0 {
                    lon = abs(lon)
                }
                
                let dedupeKey = "\(Int64(docTs / 1000))_\(String(format: "%.4f", lat))_\(String(format: "%.4f", lon))"
                if seenKeys.contains(dedupeKey) { return }
                seenKeys.insert(dedupeKey)
                
                let rawLc = (d["lc"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                let rawType = (d["locationType"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                
                let locType: String = {
                    if ["3", "2", "1", "0", "A", "B", "Z"].contains(rawLc) { return "Doppler" }
                    if rawLc == "GPS" || rawLc == "G" || rawType == "GPS" { return "GPS" }
                    if rawType == "DOPPLER" { return "Doppler" }
                    return "GPS"
                }()
                
                let speed = parseCoord(d["speed_kmh"]) ?? parseCoord(d["speed"]) ?? 0.0
                let course = parseCoord(d["course"]) ?? 0.0
                let sat = (d["satellite"] as? String) ?? "GPS"
                
                let pos = Position(
                    id: (d["id"] as? String) ?? docId,
                    transmitter_id: pidStr,
                    platformId: pidStr,
                    timestamp: rawTs,
                    lat: lat,
                    lon: lon,
                    lc: rawLc.isEmpty ? "3" : rawLc,
                    is_kalman: d["is_kalman"] as? Bool ?? false,
                    speed_kmh: speed,
                    course: course,
                    satellite: sat,
                    locationType: locType,
                    timestampMs: docTs
                )
                pttDocs.append(pos)
            }
            
            // Helper to execute targeted query
            func fetchAndProcess(_ query: Query) async {
                do {
                    let snap = try await query.getDocuments()
                    for doc in snap.documents {
                        processDoc(doc.data(), doc.documentID)
                    }
                } catch {
                    // Ignore query error, match web app
                }
            }
            
            // ── Query argos_positions (string & number) ──
            await fetchAndProcess(db.collection("argos_positions").whereField("platformId", isEqualTo: pidStr))
            if let num = idNum {
                await fetchAndProcess(db.collection("argos_positions").whereField("platformId", isEqualTo: num))
            }
            
            // ── Query positions (string & number) ──
            await fetchAndProcess(db.collection("positions").whereField("transmitter_id", isEqualTo: pidStr))
            if let num = idNum {
                await fetchAndProcess(db.collection("positions").whereField("transmitter_id", isEqualTo: num))
            }
            await fetchAndProcess(db.collection("positions").whereField("platformId", isEqualTo: pidStr))
            
            // Sort chronologically using pre-parsed timestampMs (nanosecond speed)
            pttDocs.sort { $0.timestampMs < $1.timestampMs }
            results[pidStr] = pttDocs
        }
        
        return results
    }
    
    func fetchHistoricalPositions(transmitterId: String, startDate: Date, endDate: Date, locationType: String? = nil) async throws -> [Position] {
        let dict = try await fetchHistoricalPositions(transmitterIds: [transmitterId], startDate: startDate, endDate: endDate, locationType: locationType)
        return dict[transmitterId] ?? []
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
