import Foundation
import CoreLocation

struct HaversineDistance {
    static func distance(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let earthRadius = 6371000.0 // meters
        let lat1 = from.latitude * .pi / 180
        let lat2 = to.latitude * .pi / 180
        let dLat = (to.latitude - from.latitude) * .pi / 180
        let dLon = (to.longitude - from.longitude) * .pi / 180

        let a = sin(dLat/2) * sin(dLat/2) +
                cos(lat1) * cos(lat2) *
                sin(dLon/2) * sin(dLon/2)
        let c = 2 * atan2(sqrt(a), sqrt(1-a))

        return earthRadius * c
    }
    
    static func format(distanceInMeters: Double) -> String {
        if distanceInMeters < 1000 {
            return String(format: "%.0f m", distanceInMeters)
        } else {
            return String(format: "%.1f km", distanceInMeters / 1000.0)
        }
    }
}
