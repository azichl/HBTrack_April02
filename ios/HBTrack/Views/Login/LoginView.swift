import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    
    @State private var identifier = ""
    @State private var password = ""
    
    var body: some View {
        ZStack {
            // Deep Night Blue Gradient Background
            LinearGradient(
                colors: [
                    Color(hex: "0a101f"),
                    Color(hex: "0d1626"),
                    Color(hex: "080d1a")
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            // Atmospheric Glow Elements
            GeometryReader { geo in
                ZStack {
                    Circle()
                        .fill(Color(hex: "b45309").opacity(0.18))
                        .frame(width: geo.size.width * 0.7, height: geo.size.width * 0.7)
                        .blur(radius: 80)
                        .offset(x: -geo.size.width * 0.3, y: -geo.size.height * 0.15)
                    
                    Circle()
                        .fill(Color(hex: "2563eb").opacity(0.22))
                        .frame(width: geo.size.width * 0.8, height: geo.size.width * 0.8)
                        .blur(radius: 90)
                        .offset(x: geo.size.width * 0.3, y: geo.size.height * 0.25)
                }
            }
            .ignoresSafeArea()
            
            // Subtle Stardust Star Field
            StarFieldView()
                .ignoresSafeArea()
                .opacity(0.35)
            
            // Main Glassmorphic Login Card
            GeometryReader { screenGeo in
                let isPad = UIDevice.current.userInterfaceIdiom == .pad
                
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        Spacer(minLength: isPad ? 36 : 24)
                        
                        VStack(spacing: isPad ? 28 : 20) {
                            // Ministry & External Reserves Header Logo (+50% size on iPad)
                            VStack(spacing: isPad ? 16 : 12) {
                                if let uiImage = UIImage(named: "MinistryLogo") {
                                    Image(uiImage: uiImage)
                                        .resizable()
                                        .scaledToFit()
                                        .frame(maxWidth: isPad ? 465 : 310, maxHeight: isPad ? 128 : 85)
                                        .shadow(color: Color.black.opacity(0.3), radius: 4, x: 0, y: 2)
                                } else {
                                    // High quality fallback
                                    VStack(spacing: 4) {
                                        Image(systemName: "shield.checkered")
                                            .font(.system(size: isPad ? 52 : 38))
                                            .foregroundColor(.white)
                                        Text("External Reserves Office of The State")
                                            .font(.system(size: isPad ? 20 : 15, weight: .bold))
                                            .foregroundColor(.white)
                                    }
                                }
                                
                                Text("Ecological Monitoring & Geolocation Database")
                                    .font(.system(size: isPad ? 17 : 13, weight: .medium))
                                    .foregroundColor(Color(hex: "94a3b8"))
                                    .multilineTextAlignment(.center)
                                    .padding(.top, 4)
                            }
                            .padding(.top, 6)
                            .padding(.bottom, 8)
                            
                            // Error Banner (if any)
                            if let error = authVM.authError, !error.isEmpty {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: "exclamationmark.shield.fill")
                                        .font(.system(size: isPad ? 22 : 16))
                                        .foregroundColor(Color(hex: "f87171"))
                                        .padding(.top, 2)
                                    
                                    Text(error)
                                        .font(.system(size: isPad ? 15 : 12, weight: .medium))
                                        .foregroundColor(Color(hex: "fca5a5"))
                                        .multilineTextAlignment(.leading)
                                    
                                    Spacer(minLength: 0)
                                }
                                .padding(isPad ? 16 : 12)
                                .background(Color(hex: "ef4444").opacity(0.12))
                                .cornerRadius(isPad ? 16 : 12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: isPad ? 16 : 12)
                                        .stroke(Color(hex: "ef4444").opacity(0.25), lineWidth: 1)
                                )
                                .transition(.opacity.combined(with: .scale(scale: 0.95)))
                            }
                            
                            // Form Fields
                            VStack(alignment: .leading, spacing: isPad ? 22 : 16) {
                                // Username Input
                                VStack(alignment: .leading, spacing: isPad ? 9 : 7) {
                                    Text("Username")
                                        .font(.system(size: isPad ? 17 : 13, weight: .medium))
                                        .foregroundColor(Color(hex: "cbd5e1"))
                                    
                                    HStack(spacing: 12) {
                                        Image(systemName: "person")
                                            .font(.system(size: isPad ? 22 : 16))
                                            .foregroundColor(Color(hex: "64748b"))
                                        
                                        TextField("", text: $identifier, prompt: Text("Username").foregroundColor(Color(hex: "475569")))
                                            .font(.system(size: isPad ? 18 : 15))
                                            .foregroundColor(.white)
                                            .autocapitalization(.none)
                                            .autocorrectionDisabled()
                                    }
                                    .padding(.horizontal, isPad ? 18 : 14)
                                    .padding(.vertical, isPad ? 18 : 14)
                                    .background(Color(hex: "0f172a").opacity(0.65))
                                    .cornerRadius(isPad ? 18 : 14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: isPad ? 18 : 14)
                                            .stroke(Color(hex: "334155").opacity(0.9), lineWidth: 1)
                                    )
                                }
                                
                                // Password Input
                                VStack(alignment: .leading, spacing: isPad ? 9 : 7) {
                                    Text("Password")
                                        .font(.system(size: isPad ? 17 : 13, weight: .medium))
                                        .foregroundColor(Color(hex: "cbd5e1"))
                                    
                                    HStack(spacing: 12) {
                                        Image(systemName: "lock")
                                            .font(.system(size: isPad ? 22 : 16))
                                            .foregroundColor(Color(hex: "64748b"))
                                        
                                        SecureField("", text: $password, prompt: Text("••••••••").foregroundColor(Color(hex: "475569")))
                                            .font(.system(size: isPad ? 18 : 15))
                                            .foregroundColor(.white)
                                            .autocapitalization(.none)
                                            .autocorrectionDisabled()
                                    }
                                    .padding(.horizontal, isPad ? 18 : 14)
                                    .padding(.vertical, isPad ? 18 : 14)
                                    .background(Color(hex: "0f172a").opacity(0.65))
                                    .cornerRadius(isPad ? 18 : 14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: isPad ? 18 : 14)
                                            .stroke(Color(hex: "334155").opacity(0.9), lineWidth: 1)
                                    )
                                }
                                
                                // Sign In Button
                                Button(action: {
                                    Task {
                                        await authVM.login(identifier: identifier, password: password)
                                    }
                                }) {
                                    HStack(spacing: 10) {
                                        if authVM.isLoading {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        } else {
                                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                                .font(.system(size: isPad ? 22 : 16, weight: .bold))
                                            Text("Sign in")
                                                .font(.system(size: isPad ? 20 : 16, weight: .semibold))
                                        }
                                    }
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: isPad ? 68 : 52)
                                    .background(
                                        LinearGradient(
                                            colors: [
                                                Color(hex: "b45309"),
                                                Color(hex: "2563eb")
                                            ],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .cornerRadius(isPad ? 18 : 14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: isPad ? 18 : 14)
                                            .stroke(Color.white.opacity(0.18), lineWidth: 1)
                                    )
                                    .shadow(color: Color(hex: "2563eb").opacity(0.35), radius: 10, x: 0, y: 4)
                                }
                                .disabled(authVM.isLoading || identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
                                .opacity((authVM.isLoading || identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty) ? 0.65 : 1.0)
                                .padding(.top, 4)
                            }
                            
                            // Footer Security Note
                            VStack(spacing: 4) {
                                Text("Protected by Google Cloud Authentication.")
                                Text("Access restricted to authorized personnel only.")
                            }
                            .font(.system(size: isPad ? 14 : 11, weight: .regular))
                            .foregroundColor(Color(hex: "64748b"))
                            .multilineTextAlignment(.center)
                            .padding(.top, isPad ? 18 : 14)
                        }
                        .padding(isPad ? 38 : 26)
                        .background(
                            Color(hex: "1e293b").opacity(0.65)
                        )
                        .background(.ultraThinMaterial)
                        .cornerRadius(isPad ? 30 : 24)
                        .overlay(
                            RoundedRectangle(cornerRadius: isPad ? 30 : 24)
                                .stroke(Color.white.opacity(0.12), lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.45), radius: isPad ? 32 : 25, x: 0, y: 12)
                        .padding(.horizontal, 20)
                        .frame(maxWidth: isPad ? 630 : 420)
                        
                        Spacer(minLength: isPad ? 36 : 24)
                    }
                    .frame(minHeight: screenGeo.size.height)
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

// Background Stardust Star Field View
private struct StarFieldView: View {
    var body: some View {
        Canvas { context, size in
            var rng = SystemRandomNumberGenerator()
            for _ in 0..<85 {
                let x = Double.random(in: 0...size.width, using: &rng)
                let y = Double.random(in: 0...size.height, using: &rng)
                let r = Double.random(in: 0.6...1.8, using: &rng)
                let opacity = Double.random(in: 0.2...0.7, using: &rng)
                let rect = CGRect(x: x, y: y, width: r, height: r)
                context.fill(Path(ellipseIn: rect), with: .color(Color.white.opacity(opacity)))
            }
        }
    }
}
