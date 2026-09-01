import SwiftUI

enum SettingsTab: String, CaseIterable, Identifiable {
    case preferences = "Preferences"
    case security = "Security"
    
    var id: String { self.rawValue }
    
    var icon: String {
        switch self {
        case .preferences: return "display"
        case .security: return "shield"
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @AppStorage("isDarkMode") private var isDarkMode = false
    @State private var selectedTab: SettingsTab = .preferences
    
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isUpdatingPassword = false
    @State private var passwordMessage: String?
    @State private var isErrorMessage = false
    
    @State private var showLogoutAlert = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Main Top Bar
            HBTrackHeaderView(
                onRefresh: nil,
                onSettings: nil
            )
            
            ScrollView {
                VStack(spacing: 16) {
                    // Sub-tabs Segmented Pill + Logout Button
                    HStack(spacing: 12) {
                        // Pill Tabs
                        HStack(spacing: 4) {
                            ForEach(SettingsTab.allCases) { tab in
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        selectedTab = tab
                                    }
                                } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: tab.icon)
                                            .font(.system(size: 14))
                                        Text(tab.rawValue)
                                            .font(.system(size: 14, weight: .medium))
                                    }
                                    .foregroundColor(selectedTab == tab ? AppTheme.brandGold : AppTheme.textSecondary)
                                    .padding(.vertical, 10)
                                    .frame(maxWidth: .infinity)
                                    .background(
                                        selectedTab == tab ? Color(UIColor.secondarySystemGroupedBackground) : Color.clear
                                    )
                                    .cornerRadius(12)
                                    .shadow(color: selectedTab == tab ? Color.black.opacity(0.04) : Color.clear, radius: 4, x: 0, y: 2)
                                }
                            }
                        }
                        .padding(4)
                        .background(Color(UIColor.secondarySystemGroupedBackground).opacity(0.8))
                        .cornerRadius(16)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                        )
                        
                        // Floating Logout Button
                        Button {
                            showLogoutAlert = true
                        } label: {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.red)
                                .frame(width: 44, height: 44)
                                .background(Color(UIColor.secondarySystemGroupedBackground))
                                .cornerRadius(14)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                                )
                                .shadow(color: Color.black.opacity(0.04), radius: 4, x: 0, y: 2)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    
                    // Tab Content Card
                    VStack(alignment: .leading, spacing: 20) {
                        if selectedTab == .preferences {
                            preferencesContent
                        } else {
                            securityContent
                        }
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
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
        .alert("Sign Out", isPresented: $showLogoutAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) {
                authVM.logout()
            }
        } message: {
            Text("Are you sure you want to sign out of RAF Tracking?")
        }
    }
    
    // MARK: - Preferences View
    private var preferencesContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Header
            HStack(spacing: 10) {
                Image(systemName: "display")
                    .foregroundColor(AppTheme.brandGold)
                    .font(.system(size: 20))
                Text("System Preferences")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.primary)
            }
            
            Text("Customize your interface and experience")
                .font(.system(size: 13))
                .foregroundColor(AppTheme.textSecondary)
            
            VStack(spacing: 14) {
                // Dark Mode Card
                Button {
                    withAnimation { isDarkMode = true }
                } label: {
                    HStack(spacing: 16) {
                        Image(systemName: "moon.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                            .background(Color(hex: "0F172A"))
                            .cornerRadius(12)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Dark Mode")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.primary)
                            Text("Easy on the eyes, suitable for low-light environments.")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.textSecondary)
                                .multilineTextAlignment(.leading)
                        }
                        
                        Spacer()
                        
                        if isDarkMode {
                            Image(systemName: "checkmark.circle")
                                .foregroundColor(AppTheme.brandGold)
                                .font(.system(size: 20))
                        }
                    }
                    .padding(16)
                    .background(Color(UIColor.systemBackground))
                    .cornerRadius(16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(isDarkMode ? AppTheme.brandGold : Color(UIColor.separator).opacity(0.4), lineWidth: isDarkMode ? 1.5 : 1)
                    )
                }
                
                // Light Mode Card
                Button {
                    withAnimation { isDarkMode = false }
                } label: {
                    HStack(spacing: 16) {
                        Image(systemName: "display")
                            .font(.system(size: 18))
                            .foregroundColor(AppTheme.brandGold)
                            .frame(width: 44, height: 44)
                            .background(AppTheme.brandGoldLight)
                            .cornerRadius(12)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Light Mode")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.primary)
                            Text("Standard display, ideal for bright environments.")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.textSecondary)
                                .multilineTextAlignment(.leading)
                        }
                        
                        Spacer()
                        
                        if !isDarkMode {
                            Image(systemName: "checkmark.circle")
                                .foregroundColor(AppTheme.brandGold)
                                .font(.system(size: 20))
                        }
                    }
                    .padding(16)
                    .background(Color(UIColor.systemBackground))
                    .cornerRadius(16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(!isDarkMode ? AppTheme.brandGold : Color(UIColor.separator).opacity(0.4), lineWidth: !isDarkMode ? 1.5 : 1)
                    )
                }
            }
        }
    }
    
    // MARK: - Security View
    private var securityContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Header
            HStack(spacing: 10) {
                Image(systemName: "shield")
                    .foregroundColor(AppTheme.brandGold)
                    .font(.system(size: 20))
                Text("Security Settings")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.primary)
            }
            
            Text("Protect your account and data")
                .font(.system(size: 13))
                .foregroundColor(AppTheme.textSecondary)
            
            VStack(alignment: .leading, spacing: 14) {
                // Current Password
                VStack(alignment: .leading, spacing: 6) {
                    Text("Current Password")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.primary)
                    
                    HStack(spacing: 10) {
                        Image(systemName: "lock")
                            .foregroundColor(AppTheme.textMuted)
                        SecureField("••••••••", text: $currentPassword)
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
                
                // New Password
                VStack(alignment: .leading, spacing: 6) {
                    Text("New Password")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.primary)
                    
                    HStack(spacing: 10) {
                        Image(systemName: "lock")
                            .foregroundColor(AppTheme.textMuted)
                        SecureField("••••••••", text: $newPassword)
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
                
                // Confirm New Password
                VStack(alignment: .leading, spacing: 6) {
                    Text("Confirm New Password")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.primary)
                    
                    HStack(spacing: 10) {
                        Image(systemName: "lock")
                            .foregroundColor(AppTheme.textMuted)
                        SecureField("••••••••", text: $confirmPassword)
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
                
                if let msg = passwordMessage {
                    Text(msg)
                        .font(.caption)
                        .foregroundColor(isErrorMessage ? .red : .green)
                        .padding(.top, 2)
                }
                
                // Update Button
                Button {
                    updatePassword()
                } label: {
                    HStack(spacing: 8) {
                        if isUpdatingPassword {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        } else {
                            Image(systemName: "lock")
                            Text("Update Password")
                                .fontWeight(.semibold)
                        }
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(AppTheme.brandGold)
                    .cornerRadius(12)
                }
                .disabled(isUpdatingPassword || currentPassword.isEmpty || newPassword.isEmpty)
                .opacity((currentPassword.isEmpty || newPassword.isEmpty) ? 0.6 : 1.0)
                .padding(.top, 8)
            }
        }
    }
    
    private func updatePassword() {
        guard newPassword == confirmPassword else {
            passwordMessage = "New passwords do not match."
            isErrorMessage = true
            return
        }
        
        guard newPassword.count >= 6 else {
            passwordMessage = "Password must be at least 6 characters."
            isErrorMessage = true
            return
        }
        
        isUpdatingPassword = true
        passwordMessage = nil
        
        Task {
            do {
                try await AuthService.shared.changePassword(
                    currentPassword: currentPassword,
                    newPassword: newPassword
                )
                passwordMessage = "Password updated successfully!"
                isErrorMessage = false
                currentPassword = ""
                newPassword = ""
                confirmPassword = ""
            } catch {
                passwordMessage = error.localizedDescription
                isErrorMessage = true
            }
            isUpdatingPassword = false
        }
    }
}
