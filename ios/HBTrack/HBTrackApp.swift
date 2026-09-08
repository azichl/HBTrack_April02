import SwiftUI
import FirebaseCore

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        if FirebaseApp.app() == nil {
            if let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
               let options = FirebaseOptions(contentsOfFile: filePath) {
                FirebaseApp.configure(options: options)
            } else {
                FirebaseApp.configure()
            }
        }
        return true
    }
}

@main
struct HBTrackApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var authVM: AuthViewModel
    @State private var showSplashIntro: Bool = true
    
    init() {
        if FirebaseApp.app() == nil {
            if let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
               let options = FirebaseOptions(contentsOfFile: filePath) {
                FirebaseApp.configure(options: options)
            } else {
                FirebaseApp.configure()
            }
        }
        _authVM = StateObject(wrappedValue: AuthViewModel())
    }
    
    @AppStorage("isDarkMode") private var isDarkMode = false
    
    var body: some Scene {
        WindowGroup {
            ZStack {
                if authVM.isAuthenticated {
                    MainTabView()
                        .environmentObject(authVM)
                } else {
                    LoginView()
                        .environmentObject(authVM)
                }
                
                // Web App styled animated logo splash & loading screen
                if showSplashIntro || authVM.isLoading {
                    AppLoadingView()
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                        .zIndex(999)
                }
            }
            .animation(.easeInOut(duration: 0.5), value: showSplashIntro || authVM.isLoading)
            .preferredColorScheme(isDarkMode ? .dark : .light)
            .onAppear {
                // Keep splash visible on launch for 2.8s matching web intro
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.8) {
                    withAnimation(.easeInOut(duration: 0.6)) {
                        showSplashIntro = false
                    }
                }
            }
        }
    }
}

// MARK: - Animated Logo Loading View (matching Web App logoIntroZoom)
struct AppLoadingView: View {
    @State private var logoScale: CGFloat = 2.2
    @State private var logoOpacity: Double = 0.0
    @State private var logoBlur: CGFloat = 8.0
    
    @State private var pingScale: CGFloat = 1.0
    @State private var pingOpacity: Double = 0.85
    @State private var isBreathing: Bool = false
    
    var body: some View {
        let isPad = UIDevice.current.userInterfaceIdiom == .pad
        
        ZStack {
            // Dark sleek slate-950 canvas (#020617)
            Color(hex: "020617")
                .ignoresSafeArea()
            
            // Subtle ambient warm gold radial glow in center
            RadialGradient(
                gradient: Gradient(colors: [
                    Color(hex: "B58E58").opacity(0.12),
                    Color(hex: "020617").opacity(0.0)
                ]),
                center: .center,
                startRadius: 20,
                endRadius: isPad ? 360 : 230
            )
            .ignoresSafeArea()
            
            VStack(spacing: isPad ? 28 : 20) {
                // Ministry Logo with intro zoom & soft drop shadow
                if let uiImage = UIImage(named: "MinistryLogo") {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: isPad ? 480 : 310, maxHeight: isPad ? 140 : 90)
                        .shadow(color: Color.black.opacity(0.85), radius: 25, x: 0, y: 10)
                        .scaleEffect(logoScale * (isBreathing ? 1.025 : 1.0))
                        .opacity(logoOpacity)
                        .blur(radius: logoBlur)
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: "shield.checkered")
                            .font(.system(size: isPad ? 60 : 44))
                            .foregroundColor(.white)
                        Text("External Reserves Office of The State")
                            .font(.system(size: isPad ? 22 : 16, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .scaleEffect(logoScale)
                    .opacity(logoOpacity)
                    .blur(radius: logoBlur)
                }
                
                // Loading Indicator with Pulsing Dot & "LOADING APPLICATION..."
                HStack(spacing: 8) {
                    ZStack {
                        // Outer ping circle (animate-ping effect)
                        Circle()
                            .stroke(Color(hex: "F59E0B"), lineWidth: 2)
                            .frame(width: 8, height: 8)
                            .scaleEffect(pingScale)
                            .opacity(pingOpacity)
                        
                        // Solid inner core dot
                        Circle()
                            .fill(Color(hex: "F59E0B"))
                            .frame(width: 8, height: 8)
                    }
                    
                    Text("LOADING APPLICATION...")
                        .font(.system(size: isPad ? 13.5 : 11.5, weight: .bold, design: .rounded))
                        .foregroundColor(Color(hex: "F59E0B"))
                        .tracking(2.0)
                }
                .padding(.top, 4)
                .opacity(logoOpacity > 0.5 ? 1.0 : 0.0)
                .animation(.easeIn(duration: 0.4), value: logoOpacity)
            }
            .padding(.horizontal, 24)
        }
        .onAppear {
            // Step 1: Smooth intro zoom from scale 2.2 down to 1.0 with blur clearing (cubic-bezier 0.16, 1.0, 0.3, 1.0)
            withAnimation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.9)) {
                logoScale = 1.0
                logoOpacity = 1.0
                logoBlur = 0.0
            }
            
            // Step 2: Gentle continuous breathing effect
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
                withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                    isBreathing = true
                }
            }
            
            // Step 3: Pulsing ping effect on amber dot (matching web animate-ping)
            withAnimation(.easeOut(duration: 1.1).repeatForever(autoreverses: false)) {
                pingScale = 2.8
                pingOpacity = 0.0
            }
        }
    }
}
