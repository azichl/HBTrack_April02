import Foundation
import FirebaseFirestore

struct StaticTestPeriod: Identifiable, Codable {
    @DocumentID var id: String?
    var transmitter_id: String?
    var platform_id: String?
    var start_date: String?
    var end_date: String?
    var fix_count: Int?
    var days_on_test: Int?
    var active: Bool?
}
