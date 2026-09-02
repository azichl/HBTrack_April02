import SwiftUI
import WebKit

enum WindyOverlay: String, CaseIterable, Identifiable {
    case wind = "Wind"
    case rain = "Rain/Thunder"
    case temp = "Temperature"
    case clouds = "Clouds"
    case waves = "Waves"
    case pressure = "Pressure"
    
    var id: String { self.rawValue }
    
    var apiParam: String {
        switch self {
        case .wind: return "wind"
        case .rain: return "rain"
        case .temp: return "temp"
        case .clouds: return "clouds"
        case .waves: return "waves"
        case .pressure: return "pressure"
        }
    }
    
    var icon: String {
        switch self {
        case .wind: return "wind"
        case .rain: return "cloud.bolt.rain.fill"
        case .temp: return "thermometer.sun.fill"
        case .clouds: return "cloud.fill"
        case .waves: return "water.waves"
        case .pressure: return "gauge"
        }
    }
}

struct WindyMapView: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var selectedOverlay: WindyOverlay = .wind
    
    var body: some View {
        ZStack(alignment: .top) {
            WindyWebView(
                overlay: selectedOverlay.apiParam,
                centerLat: viewModel.selectedPosition?.coordinate.latitude ?? 25.276987,
                centerLon: viewModel.selectedPosition?.coordinate.longitude ?? 51.520008,
                zoom: 5
            )
            .edgesIgnoringSafeArea(.all)
            
            // Quick Layer Selector Floating Bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(WindyOverlay.allCases) { overlay in
                        Button {
                            withAnimation(.spring(response: 0.3)) {
                                selectedOverlay = overlay
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: overlay.icon)
                                    .font(.system(size: 12))
                                Text(overlay.rawValue)
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .foregroundColor(selectedOverlay == overlay ? .white : .primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                selectedOverlay == overlay
                                    ? AppTheme.brandGold
                                    : Color(UIColor.systemBackground).opacity(0.9)
                            )
                            .cornerRadius(20)
                            .shadow(color: Color.black.opacity(0.12), radius: 3, x: 0, y: 2)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
            }
        }
    }
}

struct WindyWebView: UIViewRepresentable {
    let overlay: String
    let centerLat: Double
    let centerLon: Double
    let zoom: Int
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        loadWindy(webView)
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        loadWindy(webView)
    }
    
    private func loadWindy(_ webView: WKWebView) {
        let urlString = "https://embed.windy.com/embed2.html?lat=\(centerLat)&lon=\(centerLon)&detailLat=\(centerLat)&detailLon=\(centerLon)&zoom=\(zoom)&level=surface&overlay=\(overlay)&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1"
        
        if let url = URL(string: urlString) {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }
}
