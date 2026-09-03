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
        var longitudeVal = last_longitude ?? longitude ?? lon
        
        // Auto-correct negative longitude for transmitter 242086
        if platform_id == "242086", let l = longitudeVal, l < 0 {
            longitudeVal = abs(l)
        }
        
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
    
    enum CodingKeys: String, CodingKey {
        case id
        case platform_id
        case platformId
        case transmitter_id
        case model
        case status
        case derived_status
        case battery_voltage
        case last_fix
        case duty_cycle
        case frequency
        case hex_id
        case manufacturer
        case program_region
        case site_location
        case bird_id
        case assigned_bird_ring
        case last_latitude
        case last_longitude
        case latitude
        case longitude
        case lat
        case lon
    }
    
    init(id: String? = nil, platform_id: String, model: String? = nil, status: String = "Active", derived_status: String? = nil, battery_voltage: Double? = nil, last_fix: String? = nil, duty_cycle: String? = nil, frequency: Double? = nil, hex_id: String? = nil, manufacturer: String? = nil, program_region: String? = nil, site_location: String? = nil, bird_id: String? = nil, assigned_bird_ring: String? = nil, last_latitude: Double? = nil, last_longitude: Double? = nil, latitude: Double? = nil, longitude: Double? = nil, lat: Double? = nil, lon: Double? = nil) {
        self.id = id
        self.platform_id = platform_id
        self.model = model
        self.status = status
        self.derived_status = derived_status
        self.battery_voltage = battery_voltage
        self.last_fix = last_fix
        self.duty_cycle = duty_cycle
        self.frequency = frequency
        self.hex_id = hex_id
        self.manufacturer = manufacturer
        self.program_region = program_region
        self.site_location = site_location
        self.bird_id = bird_id
        self.assigned_bird_ring = assigned_bird_ring
        self.last_latitude = last_latitude
        self.last_longitude = last_longitude
        self.latitude = latitude
        self.longitude = longitude
        self.lat = lat
        self.lon = lon
    }
    
    init(from decoder: Decoder) throws {
        let decodedId = try? container.decodeIfPresent(String.self, forKey: .id)
        self.id = decodedId
        
        // Decode platform_id flexibly from string or int across keys
        var pid = ""
        if let s = try? container.decodeIfPresent(String.self, forKey: .platform_id) {
            pid = s
        } else if let num = try? container.decodeIfPresent(Int.self, forKey: .platform_id) {
            pid = String(num)
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .platformId) {
            pid = s
        } else if let num = try? container.decodeIfPresent(Int.self, forKey: .platformId) {
            pid = String(num)
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .transmitter_id) {
            pid = s
        } else if let num = try? container.decodeIfPresent(Int.self, forKey: .transmitter_id) {
            pid = String(num)
        } else if let docId = decodedId, !docId.isEmpty {
            pid = docId
        }
        self.platform_id = pid
        
        self.model = try? container.decodeIfPresent(String.self, forKey: .model)
        
        // Status defaults to Active if missing
        if let s = try? container.decodeIfPresent(String.self, forKey: .status) {
            self.status = s
        } else {
            self.status = "Active"
        }
        
        self.derived_status = try? container.decodeIfPresent(String.self, forKey: .derived_status)
        
        // Battery voltage
        if let d = try? container.decodeIfPresent(Double.self, forKey: .battery_voltage) {
            self.battery_voltage = d
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .battery_voltage), let d = Double(s) {
            self.battery_voltage = d
        }
        
        self.last_fix = try? container.decodeIfPresent(String.self, forKey: .last_fix)
        self.duty_cycle = try? container.decodeIfPresent(String.self, forKey: .duty_cycle)
        
        // Frequency
        if let d = try? container.decodeIfPresent(Double.self, forKey: .frequency) {
            self.frequency = d
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .frequency), let d = Double(s) {
            self.frequency = d
        }
        
        self.hex_id = try? container.decodeIfPresent(String.self, forKey: .hex_id)
        self.manufacturer = try? container.decodeIfPresent(String.self, forKey: .manufacturer)
        self.program_region = try? container.decodeIfPresent(String.self, forKey: .program_region)
        self.site_location = try? container.decodeIfPresent(String.self, forKey: .site_location)
        
        // bird_id
        if let s = try? container.decodeIfPresent(String.self, forKey: .bird_id) {
            self.bird_id = s
        } else if let num = try? container.decodeIfPresent(Int.self, forKey: .bird_id) {
            self.bird_id = String(num)
        }
        
        // assigned_bird_ring
        if let s = try? container.decodeIfPresent(String.self, forKey: .assigned_bird_ring) {
            self.assigned_bird_ring = s
        } else if let num = try? container.decodeIfPresent(Int.self, forKey: .assigned_bird_ring) {
            self.assigned_bird_ring = String(num)
        }
        
        // Coordinate fields
        self.last_latitude = (try? container.decodeIfPresent(Double.self, forKey: .last_latitude))
            ?? (try? container.decodeIfPresent(String.self, forKey: .last_latitude)).flatMap { Double($0) }
        self.last_longitude = (try? container.decodeIfPresent(Double.self, forKey: .last_longitude))
            ?? (try? container.decodeIfPresent(String.self, forKey: .last_longitude)).flatMap { Double($0) }
        self.latitude = (try? container.decodeIfPresent(Double.self, forKey: .latitude))
            ?? (try? container.decodeIfPresent(String.self, forKey: .latitude)).flatMap { Double($0) }
        self.longitude = (try? container.decodeIfPresent(Double.self, forKey: .longitude))
            ?? (try? container.decodeIfPresent(String.self, forKey: .longitude)).flatMap { Double($0) }
        self.lat = (try? container.decodeIfPresent(Double.self, forKey: .lat))
            ?? (try? container.decodeIfPresent(String.self, forKey: .lat)).flatMap { Double($0) }
        self.lon = (try? container.decodeIfPresent(Double.self, forKey: .lon))
            ?? (try? container.decodeIfPresent(String.self, forKey: .lon)).flatMap { Double($0) }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(id, forKey: .id)
        try container.encode(platform_id, forKey: .platform_id)
        try container.encodeIfPresent(model, forKey: .model)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(derived_status, forKey: .derived_status)
        try container.encodeIfPresent(battery_voltage, forKey: .battery_voltage)
        try container.encodeIfPresent(last_fix, forKey: .last_fix)
        try container.encodeIfPresent(duty_cycle, forKey: .duty_cycle)
        try container.encodeIfPresent(frequency, forKey: .frequency)
        try container.encodeIfPresent(hex_id, forKey: .hex_id)
        try container.encodeIfPresent(manufacturer, forKey: .manufacturer)
        try container.encodeIfPresent(program_region, forKey: .program_region)
        try container.encodeIfPresent(site_location, forKey: .site_location)
        try container.encodeIfPresent(bird_id, forKey: .bird_id)
        try container.encodeIfPresent(assigned_bird_ring, forKey: .assigned_bird_ring)
        try container.encodeIfPresent(last_latitude, forKey: .last_latitude)
        try container.encodeIfPresent(last_longitude, forKey: .last_longitude)
        try container.encodeIfPresent(latitude, forKey: .latitude)
        try container.encodeIfPresent(longitude, forKey: .longitude)
        try container.encodeIfPresent(lat, forKey: .lat)
        try container.encodeIfPresent(lon, forKey: .lon)
    }
}
