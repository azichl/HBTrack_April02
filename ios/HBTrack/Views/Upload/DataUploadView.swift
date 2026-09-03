import SwiftUI

struct DataUploadView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = DataUploadViewModel()
    @State private var showPassword = false
    @State private var showSyncLog = false
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 16) {
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
                        
                        // Status Badge
                        HStack(spacing: 5) {
                            Circle()
                                .fill(statusColor)
                                .frame(width: 6, height: 6)
                            Text(statusText)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(statusTextColor)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(statusBgColor)
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
                                
                                if showPassword {
                                    TextField("••••••••", text: $viewModel.password)
                                        .autocapitalization(.none)
                                        .disableAutocorrection(true)
                                } else {
                                    SecureField("••••••••", text: $viewModel.password)
                                }
                                
                                Button {
                                    showPassword.toggle()
                                } label: {
                                    Image(systemName: showPassword ? "eye.slash" : "eye")
                                        .foregroundColor(AppTheme.textMuted)
                                }
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
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        viewModel.timeHorizon = "24h"
                                    }
                                } label: {
                                    Text("Last 24 Hours")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(viewModel.timeHorizon == "24h" ? AppTheme.brandGold : AppTheme.textSecondary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(
                                            viewModel.timeHorizon == "24h" ? Color(UIColor.systemBackground) : Color.clear
                                        )
                                        .cornerRadius(10)
                                        .shadow(color: viewModel.timeHorizon == "24h" ? Color.black.opacity(0.04) : Color.clear, radius: 3, x: 0, y: 1)
                                }
                                
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        viewModel.timeHorizon = "custom"
                                    }
                                } label: {
                                    Text("Custom Date")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(viewModel.timeHorizon == "custom" ? AppTheme.brandGold : AppTheme.textSecondary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(
                                            viewModel.timeHorizon == "custom" ? Color(UIColor.systemBackground) : Color.clear
                                        )
                                        .cornerRadius(10)
                                        .shadow(color: viewModel.timeHorizon == "custom" ? Color.black.opacity(0.04) : Color.clear, radius: 3, x: 0, y: 1)
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
                        
                        // Custom Date Range Pickers (if Custom Date is active)
                        if viewModel.timeHorizon == "custom" {
                            VStack(spacing: 8) {
                                DatePicker("From:", selection: $viewModel.customStartDate, displayedComponents: [.date, .hourAndMinute])
                                    .font(.system(size: 13))
                                DatePicker("To:", selection: $viewModel.customEndDate, displayedComponents: [.date, .hourAndMinute])
                                    .font(.system(size: 13))
                            }
                            .padding(12)
                            .background(Color(UIColor.systemBackground))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color(UIColor.separator).opacity(0.3), lineWidth: 1)
                            )
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                        
                        // Error Banner
                        if let error = viewModel.syncError {
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.red)
                                    .font(.system(size: 14))
                                Text(error)
                                    .font(.system(size: 12))
                                    .foregroundColor(.red)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.08))
                            .cornerRadius(8)
                        }
                        
                        // Success Toast
                        if viewModel.syncStatus == "success", let result = viewModel.syncResult {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(Color(hex: "15803d"))
                                    Text("CLS Data Upload Completed Successfully ✓")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(Color(hex: "15803d"))
                                }
                                Text("\(result.recordsImported) fixes imported across \(result.transmittersUpdated) transmitters. Synced to Firebase.")
                                    .font(.system(size: 11))
                                    .foregroundColor(Color(hex: "166534"))
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(hex: "dcfce7"))
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color(hex: "86efac"), lineWidth: 1)
                            )
                        }
                        
                        // Execute Request Button
                        Button {
                            Task {
                                await viewModel.sync()
                            }
                        } label: {
                            HStack(spacing: 8) {
                                if viewModel.isSyncing {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    Text("Connecting to CLS API...")
                                        .fontWeight(.semibold)
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
                        
                        // Live Execution Console (matching Web App logs)
                        if !viewModel.logs.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text("Execution Logs")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(.primary)
                                    
                                    Spacer()
                                    
                                    Button {
                                        if let res = viewModel.syncResult {
                                            showSyncLog = true
                                        }
                                    } label: {
                                        Text("Full Details")
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundColor(AppTheme.brandGold)
                                    }
                                }
                                
                                ScrollViewReader { scrollProxy in
                                    ScrollView {
                                        VStack(alignment: .leading, spacing: 4) {
                                            ForEach(Array(viewModel.logs.enumerated()), id: \.offset) { idx, log in
                                                Text(log)
                                                    .font(.system(size: 10.5, design: .monospaced))
                                                    .foregroundColor(log.contains("[ERROR]") ? .red : (log.contains("✓") ? Color(hex: "22c55e") : Color(UIColor.secondaryLabel)))
                                                    .id(idx)
                                            }
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(10)
                                    }
                                    .frame(maxHeight: 140)
                                    .background(Color(UIColor.systemBackground))
                                    .cornerRadius(10)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(Color(UIColor.separator).opacity(0.3), lineWidth: 1)
                                    )
                                    .onChange(of: viewModel.logs.count) { count in
                                        if count > 0 {
                                            withAnimation {
                                                scrollProxy.scrollTo(count - 1, anchor: .bottom)
                                            }
                                        }
                                    }
                                }
                            }
                            .padding(.top, 4)
                        }
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
    
    // Status Badge Helpers
    private var statusText: String {
        if viewModel.isSyncing { return "Ingesting..." }
        if viewModel.syncStatus == "success" { return "Complete" }
        if viewModel.syncStatus == "error" { return "Error" }
        return "Ready"
    }
    
    private var statusColor: Color {
        if viewModel.isSyncing { return AppTheme.brandGold }
        if viewModel.syncStatus == "success" { return Color(hex: "22c55e") }
        if viewModel.syncStatus == "error" { return .red }
        return Color(hex: "22c55e")
    }
    
    private var statusTextColor: Color {
        if viewModel.isSyncing { return AppTheme.brandGold }
        if viewModel.syncStatus == "success" { return Color(hex: "15803d") }
        if viewModel.syncStatus == "error" { return .red }
        return Color(hex: "15803d")
    }
    
    private var statusBgColor: Color {
        if viewModel.isSyncing { return AppTheme.brandGoldLight }
        if viewModel.syncStatus == "success" { return Color(hex: "dcfce7") }
        if viewModel.syncStatus == "error" { return Color.red.opacity(0.12) }
        return Color(hex: "dcfce7")
    }
}
