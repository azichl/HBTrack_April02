import SwiftUI
import Charts

struct IngestionChart: View {
    let data: [(date: Date, count: Int)]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Data Ingestion (7 Days)")
                .font(.headline)
                .padding(.horizontal)
            
            if data.isEmpty {
                Text("No data available")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                Chart {
                    ForEach(data, id: \.date) { item in
                        AreaMark(
                            x: .value("Date", item.date),
                            y: .value("Count", item.count)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color.blue.opacity(0.4), Color.blue.opacity(0.0)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .interpolationMethod(.monotone)
                        
                        LineMark(
                            x: .value("Date", item.date),
                            y: .value("Count", item.count)
                        )
                        .foregroundStyle(Color.blue)
                        .interpolationMethod(.monotone)
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day)) { value in
                        if let date = value.as(Date.self) {
                            AxisValueLabel {
                                Text(dateFormatter.string(from: date))
                            }
                        }
                    }
                }
                .frame(height: 200)
                .padding(.horizontal)
            }
        }
        .padding(.vertical)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
    
    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE" // Abbreviated day name (e.g., Mon, Tue)
        return formatter
    }
}
