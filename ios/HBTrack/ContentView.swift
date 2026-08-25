import SwiftUI

struct ContentView: View {
    // Target production URL
    private let appURLString: String = "https://trackapp-v2.web.app"
    @State private var isLoading: Bool = true
    @State private var canGoBack: Bool = false
    @State private var hasError: Bool = false
    @State private var reloadTrigger: Bool = false

    var currentURL: URL {
        URL(string: appURLString) ?? URL(string: "https://trackapp-v2.web.app")!
    }

    var body: some View {
        ZStack {
            Color(UIColor.systemBackground)
                .ignoresSafeArea()

            if hasError {
                // Native Offline / Connection Failure View
                VStack(spacing: 20) {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 56))
                        .foregroundColor(.secondary)

                    Text("Connection Unavailable")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Please verify your cellular data or Wi-Fi connection and tap below to retry.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 36)

                    Button(action: {
                        hasError = false
                        reloadTrigger.toggle()
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.clockwise")
                            Text("Retry Connection")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 14)
                        .background(Color(red: 0.72, green: 0.58, blue: 0.33)) // Brand Aztec Gold
                        .cornerRadius(14)
                        .shadow(color: Color.black.opacity(0.15), radius: 6, x: 0, y: 3)
                    }
                    .padding(.top, 8)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
            } else {
                // Native Edge-to-Edge Container with pull-to-refresh
                WebView(
                    url: currentURL,
                    isLoading: $isLoading,
                    canGoBack: $canGoBack,
                    hasError: $hasError,
                    reloadTrigger: reloadTrigger
                )
                .ignoresSafeArea(.keyboard)
            }

            // Elegant Loading Overlay on startup
            if isLoading && !hasError {
                VStack(spacing: 12) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color(red: 0.72, green: 0.58, blue: 0.33)))
                        .scaleEffect(1.3)

                    Text("Loading RAF Tracking...")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(UIColor.systemBackground).opacity(0.92))
                        .shadow(color: Color.black.opacity(0.12), radius: 16, x: 0, y: 6)
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
    }
}
