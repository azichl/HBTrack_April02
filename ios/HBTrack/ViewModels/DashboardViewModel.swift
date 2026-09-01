import Foundation
import FirebaseAuth
import FirebaseFirestore
import SwiftUI

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var transmitters: [Transmitter] = []
    @Published var birds: [Bird] = []
    @Published var positions: [Position] = []
    @Published var alerts: [Alert] = []
    @Published var lastIngestTime: Date? = nil
    @Published var isLoading: Bool = false
    
    private var positionsListener: ListenerRegistration?
    
    deinit {
        positionsListener?.remove()
    }
    
    var totalDeployed: Int {
        transmitters.count
    }
    
    var statusBreakdown: [(status: String, count: Int, color: Color)] {
        var counts: [String: Int] = [:]
        for t in transmitters {
            counts[t.effectiveStatus, default: 0] += 1
        }
        
        return counts.map { (status, count) in
            (status: status, count: count, color: StatusColor.color(for: status))
        }.sorted { $0.count > $1.count }
    }
    
    var activeBirdsCount: Int {
        let activeTransmitters = transmitters.filter { $0.effectiveStatus.lowercased() == "active" }
        return activeTransmitters.count
    }
    
    var activeAlertsCount: Int {
        alerts.filter { $0.isActive && $0.type.lowercased() != "ticket_created" }.count
    }
    
    var criticalAlertsCount: Int {
        alerts.filter { $0.isActive && $0.severity.lowercased() == "critical" }.count
    }
    
    var ingestionChartData: [(date: Date, count: Int)] {
        let calendar = Calendar.current
        var countsByDate: [Date: Int] = [:]
        
        for position in positions {
            if let date = position.parsedDate {
                let startOfDay = calendar.startOfDay(for: date)
                countsByDate[startOfDay, default: 0] += 1
            }
        }
        
        // Fill last 7 days
        var result: [(date: Date, count: Int)] = []
        let today = calendar.startOfDay(for: Date())
        for i in (0..<7).reversed() {
            if let date = calendar.date(byAdding: .day, value: -i, to: today) {
                result.append((date: date, count: countsByDate[date] ?? 0))
            }
        }
        return result
    }
    
    var recentAlerts: [Alert] {
        alerts
            .filter { $0.isActive }
            .sorted { $0.timestamp > $1.timestamp }
            .prefix(6)
            .map { $0 }
    }
    
    func loadData() async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            async let fetchedTransmitters = TransmitterService.shared.fetchAllTransmitters()
            async let fetchedBirds = TransmitterService.shared.fetchAllBirds()
            async let fetchedPositions = TransmitterService.shared.fetchLatestPositions()
            async let fetchedAlerts = TransmitterService.shared.fetchAlerts()
            
            self.transmitters = try await fetchedTransmitters
            self.birds = try await fetchedBirds
            self.positions = try await fetchedPositions
            self.alerts = try await fetchedAlerts
            
            // Find latest timestamp across positions/transmitters
            if let latestPos = positions.compactMap({ $0.parsedDate }).max() {
                self.lastIngestTime = latestPos
            }
        } catch {
            print("Error loading dashboard data: \(error)")
        }
    }
    
    func subscribeToUpdates() {
        positionsListener?.remove()
        positionsListener = TransmitterService.shared.subscribeToPositions { [weak self] updatedPositions in
            guard let self = self else { return }
            Task { @MainActor in
                self.positions = updatedPositions
                if let latest = updatedPositions.compactMap({ $0.parsedDate }).max() {
                    self.lastIngestTime = latest
                }
            }
        }
    }
}
