import SwiftUI

struct LoadingOverlay: View {
    var message: String? = nil
    
    var body: some View {
        ZStack {
            Color.black.opacity(0.4)
                .edgesIgnoringSafeArea(.all)
            
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.5)
                
                if let msg = message {
                    Text(msg)
                        .font(.headline)
                        .foregroundColor(.white)
                }
            }
            .padding(32)
            .background(Color(UIColor.systemBackground).opacity(0.1))
            .cornerRadius(16)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }
}
