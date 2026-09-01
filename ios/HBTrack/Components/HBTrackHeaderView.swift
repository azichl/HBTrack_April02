import SwiftUI

struct HBTrackHeaderView: View {
    var onRefresh: (() -> Void)? = nil
    var onSettings: (() -> Void)? = nil
    
    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color(hex: "22c55e"))
                .frame(width: 8, height: 8)
            
            Text("HBTrack iOS")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.primary)
            
            Spacer()
            
            HStack(spacing: 16) {
                if let onSettings = onSettings {
                    Button(action: onSettings) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.gray)
                    }
                }
                
                if let onRefresh = onRefresh {
                    Button(action: onRefresh) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.blue)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 6)
        .background(Color(UIColor.systemBackground))
    }
}
