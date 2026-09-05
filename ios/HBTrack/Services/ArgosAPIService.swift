import Foundation
import FirebaseFirestore

extension Notification.Name {
    static let telemetryDataDidUpdate = Notification.Name("telemetryDataDidUpdate")
}

struct TransmitterSyncInfo {
    var lastFix: String
    var battery: Double?
    var lat: Double
    var lon: Double
}

struct SyncResult: Identifiable {
    var id = UUID()
    var recordsImported: Int
    var transmittersUpdated: Int
    var timestamp: Date
    var errors: [String]
    var logs: [String]
}

class ArgosAPIService {
    static let shared = ArgosAPIService()
    private init() {}
    
    private let authUrl = "https://account.groupcls.com/auth/realms/cls/protocol/openid-connect/token"
    private let baseUrl = "https://api.groupcls.com/telemetry/api/v1"
    private let defaultClientId = "api-telemetry"
    
    /// Authenticate with CLS OAuth2 endpoint
    func authenticate(username: String, password: String, clientId: String? = nil, onLog: ((String) -> Void)? = nil) async throws -> String {
        let cid = clientId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? clientId! : defaultClientId
        onLog?("Authenticating with CLS platform (\(username))...")
        
        guard let url = URL(string: authUrl) else {
            throw NSError(domain: "ArgosAPI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid auth URL"])
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30
        
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "grant_type", value: "password"),
            URLQueryItem(name: "client_id", value: cid),
            URLQueryItem(name: "username", value: username.trimmingCharacters(in: .whitespacesAndNewlines)),
            URLQueryItem(name: "password", value: password)
        ]
        
        request.httpBody = components.percentEncodedQuery?.data(using: .utf8)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "ArgosAPI", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid server response"])
        }
        
        if httpResponse.statusCode != 200 {
            let errorText = String(data: data, encoding: .utf8) ?? "HTTP \(httpResponse.statusCode)"
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let desc = json["error_description"] as? String {
                throw NSError(domain: "ArgosAPI", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "CLS Auth Failed: \(desc)"])
            }
            throw NSError(domain: "ArgosAPI", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "CLS Auth Failed (\(httpResponse.statusCode)): \(errorText)"])
        }
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["access_token"] as? String else {
            throw NSError(domain: "ArgosAPI", code: 3, userInfo: [NSLocalizedDescriptionKey: "No access token in response"])
        }
        
        onLog?("Authentication Successful. Access token acquired.")
        return token
    }
    
    /// Retrieve telemetry bulk data from CLS API
    func fetchBulkTelemetry(token: String, startDate: Date, endDate: Date, onLog: ((String) -> Void)? = nil) async throws -> [[String: Any]] {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        let startStr = isoFormatter.string(from: startDate)
        let endStr = isoFormatter.string(from: endDate)
        
        onLog?("Requesting telemetry from \(startStr) to \(endStr)...")
        
        guard let url = URL(string: "\(baseUrl)/retrieve-bulk") else {
            throw NSError(domain: "ArgosAPI", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid bulk telemetry URL"])
        }
        
        var allItems: [[String: Any]] = []
        var currentCursor: String? = nil
        var hasMore = true
        var page = 1
        let maxPages = 50 // Safe ceiling
        let limit = 100
        
        while hasMore && page <= maxPages {
            onLog?("Fetching telemetry page \(page)\(currentCursor != nil ? " (cursor: ...\(currentCursor!.suffix(8)))" : "")...")
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.timeoutInterval = 45
            
            var pagination: [String: Any] = ["first": limit]
            if let cursor = currentCursor {
                pagination["after"] = cursor
            }
            
            let bodyDict: [String: Any] = [
                "pagination": pagination,
                "retrieveMetadata": true,
                "retrieveRawData": true,
                "retrieveDoppler": true,
                "retrieveGpsLoc": true,
                "retrieveSensors": true,
                "retrieveAdditionnalProperties": true,
                "fromDatetime": startStr,
                "toDatetime": endStr,
                "datetimeFormat": "DATETIME"
            ]
            
            request.httpBody = try JSONSerialization.data(withJSONObject: bodyDict)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "ArgosAPI", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid HTTP response"])
            }
            
            if httpResponse.statusCode != 200 {
                let errText = String(data: data, encoding: .utf8) ?? ""
                throw NSError(domain: "ArgosAPI", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "CLS Bulk Fetch Failed (\(httpResponse.statusCode)): \(errText.prefix(120))"])
            }
            
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                break
            }
            
            if let contents = json["contents"] as? [[String: Any]], !contents.isEmpty {
                allItems.append(contentsOf: contents)
                onLog?("Page \(page): received \(contents.count) records (total so far: \(allItems.count)).")
                page += 1
                
                if let pageInfo = json["pageInfo"] as? [String: Any],
                   let hasNext = pageInfo["hasNextPage"] as? Bool, hasNext,
                   let endCursor = pageInfo["endCursor"] as? String {
                    currentCursor = endCursor
                } else {
                    hasMore = false
                }
            } else {
                hasMore = false
            }
        }
        
        onLog?("Finished downloading from CLS: \(allItems.count) raw telemetry items.")
        return allItems
    }
    
    /// Parse raw telemetry items into standard Position and Argos models (matching Web App logic)
    func mapRawTelemetry(_ rawItems: [[String: Any]]) -> (positions: [[String: Any]], argosPositions: [[String: Any]], txLastFixes: [String: TransmitterSyncInfo]) {
        var parsedPositions: [[String: Any]] = []
        var parsedArgos: [[String: Any]] = []
        var txLastFixes: [String: TransmitterSyncInfo] = [:]
        
        func parseCoord(_ val: Any?) -> Double? {
            if let d = val as? Double { return d }
            if let num = val as? NSNumber { return num.doubleValue }
            if let s = val as? String { return Double(s.trimmingCharacters(in: .whitespacesAndNewlines)) }
            return nil
        }
        
        for item in rawItems {
            // Coordinate extraction
            let rawLat = parseCoord(item["gpsLocLat"]) ?? parseCoord(item["dopplerLocLat"]) ?? parseCoord((item["location"] as? [String: Any])?["latitude"])
            let rawLon = parseCoord(item["gpsLocLon"]) ?? parseCoord(item["dopplerLocLon"]) ?? parseCoord((item["location"] as? [String: Any])?["longitude"])
            
            guard let lat = rawLat, var lon = rawLon, lat != 0, lon != 0, !lat.isNaN, !lon.isNaN, abs(lat) <= 90, abs(lon) <= 180 else {
                continue
            }
            
            let platformId = String(describing: item["deviceRef"] ?? item["platformId"] ?? item["ptt"] ?? "").replacingOccurrences(of: "^trans-", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !platformId.isEmpty, platformId != "Unknown" else { continue }
            
            // Auto-correct negative longitude for transmitter 242086
            if platformId == "242086" && lon < 0 {
                lon = abs(lon)
            }
            
            // Location class & type derivation
            let rawDopplerError = item["dopplerLocErrorRadius"] != nil ? "\(item["dopplerLocErrorRadius"]!)" : "0"
            var rawLc = (item["dopplerLocClass"] as? String) ?? ((item["location"] as? [String: Any])?["locationClass"] as? String) ?? ""
            var locationType = item["gpsLocLat"] != nil ? "GPS" : "Doppler"
            
            if ["0", "1", "2", "3", "A", "B", "Z"].contains(rawLc) {
                locationType = "Doppler"
            }
            if (rawDopplerError == "0" || rawDopplerError.isEmpty) && rawLc.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                rawLc = "GPS"
                locationType = "GPS"
            }
            let lc = rawLc.isEmpty ? "Z" : rawLc
            
            // Timestamp derivation
            let gpsDate = item["gpsLocDate"] as? String ?? (item["location"] as? [String: Any])?["locationDate"] as? String
            let msgDate = item["msgDatetime"] as? String ?? item["bestDate"] as? String ?? item["date"] as? String
            let ts = gpsDate ?? msgDate ?? DateFormatters.isoFormatter.string(from: Date())
            
            // Battery voltage heuristic decoding
            let rawDataStr = item["rawData"] as? String ?? ""
            let decodedBattery = decodeBatteryVoltage(rawData: rawDataStr)
            
            let sat = (item["kineisMetadata"] as? [String: Any])?["sat"] as? String ?? "UNK"
            let msgUid = item["deviceMsgUid"] != nil ? "\(item["deviceMsgUid"]!)" : UUID().uuidString
            let posDocId = "pos-\(msgUid)"
            let argosDocId = "msg-\(msgUid)"
            
            let posDict: [String: Any] = [
                "id": posDocId,
                "transmitter_id": platformId,
                "platformId": platformId,
                "timestamp": ts,
                "lat": lat,
                "lon": lon,
                "latitude": lat,
                "longitude": lon,
                "lc": lc,
                "locationType": locationType,
                "is_kalman": false,
                "speed_kmh": 0.0,
                "course": 0.0,
                "satellite": sat,
                "raw_data": rawDataStr
            ]
            parsedPositions.append(posDict)
            
            let argosDict: [String: Any] = [
                "id": argosDocId,
                "platformId": platformId,
                "transmitter_id": platformId,
                "timestamp": ts,
                "lat": lat,
                "lon": lon,
                "latitude": lat,
                "longitude": lon,
                "lc": lc,
                "locationType": locationType,
                "satellite": sat,
                "rawData": rawDataStr,
                "dopplerError": rawDopplerError
            ]
            parsedArgos.append(argosDict)
            
            // Track transmitter latest fix, coordinates & battery
            if let existing = txLastFixes[platformId] {
                let existingDate = DateFormatters.parseDate(existing.lastFix)?.timeIntervalSince1970 ?? 0
                let newDate = DateFormatters.parseDate(ts)?.timeIntervalSince1970 ?? 0
                if newDate >= existingDate {
                    txLastFixes[platformId] = TransmitterSyncInfo(lastFix: ts, battery: decodedBattery ?? existing.battery, lat: lat, lon: lon)
                }
            } else {
                txLastFixes[platformId] = TransmitterSyncInfo(lastFix: ts, battery: decodedBattery, lat: lat, lon: lon)
            }
        }
        
        return (parsedPositions, parsedArgos, txLastFixes)
    }
    
    /// Battery heuristic helper
    private func decodeBatteryVoltage(rawData: String) -> Double? {
        guard !rawData.isEmpty else { return nil }
        let tokens = rawData.components(separatedBy: .whitespacesAndNewlines)
        for t in tokens {
            if let num = Double(t), num >= 32 && num <= 43 {
                return num / 10.0
            }
        }
        return nil
    }
    
    /// Full End-to-End Sync Pipeline: Auth -> Fetch Bulk -> Map -> Write to Firebase
    func syncArgosData(
        username: String,
        password: String,
        clientId: String? = nil,
        startDate: Date,
        endDate: Date,
        onLog: ((String) -> Void)? = nil
    ) async throws -> SyncResult {
        var logs: [String] = []
        var errors: [String] = []
        let logHandler: (String) -> Void = { msg in
            let timestamp = DateFormatters.displayTime(Date())
            let line = "[\(timestamp)] \(msg)"
            logs.append(line)
            onLog?(line)
        }
        
        // 1. Authenticate
        let token = try await authenticate(username: username, password: password, clientId: clientId, onLog: logHandler)
        
        // 2. Fetch bulk data
        let rawItems = try await fetchBulkTelemetry(token: token, startDate: startDate, endDate: endDate, onLog: logHandler)
        
        if rawItems.isEmpty {
            logHandler("No new telemetry records returned from CLS for this period.")
            return SyncResult(recordsImported: 0, transmittersUpdated: 0, timestamp: Date(), errors: [], logs: logs)
        }
        
        // 3. Map items to Firestore positions schema
        logHandler("Mapping and validating \(rawItems.count) telemetry records...")
        let (positions, argosPositions, txLastFixes) = mapRawTelemetry(rawItems)
        logHandler("Valid positions extracted: \(positions.count).")
        
        // 4. Batch write to Firestore
        let db = FirestoreService.shared.db
        var importedCount = 0
        
        // Write positions in chunks of 400 (under Firestore 500 operation limit)
        let posChunks = stride(from: 0, to: positions.count, by: 400).map {
            Array(positions[$0 ..< min($0 + 400, positions.count)])
        }
        
        for (idx, chunk) in posChunks.enumerated() {
            logHandler("Writing positions chunk \(idx + 1)/\(posChunks.count) (\(chunk.count) records)...")
            let batch = db.batch()
            for p in chunk {
                if let docId = p["id"] as? String {
                    let ref = db.collection("positions").document(docId)
                    batch.setData(p, forDocument: ref, merge: true)
                }
            }
            try await batch.commit()
            importedCount += chunk.count
        }
        
        // Write argos_positions in chunks of 400
        let argosChunks = stride(from: 0, to: argosPositions.count, by: 400).map {
            Array(argosPositions[$0 ..< min($0 + 400, argosPositions.count)])
        }
        for (idx, chunk) in argosChunks.enumerated() {
            logHandler("Writing raw argos_positions chunk \(idx + 1)/\(argosChunks.count)...")
            let batch = db.batch()
            for a in chunk {
                if let docId = a["id"] as? String {
                    let ref = db.collection("argos_positions").document(docId)
                    batch.setData(a, forDocument: ref, merge: true)
                }
            }
            try await batch.commit()
        }
        
        // 5. Update transmitters latest fix, coordinates & battery in Firestore
        logHandler("Updating metadata for \(txLastFixes.count) active transmitters...")
        
        let existingTxsSnap = try? await db.collection("transmitters").getDocuments()
        var pidToDocId: [String: String] = [:]
        if let docs = existingTxsSnap?.documents {
            for d in docs {
                let p = String(describing: d.data()["platform_id"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if !p.isEmpty {
                    pidToDocId[p] = d.documentID
                }
            }
        }
        
        var txUpdatedCount = 0
        let txBatch = db.batch()
        
        for (pid, info) in txLastFixes {
            let targetDocId = pidToDocId[pid] ?? "trans-\(pid)"
            let docRef = db.collection("transmitters").document(targetDocId)
            var updateData: [String: Any] = [
                "platform_id": pid,
                "last_fix": info.lastFix,
                "last_latitude": info.lat,
                "last_longitude": info.lon,
                "latitude": info.lat,
                "longitude": info.lon,
                "lat": info.lat,
                "lon": info.lon,
                "status": "active",
                "deployed": true
            ]
            if let b = info.battery {
                updateData["battery_voltage"] = b
            }
            txBatch.setData(updateData, forDocument: docRef, merge: true)
            txUpdatedCount += 1
        }
        
        if txUpdatedCount > 0 {
            try await txBatch.commit()
        }
        
        // 6. Update system_status/ingestion timestamp (triggers real-time listeners across all devices & web app)
        let nowIso = DateFormatters.isoFormatter.string(from: Date())
        try? await db.collection("system_status").document("ingestion").setData([
            "id": "ingestion",
            "last_ingest_time": nowIso,
            "updated_at": nowIso
        ], merge: true)
        
        // 7. Invalidate local in-memory caches so subsequent queries read freshly updated Firestore data
        TransmitterService.shared.invalidateCache()
        
        // 8. Broadcast local notification to immediately update Dashboard, Live Map, and all UI views
        await MainActor.run {
            NotificationCenter.default.post(name: .telemetryDataDidUpdate, object: nil)
        }
        
        logHandler("CLS Data Upload Completed Successfully ✓ (\(importedCount) fixes, \(txUpdatedCount) transmitters updated).")
        
        return SyncResult(
            recordsImported: importedCount,
            transmittersUpdated: txUpdatedCount,
            timestamp: Date(),
            errors: errors,
            logs: logs
        )
    }
}
