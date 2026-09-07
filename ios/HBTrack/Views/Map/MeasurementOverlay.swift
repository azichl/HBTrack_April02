import SwiftUI

struct MeasurementOverlay: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var dragOffset: CGSize = .zero
    @State private var accumulatedOffset: CGSize = .zero
    
    var body: some View {
        VStack(spacing: 6) {
            // Drag Handle for intuitive positioning
            Capsule()
                .fill(Color(UIColor.tertiaryLabel))
                .frame(width: 36, height: 4)
                .padding(.top, 2)
            
            Text("Distance Measurement")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(UIColor.secondaryLabel))
            
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Total Distance")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Color(UIColor.secondaryLabel))
                    
                    Text(formattedDistance)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Color(UIColor.label))
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("Points")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Color(UIColor.secondaryLabel))
                    
                    Text("\(viewModel.measurePoints.count)")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Color(UIColor.label))
                }
                
                Spacer()
                
                // Clear Button (soft pink/red rounded badge with red text)
                Button {
                    viewModel.clearMeasurement()
                } label: {
                    Text("Clear")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(red: 239/255, green: 68/255, blue: 68/255))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color(red: 254/255, green: 226/255, blue: 226/255))
                        .cornerRadius(10)
                }
                
                // Done Button (warm gold rounded badge with white text)
                Button {
                    viewModel.isMeasuring = false
                    viewModel.clearMeasurement()
                } label: {
                    Text("Done")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(AppTheme.brandGold)
                        .cornerRadius(10)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(UIColor.systemBackground).opacity(0.96))
        .cornerRadius(18)
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 0.8)
        )
        .shadow(color: Color.black.opacity(0.12), radius: 10, x: 0, y: 4)
        .frame(maxWidth: 440)
        .padding(.horizontal, 16)
        .offset(x: accumulatedOffset.width + dragOffset.width, y: accumulatedOffset.height + dragOffset.height)
        .gesture(
            DragGesture()
                .onChanged { value in
                    dragOffset = value.translation
                }
                .onEnded { value in
                    accumulatedOffset.width += value.translation.width
                    accumulatedOffset.height += value.translation.height
                    dragOffset = .zero
                }
        )
    }
    
    private var formattedDistance: String {
        let dist = viewModel.totalMeasureDistance
        if dist >= 1000 {
            return String(format: "%.2f km", dist / 1000)
        } else {
            return String(format: "%.0f m", dist)
        }
    }
}
