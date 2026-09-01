import SwiftUI

struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String?
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 64))
                .foregroundColor(.gray)
            
            Text(title)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.primary)
            
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
    }
}
