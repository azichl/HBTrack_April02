import SwiftUI

struct HistoryOverlay: View {
    @ObservedObject var viewModel: MapViewModel
    
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("History Options")
                    .font(.headline)
                Spacer()
                Button {
                    viewModel.showHistory = false
                    viewModel.historyPositions.removeAll()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.gray)
                        .font(.title3)
                }
            }
            
            Picker("Timeframe", selection: $viewModel.historyDatePreset) {
                ForEach(DatePreset.allCases) { preset in
                    Text(preset.rawValue).tag(preset)
                }
            }
            .pickerStyle(.segmented)
            
            Picker("Location Type", selection: $viewModel.historyLocationType) {
                Text("All").tag("All")
                Text("GPS").tag("GPS")
                Text("Doppler").tag("Doppler")
            }
            .pickerStyle(.segmented)
            
            Button {
                Task {
                    await viewModel.loadHistory()
                }
            } label: {
                if viewModel.isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                } else {
                    Text("Load History")
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(8)
            
            if !viewModel.historyPositions.isEmpty {
                Text("Loaded \(viewModel.historyPositions.count) fixes")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(UIColor.systemBackground).opacity(0.95))
        .cornerRadius(12)
        .shadow(radius: 5)
        .padding()
    }
}
