import SwiftUI

struct ContentView: View {
    // Default target URL (includes ?mode=ios parameter for automatic Dashboard, Live Map & Data Upload filtering)
    @State private var appURLString: String = "https://houbara-tracker.web.app/?mode=ios"
    @State private var isLoading: Bool = true
    @State private var canGoBack: Bool = false
    @State private var hasError: Bool = false
    @State private var reloadTrigger: Bool = false
    @State private var showSettings: Bool = false

    var currentURL: URL {
        URL(string: appURLString) ?? URL(string: "https://houbara-tracker.web.app/?mode=ios")!
    }

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

                    // Quick URL / Environment switcher
                    Button(action: { showSettings.toggle() }) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.gray)
                    }

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

                        Text("Please check your internet connection or server settings and try again.")
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
                        url: currentURL,
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
        .sheet(isPresented: $showSettings) {
            SettingsSheet(appURLString: $appURLString, onSave: {
                showSettings = false
                reloadTrigger.toggle()
            })
        }
    }
}

struct SettingsSheet: View {
    @Binding var appURLString: String
    var onSave: () -> Void
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("App Web Server URL")) {
                    TextField("Enter web URL", text: $appURLString)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .keyboardType(.URL)

                    Button("Reset to Production") {
                        appURLString = "https://houbara-tracker.web.app/?mode=ios"
                    }

                    Button("Use Local Dev Server (localhost:5173)") {
                        appURLString = "http://localhost:5173/?mode=ios"
                    }
                }

                Section(footer: Text("Adding ?mode=ios filters navigation to Dashboard, Live Map & Data Ingestion.")) {
                    EmptyView()
                }
            }
            .navigationTitle("Server Config")
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Save") { onSave(); dismiss() }
            )
        }
    }
}
