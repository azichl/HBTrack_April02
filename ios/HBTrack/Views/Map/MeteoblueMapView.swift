import SwiftUI
import WebKit

enum MeteoblueModel: String, CaseIterable, Identifiable {
    case satellite = "Satellite Weather"
    case wind = "Wind Animation"
    case rain = "Rain Radar"
    case temp = "Temperature"
    case clouds = "Clouds"
    
    var id: String { self.rawValue }
    
    var mapParam: String {
        switch self {
        case .satellite: return "satellite~rainbow~auto~none~none"
        case .wind: return "windAnimation~rainbow~auto~10%20m%20above%20gnd~none"
        case .rain: return "precipitation~rainbow~auto~none~none"
        case .temp: return "temperature~rainbow~auto~2%20m%20above%20gnd~none"
        case .clouds: return "clouds~rainbow~auto~none~none"
        }
    }
    
    var icon: String {
        switch self {
        case .satellite: return "globe.americas.fill"
        case .wind: return "wind"
        case .rain: return "cloud.rain.fill"
        case .temp: return "thermometer.sun.fill"
        case .clouds: return "smoke.fill"
        }
    }
}

struct MeteoblueMapView: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var selectedModel: MeteoblueModel = .wind
    
    var body: some View {
        ZStack(alignment: .top) {
            MeteoblueWebView(
                mapParam: selectedModel.mapParam,
                centerLat: viewModel.selectedPosition?.coordinate.latitude ?? 25.276987,
                centerLon: viewModel.selectedPosition?.coordinate.longitude ?? 51.520008,
                zoom: 5
            )
            .edgesIgnoringSafeArea(.all)
            
            // Model Selector Floating Bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(MeteoblueModel.allCases) { model in
                        Button {
                            withAnimation(.spring(response: 0.3)) {
                                selectedModel = model
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: model.icon)
                                    .font(.system(size: 12))
                                Text(model.rawValue)
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .foregroundColor(selectedModel == model ? .white : .primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                selectedModel == model
                                    ? Color(hex: "0284c7")
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

struct MeteoblueWebView: UIViewRepresentable {
    let mapParam: String
    let centerLat: Double
    let centerLon: Double
    let zoom: Int
    
    private let apiKey = "eMGFsQTKiUP31Yq0"
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        loadMeteoblue(webView)
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        loadMeteoblue(webView)
    }
    
    private func loadMeteoblue(_ webView: WKWebView) {
        let urlString = "https://www.meteoblue.com/en/weather/maps/widget?apikey=\(apiKey)#coords=\(zoom)/\(centerLat)/\(centerLon)&map=\(mapParam)"
        
        if let url = URL(string: urlString) {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }
}
