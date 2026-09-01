import SwiftUI
import FirebaseCore

@main
struct HBTrackApp: App {
    @StateObject private var authVM = AuthViewModel()
    
    init() {
        FirebaseApp.configure()
    }
    
    var body: some Scene {
        WindowGroup {
            Group {
                if authVM.isLoading {
                    ProgressView("Loading...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if authVM.isAuthenticated {
                    MainTabView()
                        .environmentObject(authVM)
                } else {
                    LoginView()
                        .environmentObject(authVM)
                }
            }
        }
    }
}
