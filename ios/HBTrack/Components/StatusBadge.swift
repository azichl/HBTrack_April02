import SwiftUI

struct StatusBadge: View {
    let status: String
    
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(StatusColor.color(for: status))
                .frame(width: 8, height: 8)
            
            Text(status.capitalized)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.primary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(StatusColor.color(for: status).opacity(0.15))
        .clipShape(Capsule())
    }
}
