import SwiftUI

struct KPICardView: View {
    let title: String
    let value: String
    let subtitle: String?
    let icon: String
    let iconColor: Color
    let trend: String?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                ZStack {
                    Circle()
                        .fill(iconColor.opacity(0.15))
                        .frame(width: 36, height: 36)
                    
                    Image(systemName: icon)
                        .foregroundColor(iconColor)
                        .font(.system(size: 18, weight: .semibold))
                }
                Spacer()
                if let trend = trend {
                    Text(trend)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(trend.hasPrefix("+") ? .green : .secondary)
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                
                Text(value)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)
                
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
}

struct KPICardView_Previews: PreviewProvider {
    static var previews: some View {
        KPICardView(title: "Deployed PTTs", value: "124", subtitle: "Total registered", icon: "antenna.radiowaves.left.and.right", iconColor: .blue, trend: "+3")
            .padding()
            .previewLayout(.sizeThatFits)
    }
}
