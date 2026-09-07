import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @AppStorage("isDarkMode") private var isDarkMode = false
    
    init() {
        // Configure UITabBar appearance
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(hex: "4A6E8D") : UIColor.secondarySystemGroupedBackground
        }
        
        // Active item color (Warm Gold)
        appearance.stackedLayoutAppearance.selected.iconColor = AppTheme.brandGoldUI
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: AppTheme.brandGoldUI,
            .font: UIFont.systemFont(ofSize: 10, weight: .semibold)
        ]
        
        // Inactive item color (Muted Slate in light, adaptive contrast in dark)
        let inactiveColor = UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(hex: "D1DFEC").withAlphaComponent(0.7) : UIColor(red: 148/255, green: 163/255, blue: 184/255, alpha: 1.0)
        }
        appearance.stackedLayoutAppearance.normal.iconColor = inactiveColor
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [
            .foregroundColor: inactiveColor,
            .font: UIFont.systemFont(ofSize: 10, weight: .regular)
        ]
        
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
    
    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Image(systemName: "square.grid.2x2")
                    Text("Dashboard")
                }
            
            LiveMapView()
                .tabItem {
                    Image(systemName: "map")
                    Text("Live Map")
                }
            
            if authVM.canUploadData {
                DataUploadView()
                    .tabItem {
                        Image(systemName: "cloud.fill")
                        Text("Data Upload")
                    }
            }
            
            SettingsView()
                .tabItem {
                    Image(systemName: "gearshape")
                    Text("Settings")
                }
        }
        .tint(AppTheme.brandGold)
        .preferredColorScheme(isDarkMode ? .dark : .light)
    }
}
