import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel()
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(UIColor.systemGroupedBackground)
                    .ignoresSafeArea()
                
                if viewModel.isLoading && viewModel.transmitters.isEmpty {
                    ProgressView("Loading Dashboard...")
                } else {
                    ScrollView {
                        VStack(spacing: 16) {
                            // KPIs
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                                KPICardView(
                                    title: "Deployed PTTs",
                                    value: "\(viewModel.totalDeployed)",
                                    subtitle: "Total registered",
                                    icon: "antenna.radiowaves.left.and.right",
                                    iconColor: .blue,
                                    trend: nil
                                )
                                
                                KPICardView(
                                    title: "Birds Tracked",
                                    value: "\(viewModel.activeBirdsCount)",
                                    subtitle: "Active links",
                                    icon: "bird",
                                    iconColor: .green,
                                    trend: nil
                                )
                                
                                KPICardView(
                                    title: "Active Alerts",
                                    value: "\(viewModel.activeAlertsCount)",
                                    subtitle: "\(viewModel.criticalAlertsCount) critical",
                                    icon: "exclamationmark.triangle",
                                    iconColor: viewModel.criticalAlertsCount > 0 ? .red : .orange,
                                    trend: nil
                                )
                                
                                KPICardView(
                                    title: "Last Update",
                                    value: lastUpdateString,
                                    subtitle: "System sync",
                                    icon: "clock.arrow.2.circlepath",
                                    iconColor: .purple,
                                    trend: nil
                                )
                            }
                            .padding(.horizontal)
                            
                            // Charts
                            StatusPieChart(data: viewModel.statusBreakdown)
                                .padding(.horizontal)
                            
                            IngestionChart(data: viewModel.ingestionChartData)
                                .padding(.horizontal)
                            
                            // Alerts Feed
                            AlertFeedView(alerts: viewModel.recentAlerts)
                                .padding(.horizontal)
                            
                            Spacer().frame(height: 20)
                        }
                        .padding(.vertical)
                    }
                    .refreshable {
                        await viewModel.loadData()
                    }
                }
            }
            .navigationTitle("Dashboard")
            .task {
                await viewModel.loadData()
            }
            .onAppear {
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
