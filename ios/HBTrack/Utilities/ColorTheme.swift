import SwiftUI

struct StatusColor {
    static let active = Color(hex: "22c55e")
    static let staticTest = Color(hex: "eab308")
    static let potentialMortality = Color(hex: "f97316")
    static let inactive = Color(hex: "0f172a")
    static let dead = Color(hex: "dc2626")
    
    static func color(for status: String?) -> Color {
        guard let status = status else { return .gray }
        switch status.lowercased() {
        case "active": return active
        case "static test": return staticTest
        case "potential mortality": return potentialMortality
        case "inactive": return inactive
        case "dead": return dead
        default: return .gray
        }
    }
    
    static let alertCritical = Color.red
    static let alertWarning = Color.orange
    static let alertInfo = Color.blue
    
    static func alertColor(for severity: String?) -> Color {
        switch severity?.lowercased() {
        case "critical": return alertCritical
        case "warning": return alertWarning
        case "info": return alertInfo
        default: return alertInfo
        }
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
