import SwiftUI

enum TabItem: Int, Hashable {
    case dashboard = 0
    case liveMap = 1
    case dataUpload = 2
    case settings = 3
}

struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @AppStorage("isDarkMode") private var isDarkMode = false
    @State private var selectedTab: TabItem = .liveMap
    
    init() {
        // Configure UITabBar appearance (cloned from Web App IOSBottomNav)
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(hex: "0F172A") : UIColor.secondarySystemGroupedBackground
        }
        
        // Active item color (Warm Gold)
        appearance.stackedLayoutAppearance.selected.iconColor = AppTheme.brandGoldUI
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: AppTheme.brandGoldUI,
            .font: UIFont.systemFont(ofSize: 10, weight: .semibold)
        ]
        
        // Inactive item color (Muted Slate #94A3B8 matching web app dark:text-gray-400)
        let inactiveColor = UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(hex: "94A3B8") : UIColor(red: 148/255, green: 163/255, blue: 184/255, alpha: 1.0)
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
        TabView(selection: $selectedTab) {
            DashboardView()
                .tabItem {
                    Image(systemName: "square.grid.2x2")
                    Text("Dashboard")
                }
                .tag(TabItem.dashboard)
            
            LiveMapView()
                .tabItem {
                    Image(systemName: "map")
                    Text("Live Map")
                }
                .tag(TabItem.liveMap)
            
            if authVM.canUploadData {
                DataUploadView()
                    .tabItem {
                        Image(systemName: "cloud.fill")
                        Text("Data Upload")
                    }
                    .tag(TabItem.dataUpload)
            }
            
            SettingsView()
                .tabItem {
                    Image(systemName: "gearshape")
                    Text("Settings")
                }
                .tag(TabItem.settings)
        }
        .tint(AppTheme.brandGold)
        .preferredColorScheme(isDarkMode ? .dark : .light)
    }
}
