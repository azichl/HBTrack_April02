import SwiftUI
import FirebaseFirestore

struct ActivityLogsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var logs: [UserActivityLogItem] = []
    @State private var isLoading = true
    @State private var selectedFilter: LogPlatformFilter = .all
    @State private var searchText = ""
    @State private var listenerRegistration: ListenerRegistration?
    
    enum LogPlatformFilter: String, CaseIterable {
        case all = "All"
        case ios = "iOS"
        case web = "Web"
    }
    
    var filteredLogs: [UserActivityLogItem] {
        logs.filter { item in
            let matchesFilter: Bool
            switch selectedFilter {
            case .all:
                matchesFilter = true
            case .ios:
                matchesFilter = item.effectivePlatform.lowercased() == "ios"
            case .web:
                matchesFilter = item.effectivePlatform.lowercased() != "ios"
            }
            
            if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return matchesFilter
            }
            
            let query = searchText.lowercased()
            let matchesEmail = item.userEmail.lowercased().contains(query)
            let matchesDetails = item.details.lowercased().contains(query)
            let matchesType = item.eventType.lowercased().contains(query)
            
            return matchesFilter && (matchesEmail || matchesDetails || matchesType)
        }
    }
    
    var iosCount: Int {
        logs.filter { $0.effectivePlatform.lowercased() == "ios" }.count
    }
    
    var webCount: Int {
        logs.filter { $0.effectivePlatform.lowercased() != "ios" }.count
    }
    
    var body: some View {
        let isPad = UIDevice.current.userInterfaceIdiom == .pad
        
        NavigationView {
            VStack(spacing: 0) {
                // Top Filter & Search Header
                VStack(spacing: 12) {
                    // Segmented Platform Filter
                    Picker("Platform", selection: $selectedFilter) {
                        Text("All (\(logs.count))").tag(LogPlatformFilter.all)
                        Text("iOS (\(iosCount))").tag(LogPlatformFilter.ios)
                        Text("Web (\(webCount))").tag(LogPlatformFilter.web)
                    }
                    .pickerStyle(SegmentedPickerStyle())
                    
                    // Search Bar
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(AppTheme.textMuted)
                            .font(.system(size: 14))
                        TextField("Search by email, action, or type...", text: $searchText)
                            .font(.system(size: 14))
                        if !searchText.isEmpty {
                            Button {
                                searchText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(AppTheme.textMuted)
                                    .font(.system(size: 14))
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(UIColor.systemBackground))
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                    )
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(AppTheme.cardBackground)
                
                Divider()
                
                // Logs Content
                if isLoading && logs.isEmpty {
                    VStack(spacing: 12) {
                        Spacer()
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.brandGold))
                            .scaleEffect(1.2)
                        Text("Loading user activity logs from Firebase...")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.textSecondary)
                        Spacer()
                    }
                } else if filteredLogs.isEmpty {
                    VStack(spacing: 12) {
                        Spacer()
                        Image(systemName: "tray")
                            .font(.system(size: 40))
                            .foregroundColor(AppTheme.textMuted)
                        Text("No Activity Logs Found")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.primary)
                        Text(searchText.isEmpty ? "No activity logs recorded yet." : "No logs match your search.")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.textSecondary)
                        Spacer()
                    }
                } else {
                    List {
                        ForEach(filteredLogs) { log in
                            logRow(log, isPad: isPad)
                                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                        }
                    }
                    .listStyle(PlainListStyle())
                    .refreshable {
                        await refreshLogs()
                    }
                }
            }
            .background(AppTheme.screenBackground)
            .navigationTitle("Activity Logs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(AppTheme.brandGold)
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 8, height: 8)
                        Text("Live Sync")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.textSecondary)
                    }
                }
            }
            .onAppear {
                startListening()
            }
            .onDisappear {
                listenerRegistration?.remove()
                listenerRegistration = nil
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
    
    // MARK: - Row View
    private func logRow(_ log: UserActivityLogItem, isPad: Bool) -> some View {
        let isIOS = log.effectivePlatform.lowercased() == "ios"
        
        return VStack(alignment: .leading, spacing: 8) {
            // Header Row: Platform Badge + Event Type Badge + Timestamp
            HStack(spacing: 8) {
                // Platform Tag
                HStack(spacing: 4) {
                    Image(systemName: isIOS ? "apple.logo" : "globe")
                        .font(.system(size: 11))
                    Text(isIOS ? "iOS App" : "Web Portal")
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundColor(isIOS ? .blue : .purple)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background((isIOS ? Color.blue : Color.purple).opacity(0.12))
                .cornerRadius(6)
                
                // Event Type Badge
                Text(eventBadgeText(log.eventType))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(eventBadgeTextColor(log.eventType))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(eventBadgeBgColor(log.eventType))
                    .cornerRadius(6)
                
                Spacer()
                
                // Formatted Time
                Text(formattedTimestamp(log.timestamp))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(AppTheme.textMuted)
            }
            
            // User Email
            HStack(spacing: 6) {
                Image(systemName: "person.circle")
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.brandGold)
                Text(log.userEmail.isEmpty ? "Unknown User" : log.userEmail)
                    .font(.system(size: isPad ? 15 : 13.5, weight: .semibold))
                    .foregroundColor(.primary)
            }
            
            // Details Text
            if !log.details.isEmpty {
                Text(log.details)
                    .font(.system(size: isPad ? 14 : 12.5))
                    .foregroundColor(AppTheme.textSecondary)
                    .lineSpacing(2)
            }
            
            // User Agent / Device
            if !log.userAgent.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: isIOS ? "iphone" : "desktopcomputer")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.textMuted)
                    Text(log.userAgent)
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.textMuted)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.cardBackground)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(UIColor.separator).opacity(0.3), lineWidth: 1)
        )
    }
    
    // MARK: - Helpers
    private func startListening() {
        isLoading = true
        listenerRegistration?.remove()
        listenerRegistration = UserActivityLogger.addLogsListener(limit: 100) { newLogs in
            self.logs = newLogs
            self.isLoading = false
        }
    }
    
    private func refreshLogs() async {
        do {
            let fetched = try await UserActivityLogger.fetchRecentLogs(limit: 100)
            self.logs = fetched
        } catch {
            print("Failed to refresh logs: \(error.localizedDescription)")
        }
    }
    
    private func eventBadgeText(_ eventType: String) -> String {
        switch eventType.uppercased() {
        case "SESSION_START": return "Login"
        case "SESSION_END": return "Logout"
        case "PAGE_VIEW": return "Page View"
        case "CUSTOM_ACTION": return "Action"
        case "DATA_UPDATE": return "Data Update"
        case "DATA_CREATE": return "Created"
        case "DATA_DELETE": return "Deleted"
        case "AUTO_LOGOUT_IDLE": return "Auto Logout"
        default: return eventType
        }
    }
    
    private func eventBadgeTextColor(_ eventType: String) -> Color {
        switch eventType.uppercased() {
        case "SESSION_START": return .green
        case "SESSION_END": return Color(hex: "64748B")
        case "PAGE_VIEW": return .blue
        case "CUSTOM_ACTION": return AppTheme.brandGold
        case "DATA_UPDATE": return .orange
        case "DATA_CREATE": return .teal
        case "DATA_DELETE": return .red
        default: return AppTheme.textSecondary
        }
    }
    
    private func eventBadgeBgColor(_ eventType: String) -> Color {
        eventBadgeTextColor(eventType).opacity(0.12)
    }
    
    private func formattedTimestamp(_ date: Date?) -> String {
        guard let date = date else { return "Just now" }
        let calendar = Calendar.current
        let formatter = DateFormatter()
        
        if calendar.isDateInToday(date) {
            formatter.dateFormat = "h:mm a"
            return "Today " + formatter.string(from: date)
        } else if calendar.isDateInYesterday(date) {
            formatter.dateFormat = "h:mm a"
            return "Yesterday " + formatter.string(from: date)
        } else {
            formatter.dateFormat = "MMM d, h:mm a"
            return formatter.string(from: date)
        }
    }
}
