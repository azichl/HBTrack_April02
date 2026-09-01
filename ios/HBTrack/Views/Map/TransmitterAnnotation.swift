import SwiftUI

struct TransmitterAnnotation: View {
    let annotation: TransmitterMapAnnotation
    let isSelected: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            Circle()
                .fill(annotation.statusColor)
                .frame(width: 14, height: 14)
                .overlay(
                    Circle().stroke(Color.white, lineWidth: 2)
                )
                .shadow(radius: 2)
            
            if isSelected {
                Text(annotation.transmitter.platform_id)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .padding(4)
                    .background(Color.white.opacity(0.8))
                    .cornerRadius(4)
                    .shadow(radius: 1)
                    .offset(y: 4)
            }
        }
    }
}
