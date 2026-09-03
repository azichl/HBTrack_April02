import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel()
    
    var body: some View {
        ZStack {
            Color(hex: "F8FAFC")
                .ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 0) {
                    // Transmitters Status Breakdown Card
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
                                    .background(Color(hex: "FDF8F0"))
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color(hex: "F5E6D0"), lineWidth: 1)
                                    )
                                
                                // Titles
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("Transmitters Status")
                                        .font(.system(size: 17, weight: .bold))
                                        .foregroundColor(Color(hex: "0F172A"))
                                    Text("Real-time health & operational status of deployed PTTs")
                                        .font(.system(size: 12, weight: .regular))
                                        .foregroundColor(Color(hex: "64748B"))
                                }
                                
                                Spacer(minLength: 4)
                                
                                // Total Pill Badge
                                HStack(spacing: 5) {
                                    Text("Total:")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(Color(hex: "64748B"))
                                    Text("\(viewModel.totalDeployed)")
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundColor(Color(hex: "0F172A"))
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .background(Color(hex: "F1F5F9"))
                                .cornerRadius(20)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 20)
                                        .stroke(Color(hex: "E2E8F0"), lineWidth: 1)
                                )
                            }
                            
                            // Donut Chart with Leader Line Callouts and Center Units
                            StatusPieChart(data: viewModel.statusBreakdown)
                                .padding(.vertical, 2)
                            
                            // Divider Line
                            Rectangle()
                                .fill(Color(hex: "E2E8F0").opacity(0.8))
                                .frame(height: 1)
                            
                            // Status Breakdown Pills (2 Columns)
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                                ForEach(viewModel.statusBreakdown, id: \.status) { item in
                                    HStack {
                                        HStack(spacing: 7) {
                                            Circle()
                                                .fill(item.color)
                                                .frame(width: 10, height: 10)
                                            Text("\(item.status):")
                                                .font(.system(size: 13, weight: .semibold))
                                                .foregroundColor(Color(hex: "334155"))
                                                .lineLimit(1)
                                        }
                                        
                                        Spacer(minLength: 4)
                                        
                                        Text("\(item.count)")
                                            .font(.system(size: 13, weight: .black))
                                            .foregroundColor(Color(hex: "0F172A"))
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 3)
                                            .background(Color(hex: "F1F5F9"))
                                            .cornerRadius(6)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(Color.white)
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color(hex: "E2E8F0"), lineWidth: 1)
                                    )
                                    .shadow(color: Color.black.opacity(0.02), radius: 3, x: 0, y: 1)
                                }
                            }
                            
                            // Divider Line
                            Rectangle()
                                .fill(Color(hex: "E2E8F0").opacity(0.8))
                                .frame(height: 1)
                            
                            // Footer: Last Data Update
                            HStack {
                                HStack(spacing: 6) {
                                    Image(systemName: "waveform.path.ecg")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(AppTheme.brandGold)
                                    Text("Last Data Update:")
                                        .font(.system(size: 13, weight: .regular))
                                        .foregroundColor(Color(hex: "64748B"))
                                }
                                
                                Spacer()
                                
                                Text(viewModel.formattedLastUpdate)
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(Color(hex: "0F172A"))
                            }
                            .padding(.top, 2)
                        }
                        .padding(20)
                    }
                    .background(
                        LinearGradient(
                            colors: [Color.white, Color(hex: "F8FAFC")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .cornerRadius(24)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(Color(hex: "E2E8F0"), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.04), radius: 14, x: 0, y: 4)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 24)
                }
            }
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
}
