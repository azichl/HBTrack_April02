import Foundation
import FirebaseFirestore
import SwiftUI

struct Alert: Identifiable, Codable {
    @DocumentID var id: String?
    var type: String
    var severity: String
    var transmitter_id: String?
    var bird_name: String?
    var message: String
    var timestamp: String
    var status: String
    var resolved_at: String?
    var resolved_by: String?
    
    var severityColor: Color {
        StatusColor.alertColor(for: severity)
    }
    
    var parsedDate: Date? {
        DateFormatters.parseDate(timestamp)
    }
    
    var isActive: Bool {
        status == "active"
    }
}
