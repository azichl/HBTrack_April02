import Foundation

struct DateFormatters {
    static func parseDate(_ dateString: String) -> Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: dateString) {
            return date
        }
        
        isoFormatter.formatOptions = [.withInternetDateTime]
        if let date = isoFormatter.date(from: dateString) {
            return date
        }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        formatter.timeZone = TimeZone(abbreviation: "UTC")
        return formatter.date(from: dateString)
    }
    
    static func relativeTime(from date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
    
    static func relativeTimeString(from date: Date) -> String {
        return relativeTime(from: date)
    }
    
    static func relativeTime(fromString dateString: String?) -> String {
        guard let ds = dateString, let date = parseDate(ds) else { return "Unknown" }
        return relativeTime(from: date)
    }
    
    static func displayFormat(_ date: Date, timeZone: TimeZone = TimeZone.current) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        formatter.timeZone = timeZone
        return formatter.string(from: date)
    }
    
    static let supportedTimeZones: [String: TimeZone] = [
        "System": TimeZone.current,
        "UTC": TimeZone(identifier: "UTC")!,
        "Asia/Qatar (GMT+3)": TimeZone(identifier: "Asia/Qatar") ?? TimeZone(secondsFromGMT: 3 * 3600)!,
        "Asia/Riyadh (GMT+3)": TimeZone(identifier: "Asia/Riyadh") ?? TimeZone(secondsFromGMT: 3 * 3600)!,
        "Asia/Dubai (GMT+4)": TimeZone(identifier: "Asia/Dubai") ?? TimeZone(secondsFromGMT: 4 * 3600)!,
        "Asia/Almaty (GMT+5)": TimeZone(identifier: "Asia/Almaty") ?? TimeZone(secondsFromGMT: 5 * 3600)!
    ]
}
