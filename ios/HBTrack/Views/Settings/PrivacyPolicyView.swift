import SwiftUI

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header card
                    HStack(spacing: 14) {
                        Image(systemName: "shield.lefthalf.filled")
                            .font(.system(size: 28))
                            .foregroundColor(AppTheme.brandGold)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("RAF Tracking")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.primary)
                            Text("Privacy Policy • Updated August 2026")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.textSecondary)
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.cardBackground)
                    .cornerRadius(16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color(UIColor.separator).opacity(0.3), lineWidth: 1)
                    )
                    
                    policySection(
                        title: "1. Introduction",
                        content: "This Privacy Policy describes how the RAF Tracking application (\"the App\") handles account access, device capabilities, and data security. The App is an internal organizational tool designed specifically for ecological researchers and authorized field teams to monitor Houbara Bustard movement and perform live field navigation."
                    )
                    
                    policySection(
                        title: "2. Account Access & Provisioning",
                        bullets: [
                            "Internal Team Access: The App is designed strictly for authorized organization members and conservation research staff.",
                            "No Public Self-Registration: Users cannot create accounts or submit personal registration information through the App.",
                            "Administrator Provisioning: All user accounts, login credentials, and permission tiers are created and managed directly by organization Administrators."
                        ]
                    )
                    
                    policySection(
                        title: "3. Information We Access & Permissions",
                        bullets: [
                            "Location (GPS): We access your device location while the App is in use strictly to display your real-time position relative to Houbara tracking locations on the interactive map for field navigation.",
                            "No Tracking / No Advertising: The App does not track users across other apps or websites. No third-party ad frameworks or analytics tracking SDKs are embedded.",
                            "No Personal Data Harvesting: The App does not collect contacts, financial data, media library, or personal device content."
                        ]
                    )
                    
                    policySection(
                        title: "4. How We Use Information",
                        bullets: [
                            "To accurately display field researcher positions on the live map relative to tracked Houbara transmitters.",
                            "To provide distance calculation and navigation bearings for wildlife research in the field."
                        ]
                    )
                    
                    policySection(
                        title: "5. Data Security & Storage",
                        content: "We implement industry-standard encryption and Google Cloud / Firebase security measures to protect account credentials, telemetry data, and access permissions. All telemetry data remains strictly internal to the conservation organization."
                    )
                    
                    policySection(
                        title: "6. Account Management & Deletion",
                        content: "Because user accounts are provisioned directly by organization Administrators, account updates or deletion requests may be submitted directly to organization management via the in-app option or by contacting admin@houbaratracker.com."
                    )
                    
                    policySection(
                        title: "7. Contact & Administration",
                        content: "If you have questions regarding this Privacy Policy or account access permissions, please contact: admin@houbaratracker.com."
                    )
                    
                    // Web link button
                    Button {
                        if let url = URL(string: "https://houbaratracker.com/privacy") {
                            openURL(url)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "safari")
                            Text("Open Web Version (houbaratracker.com/privacy)")
                                .font(.system(size: 13, weight: .medium))
                        }
                        .foregroundColor(AppTheme.brandGold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(AppTheme.subtleBackground)
                        .cornerRadius(12)
                    }
                    .padding(.top, 10)
                }
                .padding(20)
            }
            .background(AppTheme.screenBackground)
            .navigationTitle("Privacy Policy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppTheme.brandGold)
                }
            }
        }
    }
    
    private func policySection(title: String, content: String? = nil, bullets: [String]? = nil) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.primary)
            
            if let content = content {
                Text(content)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.textSecondary)
                    .lineSpacing(3)
            }
            
            if let bullets = bullets {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(bullets, id: \.self) { bullet in
                        HStack(alignment: .top, spacing: 8) {
                            Circle()
                                .fill(AppTheme.brandGold)
                                .frame(width: 5, height: 5)
                                .padding(.top, 6)
                            Text(bullet)
                                .font(.system(size: 13))
                                .foregroundColor(AppTheme.textSecondary)
                                .lineSpacing(3)
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.cardBackground)
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(UIColor.separator).opacity(0.3), lineWidth: 1)
        )
    }
}
