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
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }
    
    var effectiveTransmitterId: String? {
        transmitter_id ?? platformId
    }
    
    var parsedDate: Date? {
        DateFormatters.parseDate(timestamp)
    }
}
