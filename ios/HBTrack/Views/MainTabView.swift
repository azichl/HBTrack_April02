import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @AppStorage("isDarkMode") private var isDarkMode = false
    
    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "chart.bar.fill")
                }
            
            LiveMapView()
                .tabItem {
                    Label("Live Map", systemImage: "map.fill")
                }
            
            if authVM.canUploadData {
                DataUploadView()
                    .tabItem {
                        Label("Data Upload", systemImage: "arrow.up.doc.fill")
                    }
                    .badge("!") // Optional badge
            }
            
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
        }
        .preferredColorScheme(isDarkMode ? .dark : .light)
    }
}
