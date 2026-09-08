import SwiftUI

struct StatusPieChart: View {
    let data: [(status: String, count: Int, color: Color)]
    
    var totalCount: Int {
        data.reduce(0) { $0 + $1.count }
    }
    
    var body: some View {
        GeometryReader { geo in
            let isPad = UIDevice.current.userInterfaceIdiom == .pad
            let w = geo.size.width
            let h = geo.size.height
            let cx = w / 2
            let cy = h / 2
            
            // Responsive donut radius tailored for both narrow phones and wide tablets (+20% on iPad)
            let maxRadius: CGFloat = isPad ? 104 : 86
            let outerRadius: CGFloat = min(w * 0.25, maxRadius)
            let innerRadius: CGFloat = outerRadius * 0.58
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
                            .stroke(AppTheme.cardBackground, lineWidth: isPad ? 3.0 : 2.5)
                        )
                    }
                    
                    // 2. Values inside slice
                    ForEach(layouts, id: \.index) { item in
                        let rad = item.midAngle * .pi / 180.0
                        let xVal = cx + midRadius * cos(rad)
                        let yVal = cy + midRadius * sin(rad)
                        
                        Text("\(item.count)")
                            .font(.system(size: isPad ? 14 : 12, weight: .bold))
                            .foregroundColor(.white)
                            .shadow(color: Color.black.opacity(0.35), radius: 1, x: 0, y: 1)
                            .position(x: xVal, y: yVal)
                    }
                    
                    // 3. Callout leader lines with safe margins
                    ForEach(layouts, id: \.index) { item in
                        let rad = item.midAngle * .pi / 180.0
                        let cosVal = cos(rad)
                        let sinVal = sin(rad)
                        
                        let p0 = CGPoint(x: cx + outerRadius * cosVal, y: cy + outerRadius * sinVal)
                        let isTop = abs(cosVal) < 0.30 && sinVal < 0
                        let isBottom = abs(cosVal) < 0.30 && sinVal > 0
                        
                        let radialOffset: CGFloat = min(isPad ? 16 : 12, max(6, w * 0.03))
                        let elbowOffset: CGFloat = isPad ? 18 : 14
                        let pElbow: CGPoint = {
                            if isTop {
                                return CGPoint(x: p0.x, y: p0.y - elbowOffset)
                            } else if isBottom {
                                return CGPoint(x: p0.x, y: p0.y + elbowOffset)
                            } else {
                                return CGPoint(x: cx + (outerRadius + radialOffset) * cosVal, y: cy + (outerRadius + radialOffset) * sinVal)
                            }
                        }()
                        
                        let tailLen: CGFloat = isPad ? 10 : 8
                        let pTail: CGPoint = {
                            if isTop || isBottom {
                                return pElbow
                            } else if cosVal >= 0 {
                                return CGPoint(x: min(w - 8, pElbow.x + tailLen), y: pElbow.y)
                            } else {
                                return CGPoint(x: max(8, pElbow.x - tailLen), y: pElbow.y)
                            }
                        }()
                        
                        Path { path in
                            path.move(to: p0)
                            path.addLine(to: pElbow)
                            if pElbow != pTail {
                                path.addLine(to: pTail)
                            }
                        }
                        .stroke(AppTheme.textMuted, lineWidth: isPad ? 1.5 : 1.2)
                    }
                    
                    // 4. Callout Labels bounded to screen width
                    ForEach(layouts, id: \.index) { item in
                        let rad = item.midAngle * .pi / 180.0
                        let cosVal = cos(rad)
                        let sinVal = sin(rad)
                        
                        let isTop = abs(cosVal) < 0.30 && sinVal < 0
                        let isBottom = abs(cosVal) < 0.30 && sinVal > 0
                        
                        let textEstWidth = CGFloat(item.status.count) * (isPad ? 7.2 : 5.8)
                        let verticalGap: CGFloat = isPad ? 26 : 22
                        
                        let labelPos: CGPoint = {
                            if isTop {
                                let clampedX = max(textEstWidth / 2 + 4, min(w - textEstWidth / 2 - 4, cx + outerRadius * cosVal))
                                return CGPoint(x: clampedX, y: cy - outerRadius - verticalGap)
                            } else if isBottom {
                                let clampedX = max(textEstWidth / 2 + 4, min(w - textEstWidth / 2 - 4, cx + outerRadius * cosVal))
                                return CGPoint(x: clampedX, y: cy + outerRadius + verticalGap)
                            } else {
                                let radialOffset: CGFloat = min(isPad ? 16 : 12, max(6, w * 0.03))
                                let xElbow = cx + (outerRadius + radialOffset) * cosVal
                                let yElbow = cy + (outerRadius + radialOffset) * sinVal
                                if cosVal >= 0 {
                                    let xTail = min(w - 8, xElbow + (isPad ? 10 : 8))
                                    let preferredX = xTail + 4 + textEstWidth / 2
                                    let clampedX = min(w - textEstWidth / 2 - 4, max(textEstWidth / 2 + 4, preferredX))
                                    return CGPoint(x: clampedX, y: yElbow)
                                } else {
                                    let xTail = max(8, xElbow - (isPad ? 10 : 8))
                                    let preferredX = xTail - 4 - textEstWidth / 2
                                    let clampedX = max(textEstWidth / 2 + 4, min(w - textEstWidth / 2 - 4, preferredX))
                                    return CGPoint(x: clampedX, y: yElbow)
                                }
                            }
                        }()
                        
                        Text(item.status)
                            .font(.system(size: isPad ? 13 : 10.5, weight: .semibold))
                            .foregroundColor(AppTheme.textSecondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .fixedSize()
                            .position(labelPos)
                    }
                }
                
                // Center Donut Hole & Total Units Label (+20% on iPad)
                VStack(spacing: isPad ? 4 : 3) {
                    Text("\(totalCount)")
                        .font(.system(size: isPad ? 32 : 26, weight: .bold))
                        .foregroundColor(AppTheme.textPrimary)
                    Text("UNITS")
                        .font(.system(size: isPad ? 12 : 10, weight: .bold))
                        .foregroundColor(AppTheme.textMuted)
                        .tracking(isPad ? 1.6 : 1.4)
                }
                .position(x: cx, y: cy)
            }
        }
        .frame(height: UIDevice.current.userInterfaceIdiom == .pad ? 360 : 300)
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
