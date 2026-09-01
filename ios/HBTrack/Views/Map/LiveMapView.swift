import SwiftUI

struct LiveMapView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var viewModel = MapViewModel()
    
    var body: some View {
        ZStack {
            MapViewRepresentable(viewModel: viewModel)
                .edgesIgnoringSafeArea(.all)
            
            VStack {
                SearchBarView(viewModel: viewModel)
                    .padding(.top, 8)
                
                if viewModel.showHistory {
                    HistoryOverlay(viewModel: viewModel)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                
                Spacer()
                
                if viewModel.isMeasuring {
                    MeasurementOverlay(viewModel: viewModel)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    MapControlsView(viewModel: viewModel)
                        .padding(.bottom, viewModel.isMeasuring ? 120 : 40)
                }
            }
        }
        .task {
            if viewModel.transmitters.isEmpty {
                await viewModel.loadData(visibilityFilter: authVM.isTransmitterVisible)
                viewModel.subscribeToPositions(visibilityFilter: authVM.isTransmitterVisible)
            }
        }
        .sheet(isPresented: $viewModel.showDetail) {
            TransmitterDetailSheet(viewModel: viewModel, authRole: authVM.currentUserRole)
        }
        .navigationTitle("Live Map")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationView {
        LiveMapView()
    }
}
