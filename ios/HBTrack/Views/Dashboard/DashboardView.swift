import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel()
    
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
    }
    
    private var lastUpdateString: String {
        guard let date = viewModel.lastIngestTime else { return "Never" }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
