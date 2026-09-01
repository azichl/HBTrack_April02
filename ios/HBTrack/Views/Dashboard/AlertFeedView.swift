import SwiftUI

struct AlertFeedView: View {
    let alerts: [Alert]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Active Alerts")
                .font(.headline)
                .padding(.horizontal)
            
            if alerts.isEmpty {
                Text("No active alerts")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 32)
            } else {
                VStack(spacing: 0) {
                    ForEach(alerts) { alert in
                        AlertRow(alert: alert)
                        
                        if alert.id != alerts.last?.id {
                            Divider()
                                .padding(.leading, 40)
                        }
                    }
                }
            }
        }
        .padding(.vertical)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
}

struct AlertRow: View {
    let alert: Alert
    
    var relativeTimeString: String {
        if let date = alert.parsedDate {
            return DateFormatters.relativeTimeString(from: date)
        }
        return alert.timestamp
    }
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(alert.severityColor)
                .frame(width: 10, height: 10)
                .padding(.top, 6)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(alert.message)
                    .font(.subheadline)
                    .foregroundColor(.primary)
                    .lineLimit(2)
                
                HStack {
                    if let tId = alert.transmitter_id {
                        Text(tId)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                    
                    Text(relativeTimeString)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }
}
