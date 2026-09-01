import SwiftUI
import Charts

struct StatusPieChart: View {
    let data: [(status: String, count: Int, color: Color)]
    
    var totalCount: Int {
        data.reduce(0) { $0 + $1.count }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Transmitter Status")
                .font(.headline)
                .padding(.horizontal)
            
            if data.isEmpty || totalCount == 0 {
                Text("No data available")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                ZStack {
                    // Donut slices
                    ForEach(0..<data.count, id: \.self) { index in
                        DonutSlice(
                            startRatio: sliceStart(at: index),
                            endRatio: sliceEnd(at: index),
                            color: data[index].color
                        )
                    }
                    
                    // Center label
                    VStack(spacing: 2) {
                        Text("\(totalCount)")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                        Text("Total PTTs")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(height: 180)
                .padding(.horizontal)
                
                // Legend
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(data, id: \.status) { item in
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(item.color)
                                    .frame(width: 8, height: 8)
                                Text("\(item.status): \(item.count)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
        .padding(.vertical)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
    
    private func sliceStart(at index: Int) -> Double {
        guard totalCount > 0 else { return 0 }
        let sumBefore = data.prefix(index).reduce(0) { $0 + $1.count }
        return Double(sumBefore) / Double(totalCount)
    }
    
    private func sliceEnd(at index: Int) -> Double {
        guard totalCount > 0 else { return 0 }
        let sumIncluding = data.prefix(index + 1).reduce(0) { $0 + $1.count }
        return Double(sumIncluding) / Double(totalCount)
    }
}

private struct DonutSlice: View {
    let startRatio: Double
    let endRatio: Double
    let color: Color
    
    var body: some View {
        Circle()
            .trim(from: CGFloat(startRatio), to: CGFloat(endRatio))
            .stroke(color, style: StrokeStyle(lineWidth: 24, lineCap: .butt))
            .rotationEffect(.degrees(-90))
            .padding(20)
    }
}
