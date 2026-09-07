import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel()
    
    var body: some View {
        GeometryReader { screenGeo in
            ZStack {
                AppTheme.screenBackground
                    .ignoresSafeArea()
                
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        Spacer(minLength: 12)
                        
                        // Transmitters Status Breakdown Command Card
                        ZStack(alignment: .topTrailing) {
                            // Background watermark antenna waves
                            Image(systemName: "antenna.radiowaves.left.and.right")
                                .font(.system(size: 140))
                                .foregroundColor(AppTheme.brandGold.opacity(0.05))
                                .offset(x: 25, y: -20)
                                .allowsHitTesting(false)
                            
                            VStack(spacing: 16) {
                                // Card Header
                                HStack(alignment: .center, spacing: 10) {
                                    // Antenna Icon Badge
                                    Image(systemName: "antenna.radiowaves.left.and.right")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundColor(AppTheme.brandGold)
                                        .frame(width: 44, height: 44)
                                        .background(AppTheme.brandGoldLight)
                                        .cornerRadius(12)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(AppTheme.brandGoldBorder, lineWidth: 1)
                                        )
                                    
                                    // Titles
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("Transmitters Status")
                                            .font(.system(size: 17, weight: .bold))
                                            .foregroundColor(AppTheme.textPrimary)
                                        Text("Real-time health & operational status of deployed PTTs")
                                            .font(.system(size: 12, weight: .regular))
                                            .foregroundColor(AppTheme.textSecondary)
                                    }
                                    
                                    Spacer(minLength: 4)
                                    
                                    // Total Pill Badge
                                    HStack(spacing: 5) {
                                        Text("Total:")
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundColor(AppTheme.textSecondary)
                                        Text("\(viewModel.totalDeployed)")
                                            .font(.system(size: 15, weight: .bold))
                                            .foregroundColor(AppTheme.textPrimary)
                                    }
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 7)
                                    .background(AppTheme.subtleBackground)
                                    .cornerRadius(20)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 20)
                                            .stroke(AppTheme.cardBorder, lineWidth: 1)
                                    )
                                }
                                
                                // Donut Chart with Leader Line Callouts and Center Units
                                StatusPieChart(data: viewModel.statusBreakdown)
                                    .padding(.vertical, 2)
                                
                                // Divider Line
                                Rectangle()
                                    .fill(AppTheme.cardBorder)
                                    .frame(height: 1)
                                
                                // Status Breakdown Pills (2 Columns)
                                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                                    ForEach(viewModel.statusBreakdown, id: \.status) { item in
                                        HStack {
                                            HStack(spacing: 6) {
                                                Circle()
                                                    .fill(item.color)
                                                    .frame(width: 9, height: 9)
                                                Text("\(item.status):")
                                                    .font(.system(size: 12, weight: .semibold))
                                                    .foregroundColor(AppTheme.textPrimary)
                                                    .lineLimit(1)
                                                    .minimumScaleFactor(0.7)
                                            }
                                            
                                            Spacer(minLength: 2)
                                            
                                            Text("\(item.count)")
                                                .font(.system(size: 13, weight: .black))
                                                .foregroundColor(AppTheme.textPrimary)
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 3)
                                                .background(AppTheme.subtleBackground)
                                                .cornerRadius(6)
                                        }
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 10)
                                        .background(AppTheme.cardBackground)
                                        .cornerRadius(12)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(AppTheme.cardBorder, lineWidth: 1)
                                        )
                                        .shadow(color: Color.black.opacity(0.02), radius: 3, x: 0, y: 1)
                                    }
                                }
                                
                                // Divider Line
                                Rectangle()
                                    .fill(AppTheme.cardBorder)
                                    .frame(height: 1)
                                
                                // Footer: Last Data Update
                                HStack {
                                    HStack(spacing: 6) {
                                        Image(systemName: "waveform.path.ecg")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(AppTheme.brandGold)
                                        Text("Last Data Update:")
                                            .font(.system(size: 13, weight: .regular))
                                            .foregroundColor(AppTheme.textSecondary)
                                    }
                                    
                                    Spacer()
                                    
                                    Text(viewModel.formattedLastUpdate)
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(AppTheme.textPrimary)
                                }
                                .padding(.top, 2)
                            }
                            .padding(20)
                        }
                        .background(
                            LinearGradient(
                                colors: [AppTheme.cardGradientTop, AppTheme.cardGradientBottom],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .cornerRadius(24)
                        .overlay(
                            RoundedRectangle(cornerRadius: 24)
                                .stroke(AppTheme.cardBorder, lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.04), radius: 14, x: 0, y: 4)
                        .padding(.horizontal, 16)
                        .frame(maxWidth: 640)
                        
                        Spacer(minLength: 16)
                    }
                    .frame(minHeight: screenGeo.size.height)
                    .frame(maxWidth: .infinity)
                }
                .refreshable {
                    await viewModel.loadData(forceRefresh: true)
                }
            }
        }
        .task {
            await viewModel.loadData()
            viewModel.subscribeToUpdates()
        }
        .onAppear {
            viewModel.subscribeToUpdates()
        }
    }
}
