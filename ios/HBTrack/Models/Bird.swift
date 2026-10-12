import Foundation
import FirebaseFirestore

struct Bird: Identifiable, Codable {
    @DocumentID var id: String?
    var ring_id: String?
    var species: String?
    var sex: String?
    var origin: String?
    var darvic_number: String?
    var hatch_date: String?
    var release_date: String?
    var release_location: String?
    var release_lat: Double?
    var release_lon: Double?
}
