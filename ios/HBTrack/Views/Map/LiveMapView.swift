import SwiftUI
import CoreLocation
import MapKit

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

struct LiveMapView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = MapViewModel()
    @State private var selectedSubTab: MapSubTab = .tracking
    
    @State private var showToolsDrawer = false
    @State private var showLayerPicker = false
    @State private var showLogoutAlert = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Main Top Bar
            HBTrackHeaderView(
                onRefresh: {
                    Task {
                        await viewModel.loadData(forceRefresh: true, visibilityFilter: authVM.isTransmitterVisible)
                    }
                },
                onSettings: nil
            )
            
            // Sub-tabs Pill Bar + Logout Button
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
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(Color(UIColor.systemBackground))
            
            // Map Container
            ZStack(alignment: .topLeading) {
                MapViewRepresentable(viewModel: viewModel)
                    .edgesIgnoringSafeArea(.bottom)
                
                // Top-Left Floating Controls Toggle
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
                            // Quick GPS fly to center button
                            Button {
                                viewModel.flyTo(CLLocationCoordinate2D(latitude: 25.276987, longitude: 51.520008))
                            } label: {
                                Image(systemName: "circle.circle")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundColor(.primary)
                                    .frame(width: 44, height: 44)
                                    .background(Color(UIColor.systemBackground).opacity(0.95))
                                    .cornerRadius(12)
                                    .shadow(color: Color.black.opacity(0.12), radius: 6, x: 0, y: 3)
                            }
                        }
                    }
                    
                    // Floating Tools Drawer (Screenshot 4)
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
                                
                                ToolGridButton(icon: "cloud.sun", label: "Weather") {
                                    // Toggle Weather / Satellite overlay
                                    viewModel.mapStyle = (viewModel.mapStyle == .standard ? .hybrid : .standard)
                                }
                                
                                ToolGridButton(icon: "clock.arrow.circlepath", label: "History", isActive: viewModel.showHistory) {
                                    withAnimation {
                                        viewModel.showHistory.toggle()
                                    }
                                }
                                
                                ToolGridButton(icon: "ruler", label: "Ruler", isActive: viewModel.isMeasuring) {
                                    withAnimation {
                                        viewModel.isMeasuring.toggle()
                                        if !viewModel.isMeasuring {
                                            viewModel.clearMeasurement()
                                        }
                                    }
                                }
                                
                                ToolGridButton(icon: "location.circle", label: "GPS") {
                                    viewModel.flyTo(CLLocationCoordinate2D(latitude: 25.276987, longitude: 51.520008))
                                }
                                
                                ToolGridButton(icon: "chart.pie", label: "Stats") {
                                    // Quick summary
                                    if let first = viewModel.annotations.first {
                                        viewModel.selectTransmitter(first)
                                    }
                                }
                            }
                        }
                        .padding(14)
                        .frame(width: 290)
                        .background(Color(UIColor.systemBackground).opacity(0.95))
                        .cornerRadius(18)
                        .shadow(color: Color.black.opacity(0.15), radius: 10, x: 0, y: 4)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .padding(.leading, 16)
                .padding(.top, 14)
                
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
            }
        }
        .task {
            if viewModel.transmitters.isEmpty {
                await viewModel.loadData(visibilityFilter: authVM.isTransmitterVisible)
                viewModel.subscribeToPositions(visibilityFilter: authVM.isTransmitterVisible)
            }
        }
        .sheet(isPresented: $viewModel.showDetail) {
            TransmitterDetailSheet(viewModel: viewModel, authRole: authVM.currentUserRole)
        }
        .confirmationDialog("Map Style", isPresented: $showLayerPicker, titleVisibility: .visible) {
            ForEach(MapStyleOption.allCases) { style in
                Button(style.rawValue) {
                    viewModel.mapStyle = style
                }
            }
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
