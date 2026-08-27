import SwiftUI

struct ContentView: View {
    // Production target URL (direct clean URL, no cloaking parameters)
    private let appURL: URL = URL(string: "https://trackapp-v2.web.app")!
    @State private var isLoading: Bool = true
    @State private var canGoBack: Bool = false
    @State private var hasError: Bool = false
    @State private var reloadTrigger: Bool = false

    var body: some View {
        ZStack {
            Color(UIColor.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top Header Bar
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "circle.fill")
                            .font(.system(size: 8))
                            .foregroundColor(.green)
                        Text("HBTrack iOS")
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                    }

                    Spacer()

                    Button(action: { reloadTrigger.toggle() }) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.accentColor)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color(UIColor.secondarySystemBackground))

                // WKWebView Container
                if hasError {
                    // Offline / Failure View
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)

                        Text("Unable to Connect")
                            .font(.title2)
                            .bold()

                        Text("Please check your internet connection and try again.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)

                        Button(action: {
                            hasError = false
                            reloadTrigger.toggle()
                        }) {
                            HStack {
                                Image(systemName: "arrow.clockwise")
                                Text("Retry Connection")
                            }
                            .font(.headline)
                            .foregroundColor(.white)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(Color.blue)
                            .cornerRadius(12)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    WebView(
                        url: appURL,
                        isLoading: $isLoading,
                        canGoBack: $canGoBack,
                        hasError: $hasError,
                        reloadTrigger: reloadTrigger
                    )
                }
            }

            // Top progress bar overlay
            if isLoading && !hasError {
                VStack {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle())
                        .scaleEffect(1.2)
                        .padding(20)
                        .background(Color(UIColor.systemBackground).opacity(0.85))
                        .cornerRadius(16)
                        .shadow(radius: 10)
                }
            }
        }
    }
}
