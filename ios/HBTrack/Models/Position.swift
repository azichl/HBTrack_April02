import Foundation
import FirebaseFirestore
import CoreLocation

struct Position: Identifiable, Codable {
    @DocumentID var id: String?
    var transmitter_id: String?
    var platformId: String?     // Some docs use this field name
    var timestamp: String
    var lat: Double
    var lon: Double
    var lc: String?             // Location class: GPS, 3, 2, 1, 0, A, B, Z
    var is_kalman: Bool?
    var speed_kmh: Double?
    var course: Double?
    var satellite: String?
    var locationType: String?   // "GPS" or "Doppler"
    
    var coordinate: CLLocationCoordinate2D {
        var correctedLon = lon
        if (effectiveTransmitterId == "242086") && correctedLon < 0 {
            correctedLon = abs(correctedLon)
        }
        return CLLocationCoordinate2D(latitude: lat, longitude: correctedLon)
    }
    
    var effectiveTransmitterId: String? {
        transmitter_id ?? platformId
    }
    
    var parsedDate: Date? {
        DateFormatters.parseDate(timestamp)
    }
    
    enum CodingKeys: String, CodingKey {
        case id
        case transmitter_id
        case platformId
        case timestamp
        case lat
        case latitude
        case lon
        case longitude
        case lc
        case is_kalman
        case speed_kmh
        case speed
        case course
        case satellite
        case locationType
    }
    
    init(id: String? = nil, transmitter_id: String?, platformId: String?, timestamp: String, lat: Double, lon: Double, lc: String? = nil, is_kalman: Bool? = nil, speed_kmh: Double? = nil, course: Double? = nil, satellite: String? = nil, locationType: String? = nil) {
        self.id = id
        self.transmitter_id = transmitter_id
        self.platformId = platformId
        self.timestamp = timestamp
        self.lat = lat
        self.lon = lon
        self.lc = lc
        self.is_kalman = is_kalman
        self.speed_kmh = speed_kmh
        self.course = course
        self.satellite = satellite
        self.locationType = locationType
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        // ID
        self.id = try? container.decodeIfPresent(String.self, forKey: .id)
        
        // transmitter_id / platformId can be string or numeric
        if let s = try? container.decodeIfPresent(String.self, forKey: .transmitter_id) {
            self.transmitter_id = s
        } else if let num = try? container.decodeIfPresent(Int.self, forKey: .transmitter_id) {
            self.transmitter_id = String(num)
        }
        
        if let s = try? container.decodeIfPresent(String.self, forKey: .platformId) {
            self.platformId = s
        } else if let num = try? container.decodeIfPresent(Int.self, forKey: .platformId) {
            self.platformId = String(num)
        }
        
        // Cross-fill
        if self.transmitter_id == nil { self.transmitter_id = self.platformId }
        if self.platformId == nil { self.platformId = self.transmitter_id }
        
        // Timestamp
        self.timestamp = (try? container.decodeIfPresent(String.self, forKey: .timestamp)) ?? ISO8601DateFormatter().string(from: Date())
        
        // Lat: check lat or latitude (Double or String)
        var latitudeVal: Double = 0
        if let d = try? container.decodeIfPresent(Double.self, forKey: .lat) {
            latitudeVal = d
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .lat), let d = Double(s) {
            latitudeVal = d
        } else if let d = try? container.decodeIfPresent(Double.self, forKey: .latitude) {
            latitudeVal = d
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .latitude), let d = Double(s) {
            latitudeVal = d
        }
        self.lat = latitudeVal
        
        // Lon: check lon or longitude (Double or String)
        var longitudeVal: Double = 0
        if let d = try? container.decodeIfPresent(Double.self, forKey: .lon) {
            longitudeVal = d
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .lon), let d = Double(s) {
            longitudeVal = d
        } else if let d = try? container.decodeIfPresent(Double.self, forKey: .longitude) {
            longitudeVal = d
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .longitude), let d = Double(s) {
            longitudeVal = d
        }
        
        // Specific fix for transmitter 242086: auto-correct negative longitude
        let tid = self.transmitter_id ?? self.platformId ?? ""
        if tid == "242086" && longitudeVal < 0 {
            longitudeVal = abs(longitudeVal)
        }
        self.lon = longitudeVal
        
        // Optional attributes
        self.lc = try? container.decodeIfPresent(String.self, forKey: .lc)
        self.is_kalman = try? container.decodeIfPresent(Bool.self, forKey: .is_kalman)
        
        if let d = try? container.decodeIfPresent(Double.self, forKey: .speed_kmh) {
            self.speed_kmh = d
        } else if let d = try? container.decodeIfPresent(Double.self, forKey: .speed) {
            self.speed_kmh = d
        }
        
        self.course = try? container.decodeIfPresent(Double.self, forKey: .course)
        self.satellite = try? container.decodeIfPresent(String.self, forKey: .satellite)
        self.locationType = try? container.decodeIfPresent(String.self, forKey: .locationType)
    }
}
