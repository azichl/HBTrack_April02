import Foundation
import FirebaseFirestore
import SwiftUI
import CoreLocation

struct Transmitter: Identifiable, Codable, Hashable {
    @DocumentID var id: String?
    var platform_id: String
    var model: String?
    var status: String          // "Active", "Inactive", "Static test"
    var derived_status: String? // "Active", "Dead", "Potential Mortality"
    var battery_voltage: Double?
    var last_fix: String?
    var duty_cycle: String?
    var frequency: Double?
    var hex_id: String?
    var manufacturer: String?
    var program_region: String?
    var site_location: String?
    var bird_id: String?
    var assigned_bird_ring: String?
    
    // Direct coordinate fields that might exist on transmitter documents in Firestore
    var last_latitude: Double?
    var last_longitude: Double?
    var latitude: Double?
    var longitude: Double?
    var lat: Double?
    var lon: Double?
    
    var directCoordinate: CLLocationCoordinate2D? {
        let latitudeVal = last_latitude ?? latitude ?? lat
        let longitudeVal = last_longitude ?? longitude ?? lon
        guard let lat = latitudeVal, let lon = longitudeVal, lat != 0, lon != 0, !lat.isNaN, !lon.isNaN, abs(lat) <= 90, abs(lon) <= 180 else {
            return nil
        }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }
    
    var effectiveStatus: String {
        return derived_status ?? status
    }
    
    var statusColor: Color {
        return StatusColor.color(for: effectiveStatus)
    }
    
    var statusUIColor: UIColor {
        return StatusColor.uiColor(for: effectiveStatus)
    }
}
