import SwiftUI

struct SearchBarView: View {
    @ObservedObject var viewModel: MapViewModel
    @FocusState private var isFocused: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                
                TextField("Search Platform ID...", text: $viewModel.searchQuery)
                    .focused($isFocused)
                    .onChange(of: viewModel.searchQuery) { _ in
                        viewModel.search()
                    }
                
                if !viewModel.searchQuery.isEmpty {
                    Button(action: {
                        viewModel.searchQuery = ""
                        viewModel.search()
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(10)
            .background(Color(UIColor.systemBackground))
            .cornerRadius(10)
            .shadow(radius: 3)
            .padding(.horizontal)
            
            if !viewModel.searchResults.isEmpty && isFocused {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(viewModel.searchResults, id: \.id) { transmitter in
                            Button {
                                viewModel.searchQuery = transmitter.platform_id
                                viewModel.search()
                                isFocused = false
                                
                                // Find annotation and fly to it
                                if let annotation = viewModel.annotations.first(where: { $0.transmitter.id == transmitter.id }) {
                                    viewModel.selectTransmitter(annotation)
                                }
                            } label: {
                                HStack {
                                    Text(transmitter.platform_id)
                                        .foregroundColor(.primary)
                                    Spacer()
                                    Text(transmitter.effectiveStatus)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                .padding()
                                .background(Color(UIColor.systemBackground))
                            }
                            Divider()
                        }
                    }
                    .background(Color(UIColor.systemBackground))
                    .cornerRadius(10)
                    .shadow(radius: 3)
                }
                .frame(maxHeight: 200)
                .padding(.horizontal)
                .padding(.top, 4)
            }
        }
    }
}
