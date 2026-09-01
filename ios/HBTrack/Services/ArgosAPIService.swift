import Foundation
import FirebaseFunctions
import FirebaseFirestore

struct SyncResult {
    var recordsImported: Int
    var timestamp: Date
    var errors: [String]
}

class ArgosAPIService {
    static let shared = ArgosAPIService()
    private init() {}
    
    func syncArgosData(username: String, password: String, clientId: String) async throws -> SyncResult {
        let functions = Functions.functions()
        var errors: [String] = []
        var imported = 0
        
        do {
            // Step 1: Get OAuth token via proxy
            let tokenResult = try await functions.httpsCallable("proxyArgosApi").call([
                "url": "https://account.groupcls.com/auth/realms/cls/protocol/openid-connect/token",
                "method": "POST",
                "body": [
                    "grant_type": "password",
                    "client_id": clientId,
                    "username": username,
                    "password": password
                ]
            ])
            
            guard let tokenData = tokenResult.data as? [String: Any],
                  let accessToken = tokenData["access_token"] as? String else {
                throw NSError(domain: "ArgosAPI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to obtain access token"])
            }
            
            // Step 2: Fetch telemetry data
            let telemetryResult = try await functions.httpsCallable("proxyArgosApi").call([
                "url": "https://api.groupcls.com/telemetry/api/v1/positions",
                "method": "GET",
                "headers": [
                    "Authorization": "Bearer \(accessToken)"
                ]
            ])
            
            guard let telemetryData = telemetryResult.data as? [String: Any],
                  let items = telemetryData["items"] as? [[String: Any]] else {
                throw NSError(domain: "ArgosAPI", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to fetch telemetry data"])
            }
            
            // Step 3: Write positions to Firestore
            let db = FirestoreService.shared.db
            let batch = db.batch()
            
            for item in items {
                guard let platformId = item["platformId"] as? String ?? item["ptt"] as? String,
                      let dateStr = item["locationDate"] as? String,
                      let latitude = item["latitude"] as? Double,
                      let longitude = item["longitude"] as? Double else {
                    errors.append("Invalid item format")
                    continue
                }
                
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                let date = formatter.date(from: dateStr) ?? Date()
                
                let posId = "\(platformId)_\(Int(date.timeIntervalSince1970))"
                let docRef = db.collection("positions").document(posId)
                
                let positionData: [String: Any] = [
                    "transmitter_id": platformId,
                    "platformId": platformId,
                    "timestamp": dateStr,
                    "lat": latitude,
                    "lon": longitude,
                    "latitude": latitude,
                    "longitude": longitude,
                    "locationType": "Argos",
                    "location_type": "Argos",
                    "raw_data": item
                ]
                
                batch.setData(positionData, forDocument: docRef, merge: true)
                imported += 1
            }
            
            try await batch.commit()
            
        } catch {
            errors.append(error.localizedDescription)
        }
        
        return SyncResult(recordsImported: imported, timestamp: Date(), errors: errors)
    }
}
