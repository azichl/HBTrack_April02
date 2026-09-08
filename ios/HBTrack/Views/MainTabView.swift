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
    @Environment(\.horizontalSizeClass) private var originalHorizontalSizeClass
    
    init() {
        // Configure UITabBar appearance (cloned from Web App IOSBottomNav)
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(hex: "0F172A") : UIColor.secondarySystemGroupedBackground
        }
        
        let inactiveColor = UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(hex: "94A3B8") : UIColor(red: 148/255, green: 163/255, blue: 184/255, alpha: 1.0)
        }
        
        // Configure all layout variants (stacked, inline, compactInline) so iPad and iPhone match
        let itemAppearances = [
            appearance.stackedLayoutAppearance,
            appearance.inlineLayoutAppearance,
            appearance.compactInlineLayoutAppearance
        ]
        
        for itemAppearance in itemAppearances {
            // Active item color (Warm Gold)
            itemAppearance.selected.iconColor = AppTheme.brandGoldUI
            itemAppearance.selected.titleTextAttributes = [
                .foregroundColor: AppTheme.brandGoldUI,
                .font: UIFont.systemFont(ofSize: 10, weight: .semibold)
            ]
            
            // Inactive item color (Muted Slate #94A3B8 matching web app dark:text-gray-400)
            itemAppearance.normal.iconColor = inactiveColor
            itemAppearance.normal.titleTextAttributes = [
                .foregroundColor: inactiveColor,
                .font: UIFont.systemFont(ofSize: 10, weight: .medium)
            ]
        }
        
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
    
    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .environment(\.horizontalSizeClass, originalHorizontalSizeClass)
                .tabItem {
                    Image(systemName: "square.grid.2x2")
                    Text("Dashboard")
                }
                .tag(TabItem.dashboard)
            
            LiveMapView()
                .environment(\.horizontalSizeClass, originalHorizontalSizeClass)
                .tabItem {
                    Image(systemName: "map")
                    Text("Live Map")
                }
                .tag(TabItem.liveMap)
            
            if authVM.canUploadData {
                DataUploadView()
                    .environment(\.horizontalSizeClass, originalHorizontalSizeClass)
                    .tabItem {
                        Image(systemName: "cloud.fill")
                        Text("Data Upload")
                    }
                    .tag(TabItem.dataUpload)
            }
            
            SettingsView()
                .environment(\.horizontalSizeClass, originalHorizontalSizeClass)
                .tabItem {
                    Image(systemName: "gearshape")
                    Text("Settings")
                }
                .tag(TabItem.settings)
        }
        .background(TabBarControllerConfigurator())
        .environment(\.horizontalSizeClass, .compact)
        .tint(AppTheme.brandGold)
        .preferredColorScheme(isDarkMode ? .dark : .light)
    }
}

// Background UIKit bridge to configure UITabBarController on iPadOS 18+ to keep the bottom tab bar
private struct TabBarControllerConfigurator: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        let vc = UIViewController()
        vc.view.backgroundColor = .clear
        configure(vc)
        return vc
    }
    
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        configure(uiViewController)
    }
    
    private func configure(_ vc: UIViewController) {
        DispatchQueue.main.async {
            guard let tabBarController = vc.tabBarController else { return }
            if #available(iOS 18.0, *) {
                tabBarController.traitOverrides.horizontalSizeClass = .compact
                tabBarController.mode = .tabBar
            }
        }
    }
}

