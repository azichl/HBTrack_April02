import Foundation
import SwiftUI

@MainActor
class DataUploadViewModel: ObservableObject {
    @Published var username = ""
    @Published var password = ""
    @Published var clientId = "api-telemetry"
    @Published var timeHorizon: String = "24h"
    @Published var customStartDate: Date = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
    @Published var customEndDate: Date = Date()
    
    @Published var isSyncing = false
    @Published var syncStatus: String = "idle" // "idle", "testing", "success", "error"
    @Published var logs: [String] = []
    @Published var syncResult: SyncResult?
    @Published var syncError: String?
    @Published var lastSyncTime: Date?

    func sync() async {
        guard !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            syncError = "Username and Password are required"
            syncStatus = "error"
            return
        }
        
        isSyncing = true
        syncStatus = "testing"
        syncError = nil
        logs = []
        
        let (startDate, endDate): (Date, Date) = {
            if timeHorizon == "24h" {
                return (Date().addingTimeInterval(-24 * 3600), Date())
            } else {
                return (customStartDate, customEndDate)
            }
        }()
        
        do {
            let result = try await ArgosAPIService.shared.syncArgosData(
                username: username,
                password: password,
                clientId: clientId,
                startDate: startDate,
                endDate: endDate,
                onLog: { [weak self] line in
                    Task { @MainActor in
                        self?.logs.append(line)
                    }
                }
            )
            self.syncResult = result
            self.lastSyncTime = Date()
            self.syncStatus = "success"
            self.isSyncing = false
        } catch {
            self.syncError = error.localizedDescription
            self.syncStatus = "error"
            self.logs.append("[ERROR] \(error.localizedDescription)")
            self.isSyncing = false
        }
    }
    
    func clearCredentials() {
        username = ""
        password = ""
        clientId = "api-telemetry"
        syncResult = nil
        syncError = nil
        syncStatus = "idle"
        logs = []
    }
}
