import SwiftUI

struct StatusPieChart: View {
    let data: [(status: String, count: Int, color: Color)]
    
    var totalCount: Int {
        data.reduce(0) { $0 + $1.count }
    }
    
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let cx = w / 2
            let cy = h / 2
            
            // Slightly larger donut radius
            let outerRadius: CGFloat = min(w, h) * 0.38
            let innerRadius: CGFloat = outerRadius * 0.62
            let midRadius: CGFloat = (innerRadius + outerRadius) / 2
            
            ZStack {
                if totalCount > 0 {
                    let layouts = sliceLayouts(total: totalCount)
                    
                    // 1. Donut Arcs & Slices
                    ForEach(layouts, id: \.index) { item in
                        DonutSliceShape(
                            startAngle: Angle(degrees: item.startAngle),
                            endAngle: Angle(degrees: item.endAngle),
                            innerRadius: innerRadius,
                            outerRadius: outerRadius
                        )
                        .fill(item.color)
                        .overlay(
                            DonutSliceShape(
                                startAngle: Angle(degrees: item.startAngle),
                                endAngle: Angle(degrees: item.endAngle),
                                innerRadius: innerRadius,
                                outerRadius: outerRadius
                            )
                            .stroke(Color.white, lineWidth: 2.5)
                        )
                    }
                    
                    // 2. Values inside slice
                    ForEach(layouts, id: \.index) { item in
                        let rad = item.midAngle * .pi / 180.0
                        let xVal = cx + midRadius * cos(rad)
                        let yVal = cy + midRadius * sin(rad)
                        
                        Text("\(item.count)")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .shadow(color: Color.black.opacity(0.35), radius: 1, x: 0, y: 1)
                            .position(x: xVal, y: yVal)
                    }
                    
                    // 3. Callout leader lines
                    ForEach(layouts, id: \.index) { item in
                        let rad = item.midAngle * .pi / 180.0
                        let cosVal = cos(rad)
                        let sinVal = sin(rad)
                        
                        let p0 = CGPoint(x: cx + outerRadius * cosVal, y: cy + outerRadius * sinVal)
                        let isTop = abs(cosVal) < 0.30 && sinVal < 0
                        let isBottom = abs(cosVal) < 0.30 && sinVal > 0
                        
                        let pElbow: CGPoint = {
                            if isTop {
                                return CGPoint(x: p0.x, y: p0.y - 18)
                            } else if isBottom {
                                return CGPoint(x: p0.x, y: p0.y + 18)
                            } else {
                                return CGPoint(x: cx + (outerRadius + 15) * cosVal, y: cy + (outerRadius + 15) * sinVal)
                            }
                        }()
                        
                        let pTail: CGPoint = {
                            if isTop || isBottom {
                                return pElbow
                            } else if cosVal >= 0 {
                                return CGPoint(x: pElbow.x + 12, y: pElbow.y)
                            } else {
                                return CGPoint(x: pElbow.x - 12, y: pElbow.y)
                            }
                        }()
                        
                        Path { path in
                            path.move(to: p0)
                            path.addLine(to: pElbow)
                            if pElbow != pTail {
                                path.addLine(to: pTail)
                            }
                        }
                        .stroke(Color(hex: "94A3B8"), lineWidth: 1.2)
                    }
                    
                    // 4. Callout Labels outside with precise non-overlapping placement
                    ForEach(layouts, id: \.index) { item in
                        let rad = item.midAngle * .pi / 180.0
                        let cosVal = cos(rad)
                        let sinVal = sin(rad)
                        
                        let isTop = abs(cosVal) < 0.30 && sinVal < 0
                        let isBottom = abs(cosVal) < 0.30 && sinVal > 0
                        
                        let textEstWidth = CGFloat(item.status.count) * 6.6
                        
                        let labelPos: CGPoint = {
                            if isTop {
                                return CGPoint(x: cx + outerRadius * cosVal, y: cy - outerRadius - 28)
                            } else if isBottom {
                                return CGPoint(x: cx + outerRadius * cosVal, y: cy + outerRadius + 28)
                            } else {
                                let xElbow = cx + (outerRadius + 15) * cosVal
                                let yElbow = cy + (outerRadius + 15) * sinVal
                                if cosVal >= 0 {
                                    // Right side: tail ends at xElbow + 12, text placed after tail
                                    let xStart = xElbow + 16
                                    return CGPoint(x: xStart + textEstWidth / 2, y: yElbow)
                                } else {
                                    // Left side: tail ends at xElbow - 12, text placed before tail
                                    let xEnd = xElbow - 16
                                    return CGPoint(x: xEnd - textEstWidth / 2, y: yElbow)
                                }
                            }
                        }()
                        
                        Text(item.status)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Color(hex: "475569"))
                            .lineLimit(1)
                            .fixedSize()
                            .position(labelPos)
                    }
                }
                
                // Center Donut Hole & Total Units Label (Reduced font size as requested)
                VStack(spacing: 3) {
                    Text("\(totalCount)")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(Color(hex: "0F172A"))
                    Text("UNITS")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(hex: "94A3B8"))
                        .tracking(1.4)
                }
                .position(x: cx, y: cy)
            }
        }
        .frame(height: 300)
    }
    
    private struct SliceLayout {
        let index: Int
        let status: String
        let count: Int
        let color: Color
        let startAngle: Double
        let endAngle: Double
        let midAngle: Double
    }
    
    private func sliceLayouts(total: Int) -> [SliceLayout] {
        guard total > 0 else { return [] }
        var current = -90.0
        var result: [SliceLayout] = []
        let gap = data.count > 1 ? 2.5 : 0.0
        
        for (i, item) in data.enumerated() {
            let angleDelta = (Double(item.count) / Double(total)) * 360.0
            let start = current + gap / 2
            let end = current + angleDelta - gap / 2
            let mid = (start + end) / 2
            
            result.append(
                SliceLayout(
                    index: i,
                    status: item.status,
                    count: item.count,
                    color: item.color,
                    startAngle: start,
                    endAngle: end,
                    midAngle: mid
                )
            )
            current += angleDelta
        }
        return result
    }
}

// Custom Shape for Donut Arc Segment
private struct DonutSliceShape: Shape {
    let startAngle: Angle
    let endAngle: Angle
    let innerRadius: CGFloat
    let outerRadius: CGFloat
    
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path()
        
        path.addArc(
            center: center,
            radius: outerRadius,
            startAngle: startAngle,
            endAngle: endAngle,
            clockwise: false
        )
        path.addArc(
            center: center,
            radius: innerRadius,
            startAngle: endAngle,
            endAngle: startAngle,
            clockwise: true
        )
        path.closeSubpath()
        return path
    }
}
