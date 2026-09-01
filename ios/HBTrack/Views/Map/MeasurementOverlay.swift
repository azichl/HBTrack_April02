import SwiftUI

struct MeasurementOverlay: View {
    @ObservedObject var viewModel: MapViewModel
    
    var body: some View {
        VStack(spacing: 8) {
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
        .background(Color(UIColor.systemBackground).opacity(0.95))
        .cornerRadius(16)
        .shadow(radius: 5)
        .padding()
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
