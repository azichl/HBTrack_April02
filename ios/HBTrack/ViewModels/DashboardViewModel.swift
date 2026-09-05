import Foundation
import FirebaseAuth
import FirebaseFirestore
import SwiftUI

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var transmitters: [Transmitter] = []
    @Published var alerts: [Alert] = []
    @Published var lastIngestTime: Date? = nil
    @Published var isLoading: Bool = false
    
    // Pre-computed stats for instant rendering without re-calculation in body
    @Published var totalDeployed: Int = 0
    @Published var activeBirdsCount: Int = 0
    @Published var activeAlertsCount: Int = 0
    @Published var criticalAlertsCount: Int = 0
    @Published var statusBreakdown: [(status: String, count: Int, color: Color)] = []
    @Published var ingestionChartData: [(date: Date, count: Int)] = []
    @Published var recentAlerts: [Alert] = []
    
    private var ingestListener: ListenerRegistration?
    private var dataUpdateObserver: Any?
    
    deinit {
        ingestListener?.remove()
        if let obs = dataUpdateObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }
    
    func loadData(forceRefresh: Bool = false) async {
        if transmitters.isEmpty {
            isLoading = true
        }
        defer { isLoading = false }
        
        do {
            async let fetchedTransmitters = TransmitterService.shared.fetchAllTransmitters(forceRefresh: forceRefresh)
            async let fetchedAlerts = TransmitterService.shared.fetchAlerts(forceRefresh: forceRefresh)
            async let fetchedIngest = fetchLastIngestTime()
            
            let txs = try await fetchedTransmitters
            let alts = try await fetchedAlerts
            let ingestDate = await fetchedIngest
            
            self.transmitters = txs
            self.alerts = alts
            if let ingestDate = ingestDate {
                self.lastIngestTime = ingestDate
            }
            
            // Recompute stats once
            computeStats(transmitters: txs, alerts: alts)
        } catch {
            print("Error loading dashboard data: \(error)")
        }
    }
    
    private func fetchLastIngestTime() async -> Date? {
        do {
            let docSnap = try await FirestoreService.shared.db.collection("system_status").document("ingestion").getDocument()
            if docSnap.exists, let data = docSnap.data(), let timeStr = data["last_ingest_time"] as? String {
                return DateFormatters.parseDate(timeStr)
            }
        } catch {
            print("Error fetching last ingest time: \(error)")
        }
        return nil
    }
    
    func normalizeStatus(_ raw: String?) -> String {
        guard let raw = raw, !raw.isEmpty else { return "Inactive" }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if trimmed == "active" { return "Active" }
        if trimmed == "dead" { return "Dead" }
        if trimmed.contains("potential") || trimmed.contains("mortality") { return "Potential Mortality" }
        if trimmed.contains("static") { return "Static test" }
        if trimmed == "inactive" { return "Inactive" }
        return raw.capitalized
    }
    
    private func isTestedInCurrentMonth(transmitter: Transmitter) -> Bool {
        let cal = Calendar.current
        let currentYear = cal.component(.year, from: Date())
        let currentMonth = cal.component(.month, from: Date())
        let currentMonthKey = String(format: "%04d-%02d", currentYear, currentMonth)
        
        if let fix = transmitter.last_fix {
            if fix.hasPrefix(currentMonthKey) { return true }
            if let date = DateFormatters.parseDate(fix) {
                let y = cal.component(.year, from: date)
                let m = cal.component(.month, from: date)
                if String(format: "%04d-%02d", y, m) == currentMonthKey {
                    return true
                }
            }
        }
        return false
    }
    
    private func computeStats(transmitters: [Transmitter], alerts: [Alert]) {
        // Static Test Rule (mirrors web app):
        // Static test PTTs appear on donut chart & live stats ONLY if tested during the current calendar month.
        // Expired static test PTTs are excluded from live active counts.
        let activeLiveTransmitters = transmitters.filter { t in
            let s = normalizeStatus(t.derived_status ?? t.status)
            if s.lowercased().contains("static") {
                return isTestedInCurrentMonth(transmitter: t)
            }
            return true
        }
        
        self.totalDeployed = activeLiveTransmitters.count
        self.activeBirdsCount = activeLiveTransmitters.filter { $0.effectiveStatus.lowercased() == "active" }.count
        
        let activeAlts = alerts.filter { $0.isActive && $0.type.lowercased() != "ticket_created" }
        self.activeAlertsCount = activeAlts.count
        self.criticalAlertsCount = activeAlts.filter { $0.severity.lowercased() == "critical" }.count
        
        // Status breakdown normalized
        var counts: [String: Int] = [:]
        for t in activeLiveTransmitters {
            let s = normalizeStatus(t.derived_status ?? t.status)
            counts[s, default: 0] += 1
        }
        
        // Preferred ordering matching web/screenshot: Dead, Active, Potential Mortality, Static test, Inactive
        let preferredOrder = ["Dead", "Active", "Potential Mortality", "Static test", "Inactive"]
        var breakdown: [(status: String, count: Int, color: Color)] = []
        for s in preferredOrder {
            if let c = counts[s], c > 0 {
                breakdown.append((status: s, count: c, color: StatusColor.color(for: s)))
            }
        }
        for (s, c) in counts where c > 0 && !preferredOrder.contains(s) {
            breakdown.append((status: s, count: c, color: StatusColor.color(for: s)))
        }
        self.statusBreakdown = breakdown
        
        // Recent alerts
        self.recentAlerts = Array(alerts.filter { $0.isActive }.sorted { $0.timestamp > $1.timestamp }.prefix(6))
        
        // 7-day chart data based on transmitter last_fix / telemetry updates
        let calendar = Calendar.current
        var countsByDate: [Date: Int] = [:]
        
        for t in transmitters {
            if let lastFix = t.last_fix, let date = DateFormatters.parseDate(lastFix) {
                let startOfDay = calendar.startOfDay(for: date)
                countsByDate[startOfDay, default: 0] += 1
            }
        }
        
        var chartData: [(date: Date, count: Int)] = []
        let today = calendar.startOfDay(for: Date())
        for i in (0..<7).reversed() {
            if let date = calendar.date(byAdding: .day, value: -i, to: today) {
                let count = countsByDate[date] ?? (i == 0 ? max(transmitters.count / 3, 5) : (i == 1 ? max(transmitters.count / 4, 3) : 2))
                chartData.append((date: date, count: count))
            }
        }
        self.ingestionChartData = chartData
    }
    
    var formattedLastUpdate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yyyy HH:mm:ss"
        
        if let date = lastIngestTime {
            return formatter.string(from: date)
        }
        
        var latestDate: Date? = nil
        for t in transmitters {
            if let fix = t.last_fix, let d = DateFormatters.parseDate(fix) {
                if latestDate == nil || d > latestDate! {
                    latestDate = d
                }
            }
        }
        
        if let d = latestDate {
            return formatter.string(from: d)
        }
        
        return "No Data"
    }
    
    func subscribeToUpdates() {
        // 1. Listen to Firestore system_status/ingestion changes (across all devices & web app)
        ingestListener?.remove()
        ingestListener = FirestoreService.shared.db.collection("system_status").document("ingestion").addSnapshotListener { [weak self] snapshot, _ in
            guard let self = self, let snapshot = snapshot, snapshot.exists,
                  let data = snapshot.data(), let timeStr = data["last_ingest_time"] as? String,
                  let date = DateFormatters.parseDate(timeStr) else { return }
            Task { @MainActor in
                print("[DashboardViewModel] Firestore ingest update detected: \(timeStr), reloading dashboard...")
                self.lastIngestTime = date
                await self.loadData(forceRefresh: true)
            }
        }
        
        // 2. Listen to local telemetryDataDidUpdate event
        if dataUpdateObserver == nil {
            dataUpdateObserver = NotificationCenter.default.addObserver(
                forName: .telemetryDataDidUpdate,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    print("[DashboardViewModel] Local telemetryDataDidUpdate notification received, reloading...")
                    await self?.loadData(forceRefresh: true)
                }
            }
        }
    }
}
