import SwiftUI

struct DataUploadView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = DataUploadViewModel()
    @State private var timeHorizon: String = "24h"
    @State private var showSyncLog = false
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 16) {
                    // Top Status
                    // Sub-header Card
                    HStack(spacing: 12) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(AppTheme.brandGold)
                            .frame(width: 42, height: 42)
                            .background(AppTheme.brandGoldLight)
                            .cornerRadius(12)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("CLS Data Upload")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.primary)
                            Text("Field API Ingestion")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.textSecondary)
                        }
                        
                        Spacer()
                        
                        // Ready Badge
                        HStack(spacing: 5) {
                            Circle()
                                .fill(Color(hex: "22c55e"))
                                .frame(width: 6, height: 6)
                            Text("Ready")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Color(hex: "15803d"))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color(hex: "dcfce7"))
                        .clipShape(Capsule())
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity)
                    .background(Color(UIColor.secondarySystemGroupedBackground))
                    .cornerRadius(18)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.03), radius: 6, x: 0, y: 2)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    
                    // Main Form Card
                    VStack(alignment: .leading, spacing: 18) {
                        // Username Field
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Username")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.primary)
                            
                            HStack(spacing: 10) {
                                Image(systemName: "person")
                                    .foregroundColor(AppTheme.textMuted)
                                TextField("username", text: $viewModel.username)
                                    .autocapitalization(.none)
                                    .disableAutocorrection(true)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(Color(UIColor.systemBackground))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                            )
                        }
                        
                        // Password Field
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Password")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.primary)
                            
                            HStack(spacing: 10) {
                                Image(systemName: "lock")
                                    .foregroundColor(AppTheme.textMuted)
                                SecureField("••••••••", text: $viewModel.password)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(Color(UIColor.systemBackground))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                            )
                        }
                        
                        // Time Horizon Picker
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Time Horizon")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.primary)
                            
                            HStack(spacing: 4) {
                                Button {
                                    timeHorizon = "24h"
                                } label: {
                                    Text("Last 24 Hours")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(timeHorizon == "24h" ? AppTheme.brandGold : AppTheme.textSecondary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(
                                            timeHorizon == "24h" ? Color(UIColor.systemBackground) : Color.clear
                                        )
                                        .cornerRadius(10)
                                        .shadow(color: timeHorizon == "24h" ? Color.black.opacity(0.04) : Color.clear, radius: 3, x: 0, y: 1)
                                }
                                
                                Button {
                                    timeHorizon = "custom"
                                } label: {
                                    Text("Custom Date")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(timeHorizon == "custom" ? AppTheme.brandGold : AppTheme.textSecondary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(
                                            timeHorizon == "custom" ? Color(UIColor.systemBackground) : Color.clear
                                        )
                                        .cornerRadius(10)
                                        .shadow(color: timeHorizon == "custom" ? Color.black.opacity(0.04) : Color.clear, radius: 3, x: 0, y: 1)
                                }
                            }
                            .padding(4)
                            .background(Color(UIColor.systemBackground))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                            )
                        }
                        
                        if let error = viewModel.syncError {
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                        
                        // Execute Request Button
                        Button {
                            Task {
                                await viewModel.sync()
                                if viewModel.syncResult != nil {
                                    showSyncLog = true
                                }
                            }
                        } label: {
                            HStack(spacing: 8) {
                                if viewModel.isSyncing {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                    Image(systemName: "play.fill")
                                        .font(.system(size: 13))
                                    Text("Execute Request")
                                        .fontWeight(.semibold)
                                }
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(AppTheme.brandGold)
                            .cornerRadius(12)
                        }
                        .disabled(viewModel.isSyncing || viewModel.username.isEmpty || viewModel.password.isEmpty)
                        .opacity((viewModel.username.isEmpty || viewModel.password.isEmpty) ? 0.6 : 1.0)
                        .padding(.top, 4)
                    }
                    .padding(20)
                    .background(Color(UIColor.secondarySystemGroupedBackground))
                    .cornerRadius(20)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.03), radius: 8, x: 0, y: 3)
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
            .background(Color(UIColor.systemGroupedBackground))
        }
        .sheet(isPresented: $showSyncLog) {
            if let result = viewModel.syncResult {
                SyncLogView(result: result)
            }
        }
    }
}
