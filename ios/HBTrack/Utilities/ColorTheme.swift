import SwiftUI

extension UIColor {
    convenience init(hex: String, alpha: CGFloat = 1.0) {
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
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            red: CGFloat(r) / 255.0,
            green: CGFloat(g) / 255.0,
            blue: CGFloat(b) / 255.0,
            alpha: alpha == 1.0 ? CGFloat(a) / 255.0 : alpha
        )
    }
    
    static func dynamic(light: UIColor, dark: UIColor) -> UIColor {
        return UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? dark : light
        }
    }
    
    static func dynamic(lightHex: String, darkHex: String) -> UIColor {
        return dynamic(light: UIColor(hex: lightHex), dark: UIColor(hex: darkHex))
    }
}

struct AppTheme {
    static let brandGold = Color(hex: "B58E58")
    static let brandGoldDark = Color(hex: "8F6B38")
    static let brandGoldLight = Color(uiColor: UIColor.dynamic(light: UIColor(hex: "FDFBF7"), dark: UIColor(hex: "B58E58").withAlphaComponent(0.18)))
    static let brandGoldBorder = Color(uiColor: UIColor.dynamic(light: UIColor(hex: "D8C2A0"), dark: UIColor(hex: "B58E58").withAlphaComponent(0.35)))
    
    static let brandGoldUI = UIColor(red: 181/255, green: 142/255, blue: 88/255, alpha: 1.0)
    
    // Web App Cloned Tailwind Slate Dark Mode Palette
    static let slate900Hex = "0F172A" // Web App dark:bg-slate-900 (Main Background, Nav Bar)
    static let slate800Hex = "1E293B" // Web App dark:bg-slate-800 (Cards, Panels, Modals)
    static let slate700Hex = "334155" // Web App dark:bg-slate-700 / dark:border-slate-700 (Borders, Pills)
    static let slate600Hex = "475569" // Web App dark:border-slate-600 (Inputs Border)
    static let slate500Hex = "64748B" // Web App dark:text-slate-500 (Muted Text)
    static let slate400Hex = "94A3B8" // Web App dark:text-slate-400 (Secondary Text)
    
    // Web App Primary Dark Mode Hex: #0F172A
    static let darkThemeHex = slate900Hex
    static let darkThemeBackground = Color(hex: slate900Hex)
    static let darkThemeBackgroundUI = UIColor(hex: slate900Hex)
    
    // Adaptive Screen Background (#F8FAFC in Light, #0F172A in Dark - Cloned from Web App App.tsx bg-gray-50 dark:bg-slate-900)
    static let screenBackgroundUI = UIColor.dynamic(lightHex: "F8FAFC", darkHex: slate900Hex)
    static let screenBackground = Color(uiColor: screenBackgroundUI)
    
    // Adaptive Card Background (#FFFFFF in Light, #1E293B in Dark - Cloned from Web App bg-white dark:bg-slate-800)
    static let cardBackgroundUI = UIColor.dynamic(lightHex: "FFFFFF", darkHex: slate800Hex)
    static let cardBackground = Color(uiColor: cardBackgroundUI)
    
    // Adaptive Card Gradient (for Command cards / highlight containers: slate-800 to slate-900)
    static let cardGradientTop = Color(uiColor: UIColor.dynamic(lightHex: "FFFFFF", darkHex: slate800Hex))
    static let cardGradientBottom = Color(uiColor: UIColor.dynamic(lightHex: "F8FAFC", darkHex: slate900Hex))
    
    // Adaptive Card Border (#E2E8F0 in Light, #334155 in Dark - Cloned from Web App border-gray-200 dark:border-slate-700)
    static let cardBorderUI = UIColor.dynamic(lightHex: "E2E8F0", darkHex: slate700Hex)
    static let cardBorder = Color(uiColor: cardBorderUI)
    
    // Adaptive Subtle / Pill background (#F1F5F9 in Light, #334155 in Dark - Cloned from Web App bg-gray-100 dark:bg-slate-700)
    static let subtleBackgroundUI = UIColor.dynamic(lightHex: "F1F5F9", darkHex: slate700Hex)
    static let subtleBackground = Color(uiColor: subtleBackgroundUI)
    
    // Adaptive Header / Navigation Bar background (#FFFFFF in Light, #0F172A in Dark - Cloned from Web App)
    static let headerBackgroundUI = UIColor.dynamic(light: .systemBackground, dark: UIColor(hex: slate900Hex))
    static let headerBackground = Color(uiColor: headerBackgroundUI)
    
    // Adaptive Input Background (systemGroupedBackground in Light, #0F172A in Dark - Cloned from Web App dark:bg-slate-900)
    static let inputBackgroundUI = UIColor.dynamic(light: .systemGroupedBackground, dark: UIColor(hex: slate900Hex))
    static let inputBackground = Color(uiColor: inputBackgroundUI)
    
    // Adaptive Text Colors (Cloned from Web App dark:text-white, dark:text-slate-400, dark:text-slate-500)
    static let textPrimary = Color(uiColor: UIColor.dynamic(lightHex: "0F172A", darkHex: "FFFFFF"))
    static let textSecondary = Color(uiColor: UIColor.dynamic(lightHex: "64748B", darkHex: slate400Hex))
    static let textMuted = Color(uiColor: UIColor.dynamic(lightHex: "94A3B8", darkHex: slate500Hex))
}

struct StatusColor {
    static let active = Color(hex: "10b981")
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
    
    static func uiColor(for status: String?) -> UIColor {
        guard let status = status else { return .systemGray }
        switch status.lowercased() {
        case "active": return UIColor(red: 34/255, green: 197/255, blue: 94/255, alpha: 1.0)
        case "static test": return UIColor(red: 234/255, green: 179/255, blue: 8/255, alpha: 1.0)
        case "potential mortality": return UIColor(red: 249/255, green: 115/255, blue: 22/255, alpha: 1.0)
        case "inactive": return UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1.0)
        case "dead": return UIColor(red: 220/255, green: 38/255, blue: 38/255, alpha: 1.0)
        default: return .systemGray
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
