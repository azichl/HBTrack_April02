import SwiftUI

struct MapControlsView: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var showLayerPicker = false
    
    var body: some View {
        VStack(spacing: 12) {
            // Layer Picker
            Button {
                showLayerPicker.toggle()
            } label: {
                ControlButton(icon: "square.3.layers.3d")
            }
            .confirmationDialog("Map Style", isPresented: $showLayerPicker, titleVisibility: .visible) {
                ForEach(MapStyleOption.allCases) { style in
                    Button(style.rawValue) {
                        viewModel.mapStyle = style
                    }
                }
            }
            
            // History Toggle
            Button {
                withAnimation {
                    viewModel.showHistory.toggle()
                }
            } label: {
                ControlButton(
                    icon: "clock",
                    isActive: viewModel.showHistory
                )
            }
            
            // Measurement Toggle
            Button {
                withAnimation {
                    viewModel.isMeasuring.toggle()
                    if !viewModel.isMeasuring {
                        viewModel.clearMeasurement()
                    }
                }
            } label: {
                ControlButton(
                    icon: "ruler",
                    isActive: viewModel.isMeasuring
                )
            }
            
            // Center Location
            Button {
                // In a real app, integrate LocationManager to get current user location.
                // For now, center on default map region.
                viewModel.flyTo(CLLocationCoordinate2D(latitude: 36.0, longitude: 42.0))
            } label: {
                ControlButton(icon: "location.fill")
            }
        }
        .padding(.trailing, 16)
    }
}

struct ControlButton: View {
    let icon: String
    var isActive: Bool = false
    
    var body: some View {
        Image(systemName: icon)
            .font(.system(size: 20))
            .foregroundColor(isActive ? .white : .blue)
            .frame(width: 44, height: 44)
            .background(isActive ? Color.blue : Color(UIColor.systemBackground))
            .clipShape(Circle())
            .shadow(radius: 3)
    }
}
