import Foundation
import FirebaseFirestore
import SwiftUI

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
