import SwiftUI

struct MeasurementOverlay: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var dragOffset: CGSize = .zero
    @State private var accumulatedOffset: CGSize = .zero
    
    var body: some View {
        VStack(spacing: 8) {
            // Drag Handle for intuitive drag and drop
            Capsule()
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 38, height: 5)
                .padding(.top, 2)
            
            Text("Distance Measurement")
                .font(.caption)
                .foregroundColor(.secondary)
            
            HStack(spacing: 20) {
                VStack(alignment: .leading) {
                    Text("Total Distance")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Text(formattedDistance)
                        .font(.title3)
                        .fontWeight(.bold)
                }
                
                VStack(alignment: .leading) {
                    Text("Points")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Text("\(viewModel.measurePoints.count)")
                        .font(.title3)
                        .fontWeight(.bold)
                }
                
                Spacer()
                
                Button("Clear") {
                    viewModel.clearMeasurement()
                }
                .buttonStyle(.bordered)
                .tint(.red)
                
                Button("Done") {
                    viewModel.isMeasuring = false
                    viewModel.clearMeasurement()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .background(Color(UIColor.systemBackground).opacity(0.96))
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.18), radius: 8, x: 0, y: 4)
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
        if dist > 1000 {
            return String(format: "%.2f km", dist / 1000)
        } else {
            return String(format: "%.0f m", dist)
        }
    }
}
