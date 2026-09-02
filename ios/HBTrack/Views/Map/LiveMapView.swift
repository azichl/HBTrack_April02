import SwiftUI
import CoreLocation

enum MapSubTab: String, CaseIterable, Identifiable {
    case tracking = "Tracking"
    case windy = "Windy"
    case meteoblue = "Meteoblue"
    
    var id: String { self.rawValue }
    
    var icon: String {
        switch self {
        case .tracking: return "map"
        case .windy: return "wind"
        case .meteoblue: return "snowflake"
        }
    }
}

enum MapTileOption: String, CaseIterable, Identifiable {
    case googleHybrid = "Google Satellite (Hybrid)"
    case googleRoadmap = "Google Roadmap"
    case openStreetMap = "OpenStreetMap"
    case esriSatellite = "Esri World Imagery"
    
    var id: String { self.rawValue }
    
    var layerKey: String {
        switch self {
        case .googleHybrid: return "google_hybrid"
        case .googleRoadmap: return "google_roadmap"
        case .openStreetMap: return "osm"
        case .esriSatellite: return "esri"
        }
    }
}

enum WeatherOverlayOption: String, CaseIterable, Identifiable {
    case none = "None (Off)"
    case temp = "Temperature (°C)"
    case precipitation = "Precipitation / Rain"
    case wind = "Wind Speed"
    case clouds = "Cloud Cover"
    
    var id: String { self.rawValue }
    
    var overlayKey: String {
        switch self {
        case .none: return "none"
        case .temp: return "temp_new"
        case .precipitation: return "precipitation_new"
        case .wind: return "wind_new"
        case .clouds: return "clouds_new"
        }
    }
}

struct LiveMapView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = MapViewModel()
    @State private var selectedSubTab: MapSubTab = .tracking
    
    @State private var selectedTileLayer: MapTileOption = .googleHybrid
    @State private var selectedWeatherOverlay: WeatherOverlayOption = .none
    
    @State private var showToolsDrawer = false
    @State private var showLayerPicker = false
    @State private var showWeatherPicker = false
    @State private var showStatsSheet = false
    @State private var showLogoutAlert = false
    @State private var isFullscreen = false
    
    var body: some View {
        VStack(spacing: 0) {
            if !isFullscreen {
                // Sub-tabs Pill Bar + Action Buttons
                HStack(spacing: 12) {
                    // Sub Tabs (Tracking, Windy, Meteoblue)
                    HStack(spacing: 4) {
                        ForEach(MapSubTab.allCases) { tab in
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    selectedSubTab = tab
                                }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: tab.icon)
                                        .font(.system(size: 13))
                                    Text(tab.rawValue)
                                        .font(.system(size: 13, weight: .medium))
                                }
                                .foregroundColor(selectedSubTab == tab ? AppTheme.brandGold : AppTheme.textSecondary)
                                .padding(.vertical, 8)
                                .padding(.horizontal, 10)
                                .background(
                                    selectedSubTab == tab ? Color(UIColor.secondarySystemGroupedBackground) : Color.clear
                                )
                                .cornerRadius(10)
                                .shadow(color: selectedSubTab == tab ? Color.black.opacity(0.04) : Color.clear, radius: 3, x: 0, y: 1)
                            }
                        }
                    }
                    .padding(4)
                    .background(Color(UIColor.secondarySystemGroupedBackground).opacity(0.8))
                    .cornerRadius(14)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                    )
                    
                    Spacer()
                    
                    HStack(spacing: 8) {
                        // Refresh Button
                        Button {
                            Task {
                                await viewModel.loadData(forceRefresh: true, visibilityFilter: authVM.isTransmitterVisible)
                            }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(AppTheme.brandGold)
                                .frame(width: 40, height: 40)
                                .background(Color(UIColor.secondarySystemGroupedBackground))
                                .cornerRadius(12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                                )
                                .shadow(color: Color.black.opacity(0.04), radius: 3, x: 0, y: 1)
                        }
                        
                        // Floating Logout Button
                        Button {
                            showLogoutAlert = true
                        } label: {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(.red)
                                .frame(width: 40, height: 40)
                                .background(Color(UIColor.secondarySystemGroupedBackground))
                                .cornerRadius(12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                                )
                                .shadow(color: Color.black.opacity(0.04), radius: 3, x: 0, y: 1)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(Color(UIColor.systemBackground))
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            
            // Map Container depending on sub tab
            ZStack(alignment: .topLeading) {
                switch selectedSubTab {
                case .tracking:
                    LeafletMapView(
                        viewModel: viewModel,
                        activeWeatherOverlay: selectedWeatherOverlay.overlayKey,
                        activeBaseLayer: selectedTileLayer.layerKey,
                        onMarkerTapped: { txId in
                            if let tx = viewModel.transmitters.first(where: { $0.platform_id == txId }) {
                                viewModel.selectTransmitter(tx)
                            }
                        }
                    )
                    .edgesIgnoringSafeArea(.bottom)
                    
                    // Top-Left Floating Controls Toggle & Tools Drawer
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Button {
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    showToolsDrawer.toggle()
                                }
                            } label: {
                                Image(systemName: "slider.horizontal.3")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundColor(.primary)
                                    .frame(width: 44, height: 44)
                                    .background(Color(UIColor.systemBackground).opacity(0.95))
                                    .cornerRadius(12)
                                    .shadow(color: Color.black.opacity(0.12), radius: 6, x: 0, y: 3)
                            }
                            
                            if !showToolsDrawer {
                                // Fullscreen Toggle Button
                                Button {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        isFullscreen.toggle()
                                    }
                                } label: {
                                    Image(systemName: isFullscreen ? "arrow.down.right.and.arrow.up.left" : "viewfinder")
                                        .font(.system(size: 17, weight: .semibold))
                                        .foregroundColor(isFullscreen ? AppTheme.brandGold : .primary)
                                        .frame(width: 44, height: 44)
                                        .background(Color(UIColor.systemBackground).opacity(0.95))
                                        .cornerRadius(12)
                                        .shadow(color: Color.black.opacity(0.12), radius: 6, x: 0, y: 3)
                                }
                            }
                        }
                        
                        // Floating Tools Drawer
                        if showToolsDrawer {
                            VStack(spacing: 14) {
                                // Search Box
                                HStack(spacing: 8) {
                                    Image(systemName: "magnifyingglass")
                                        .foregroundColor(AppTheme.textMuted)
                                    TextField("Search PTT ID...", text: $viewModel.searchQuery)
                                        .font(.system(size: 14))
                                        .autocapitalization(.none)
                                        .disableAutocorrection(true)
                                        .onChange(of: viewModel.searchQuery) { _ in
                                            viewModel.search()
                                        }
                                    
                                    if !viewModel.searchQuery.isEmpty {
                                        Button {
                                            viewModel.searchQuery = ""
                                            viewModel.search()
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundColor(.gray)
                                        }
                                    }
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(Color(UIColor.systemBackground))
                                .cornerRadius(10)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                                )
                                
                                // 6 Tools Grid (2 rows x 3 cols)
                                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 14) {
                                    ToolGridButton(icon: "square.3.layers.3d", label: "Layers") {
                                        showLayerPicker = true
                                    }
                                    
                                    ToolGridButton(
                                        icon: "cloud.sun",
                                        label: "Weather",
                                        isActive: selectedWeatherOverlay != .none
                                    ) {
                                        showWeatherPicker = true
                                    }
                                    
                                    ToolGridButton(
                                        icon: "clock.arrow.circlepath",
                                        label: "History",
                                        isActive: viewModel.showHistory
                                    ) {
                                        withAnimation {
                                            viewModel.showHistory.toggle()
                                        }
                                    }
                                    
                                    ToolGridButton(
                                        icon: "ruler",
                                        label: "Ruler",
                                        isActive: viewModel.isMeasuring
                                    ) {
                                        withAnimation {
                                            viewModel.isMeasuring.toggle()
                                            if !viewModel.isMeasuring {
                                                viewModel.clearMeasurement()
                                            }
                                        }
                                    }
                                    
                                    ToolGridButton(
                                        icon: "location.circle",
                                        label: "GPS",
                                        isActive: viewModel.isTrackingUser
                                    ) {
                                        withAnimation {
                                            viewModel.toggleUserTracking()
                                        }
                                    }
                                    
                                    ToolGridButton(icon: "chart.pie", label: "Stats") {
                                        showStatsSheet = true
                                    }
                                }
                            }
                            .padding(14)
                            .frame(width: 290)
                            .background(Color(UIColor.systemBackground).opacity(0.96))
                            .cornerRadius(18)
                            .shadow(color: Color.black.opacity(0.15), radius: 10, x: 0, y: 4)
                            .transition(.scale.combined(with: .opacity))
                        }
                    }
                    .padding(.leading, 16)
                    .padding(.top, isFullscreen ? 54 : 14)
                    
                    // History Overlay
                    if viewModel.showHistory {
                        VStack {
                            Spacer()
                            HistoryOverlay(viewModel: viewModel)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    
                    // Measurement Overlay
                    if viewModel.isMeasuring {
                        VStack {
                            Spacer()
                            MeasurementOverlay(viewModel: viewModel)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    
                case .windy:
                    WindyMapView(viewModel: viewModel)
                        .edgesIgnoringSafeArea(.bottom)
                    
                case .meteoblue:
                    MeteoblueMapView(viewModel: viewModel)
                        .edgesIgnoringSafeArea(.bottom)
                }
            }
            .ignoresSafeArea(.all, edges: isFullscreen ? .all : .bottom)
        }
        .toolbar(isFullscreen ? .hidden : .visible, for: .tabBar)
        .task {
            if viewModel.transmitters.isEmpty {
                await viewModel.loadData(visibilityFilter: authVM.isTransmitterVisible)
                viewModel.subscribeToPositions(visibilityFilter: authVM.isTransmitterVisible)
            }
        }
        .sheet(isPresented: $viewModel.showDetail) {
            TransmitterDetailSheet(viewModel: viewModel, authRole: authVM.currentUserRole)
        }
        .sheet(isPresented: $showStatsSheet) {
            MapStatsSummarySheet(viewModel: viewModel)
        }
        .confirmationDialog("Select Map Tile Layer", isPresented: $showLayerPicker, titleVisibility: .visible) {
            ForEach(MapTileOption.allCases) { option in
                Button(option.rawValue) {
                    selectedTileLayer = option
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Select Weather Overlay", isPresented: $showWeatherPicker, titleVisibility: .visible) {
            ForEach(WeatherOverlayOption.allCases) { option in
                Button(option.rawValue) {
                    selectedWeatherOverlay = option
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Sign Out", isPresented: $showLogoutAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) {
                authVM.logout()
            }
        } message: {
            Text("Are you sure you want to sign out of RAF Tracking?")
        }
    }
}

// Tool Grid Button Helper
private struct ToolGridButton: View {
    let icon: String
    let label: String
    var isActive: Bool = false
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(isActive ? AppTheme.brandGold : .primary)
                Text(label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(isActive ? AppTheme.brandGold : AppTheme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(isActive ? AppTheme.brandGoldLight : Color.clear)
            .cornerRadius(10)
        }
    }
}

// Map Stats Sheet
private struct MapStatsSummarySheet: View {
    @ObservedObject var viewModel: MapViewModel
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            List {
                Section(header: Text("Transmitters Summary")) {
                    HStack {
                        Text("Total Deployed")
                        Spacer()
                        Text("\(viewModel.transmitters.count)").bold()
                    }
                    HStack {
                        Text("Active Birds")
                        Spacer()
                        Text("\(viewModel.annotations.count)")
                            .foregroundColor(Color(hex: "22c55e"))
                            .bold()
                    }
                }
                
                Section(header: Text("Status Breakdown")) {
                    let activeCount = viewModel.transmitters.filter { ($0.derived_status ?? $0.status ?? "").lowercased() == "active" }.count
                    let potentialCount = viewModel.transmitters.filter { ($0.derived_status ?? $0.status ?? "").lowercased().contains("potential") }.count
                    let deadCount = viewModel.transmitters.filter { ($0.derived_status ?? $0.status ?? "").lowercased() == "dead" }.count
                    let staticCount = viewModel.transmitters.filter { ($0.derived_status ?? $0.status ?? "").lowercased().contains("static") }.count
                    
                    HStack {
                        Circle().fill(Color(hex: "22c55e")).frame(width: 8, height: 8)
                        Text("Active")
                        Spacer()
                        Text("\(activeCount)")
                    }
                    HStack {
                        Circle().fill(Color(hex: "f97316")).frame(width: 8, height: 8)
                        Text("Potential Mortality")
                        Spacer()
                        Text("\(potentialCount)")
                    }
                    HStack {
                        Circle().fill(Color(hex: "dc2626")).frame(width: 8, height: 8)
                        Text("Dead")
                        Spacer()
                        Text("\(deadCount)")
                    }
                    HStack {
                        Circle().fill(Color(hex: "eab308")).frame(width: 8, height: 8)
                        Text("Static Test")
                        Spacer()
                        Text("\(staticCount)")
                    }
                }
            }
            .navigationTitle("Map Statistics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}
