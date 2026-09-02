import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel()
    @State private var showLogoutAlert = false
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 16) {
                    // Top Sub Header / Quick Action Bar
                    HStack {
                        HStack(spacing: 6) {
                            Image(systemName: "chart.bar.fill")
                                .foregroundColor(AppTheme.brandGold)
                            Text("System Overview")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.primary)
                        }
                        
                        Spacer()
                        
                        HStack(spacing: 8) {
                            // Refresh Button
                            Button {
                                Task { await viewModel.loadData(forceRefresh: true) }
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
                    .padding(.top, 4)
                    
                    // KPIs Grid
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                        KPICardView(
                            title: "Deployed PTTs",
                            value: "\(viewModel.totalDeployed)",
                            subtitle: "Total registered",
                            icon: "antenna.radiowaves.left.and.right",
                            iconColor: AppTheme.brandGold,
                            trend: nil
                        )
                        
                        KPICardView(
                            title: "Birds Tracked",
                            value: "\(viewModel.activeBirdsCount)",
                            subtitle: "Active links",
                            icon: "bird",
                            iconColor: Color(hex: "22c55e"),
                            trend: nil
                        )
                        
                        KPICardView(
                            title: "Active Alerts",
                            value: "\(viewModel.activeAlertsCount)",
                            subtitle: "\(viewModel.criticalAlertsCount) critical",
                            icon: "exclamationmark.triangle",
                            iconColor: viewModel.criticalAlertsCount > 0 ? Color(hex: "dc2626") : Color(hex: "f97316"),
                            trend: nil
                        )
                        
                        KPICardView(
                            title: "Last Update",
                            value: lastUpdateString,
                            subtitle: "System sync",
                            icon: "clock.arrow.2.circlepath",
                            iconColor: Color.blue,
                            trend: nil
                        )
                    }
                    .padding(.horizontal, 16)
                    
                    // Transmitter Status Donut Chart
                    StatusPieChart(data: viewModel.statusBreakdown)
                        .padding(.horizontal, 16)
                    
                    // Data Ingestion Flow (7 Days)
                    IngestionChart(data: viewModel.ingestionChartData)
                        .padding(.horizontal, 16)
                    
                    // Alerts Feed
                    AlertFeedView(alerts: viewModel.recentAlerts)
                        .padding(.horizontal, 16)
                    
                    Spacer().frame(height: 20)
                }
                .padding(.vertical, 8)
            }
            .background(Color(UIColor.systemGroupedBackground))
            .refreshable {
                await viewModel.loadData(forceRefresh: true)
            }
        }
        .task {
            if viewModel.transmitters.isEmpty {
                await viewModel.loadData()
                viewModel.subscribeToUpdates()
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
    
    private var lastUpdateString: String {
        guard let date = viewModel.lastIngestTime else { return "Never" }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
