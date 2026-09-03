import Foundation

struct DateFormatters {
    static func parseDate(_ dateString: String) -> Date? {
        let trimmed = dateString.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        
        // 1. Numeric timestamp (epoch ms or seconds)
        if let num = Double(trimmed) {
            if num > 10_000_000_000 {
                return Date(timeIntervalSince1970: num / 1000.0)
            } else if num > 0 {
                return Date(timeIntervalSince1970: num)
            }
        }
        
        // 2. ISO8601 with fractional seconds
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: trimmed) {
            return date
        }
        
        // 3. ISO8601 standard
        isoFormatter.formatOptions = [.withInternetDateTime]
        if let date = isoFormatter.date(from: trimmed) {
            return date
        }
        
        // 4. Fallback across all standard formats
        let formats = [
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss.SSS",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd",
            "dd/MM/yyyy HH:mm:ss",
            "dd/MM/yyyy"
        ]
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(abbreviation: "UTC")
        
        for fmt in formats {
            df.dateFormat = fmt
            if let date = df.date(from: trimmed) {
                return date
            }
        }
        return nil
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
