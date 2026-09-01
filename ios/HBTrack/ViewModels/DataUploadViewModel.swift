import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions

@MainActor
class DataUploadViewModel: ObservableObject {
    @Published var username = ""
    @Published var password = ""
    @Published var clientId = "api-telemetry"
    @Published var isSyncing = false
    @Published var syncResult: SyncResult?
    @Published var syncError: String?
    @Published var lastSyncTime: Date?

    func sync() async {
        guard !username.isEmpty, !password.isEmpty, !clientId.isEmpty else {
            syncError = "All fields are required"
            return
        }
        
        isSyncing = true
        syncError = nil
        
        do {
            // Attempt to call sync API
            let result = try await ArgosAPIService.shared.syncArgosData(
                username: username,
                password: password,
                clientId: clientId
            )
            self.syncResult = result
            self.lastSyncTime = Date()
            self.isSyncing = false
        } catch {
            self.syncError = error.localizedDescription
            self.isSyncing = false
        }
    }
    
    func clearCredentials() {
        username = ""
        password = ""
        clientId = "api-telemetry"
        syncResult = nil
        syncError = nil
    }
}
