import Foundation

struct DateFormatters {
    private static let isoFractionalFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    
    private static let isoStandardFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    
    private static let fallbackFormatters: [DateFormatter] = {
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
        return formats.map { fmt in
            let df = DateFormatter()
            df.locale = Locale(identifier: "en_US_POSIX")
            df.timeZone = TimeZone(abbreviation: "UTC")
            df.dateFormat = fmt
            return df
        }
    }()

    static func fastParseTimestampMs(_ dateString: String) -> Double {
        let trimmed = dateString.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .nan }
        
        // 1. Numeric timestamp (epoch ms or seconds)
        if let num = Double(trimmed) {
            if num > 10_000_000_000 {
                return num
            } else if num > 0 {
                return num * 1000.0
            }
        }
        
        // 2. ISO8601 with fractional seconds
        if let date = isoFractionalFormatter.date(from: trimmed) {
            return date.timeIntervalSince1970 * 1000.0
        }
        
        // 3. ISO8601 standard
        if let date = isoStandardFormatter.date(from: trimmed) {
            return date.timeIntervalSince1970 * 1000.0
        }
        
        // Space to T replacement for web parity
        if trimmed.contains(" ") && !trimmed.contains("T") {
            let replaced = trimmed.replacingOccurrences(of: " ", with: "T")
            if let date = isoFractionalFormatter.date(from: replaced) ?? isoStandardFormatter.date(from: replaced) {
                return date.timeIntervalSince1970 * 1000.0
            }
        }
        
        // 4. Preallocated fallback formatters
        for df in fallbackFormatters {
            if let date = df.date(from: trimmed) {
                return date.timeIntervalSince1970 * 1000.0
            }
        }
        return .nan
    }
    
    static func parseDate(_ dateString: String) -> Date? {
        let ms = fastParseTimestampMs(dateString)
        if ms.isNaN { return nil }
        return Date(timeIntervalSince1970: ms / 1000.0)
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
    
    static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    
    static func displayDate(_ date: Date) -> String {
        let df = DateFormatter()
        df.dateStyle = .medium
        df.timeStyle = .none
        return df.string(from: date)
    }
    
    static func displayTime(_ date: Date) -> String {
        let df = DateFormatter()
        df.dateStyle = .none
        df.timeStyle = .medium
        return df.string(from: date)
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
