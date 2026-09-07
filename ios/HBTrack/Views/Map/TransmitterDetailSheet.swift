import SwiftUI
import CoreLocation

struct TransmitterDetailSheet: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var airTempText: String = "Loading..."
    
    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                if let transmitter = viewModel.selectedTransmitter {
                    HStack {
                        Text(transmitter.platform_id)
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Spacer()
                        
                        StatusBadge(status: transmitter.effectiveStatus)
                    }
                    
                    Divider()
                    
                    VStack(spacing: 12) {
                        let matchingBird = viewModel.birds.first {
                            $0.ring_id == transmitter.platform_id || $0.id == transmitter.id
                        }
                        DetailRow(icon: "bird", title: "Ring ID", value: matchingBird?.ring_id ?? "N/A")
                        
                        if let latestPos = viewModel.positions.filter({ $0.effectiveTransmitterId == transmitter.platform_id }).sorted(by: { $0.timestamp > $1.timestamp }).first {
                            
                            DetailRow(icon: "clock", title: "Last Fix", value: latestPos.timestamp)
                            
                            if let voltage = transmitter.battery_voltage {
                                HStack {
                                    Label("Battery", systemImage: "battery.100")
                                        .foregroundColor(.secondary)
                                    Spacer()
                                    Text(String(format: "%.2f V", voltage))
                                        .foregroundColor(voltage < 3.5 ? .red : .primary)
                                        .fontWeight(voltage < 3.5 ? .bold : .regular)
                                }
                            }
                            
                            DetailRow(icon: "location", title: "Location Type", value: latestPos.locationType ?? "GPS")
                            
                            DetailRow(icon: "thermometer.sun", title: "Air Temp (2m)", value: airTempText)
                            
                            HStack {
                                Label("Coordinates", systemImage: "mappin.and.ellipse")
                                    .foregroundColor(.secondary)
                                Spacer()
                                Text(String(format: "%.5f, %.5f", latestPos.lat, latestPos.lon))
                                    .font(.system(.body, design: .monospaced))
                            }
                            .onTapGesture {
                                UIPasteboard.general.string = "\(latestPos.lat), \(latestPos.lon)"
                            }
                            
                            HStack(spacing: 16) {
                                Button {
                                    if let tx = viewModel.selectedTransmitter {
                                        viewModel.selectTransmitterForHistory(tx)
                                    } else {
                                        viewModel.showHistory.toggle()
                                    }
                                } label: {
                                    Label("History", systemImage: "clock.arrow.circlepath")
                                        .frame(maxWidth: .infinity)
                                    }
                                .buttonStyle(.borderedProminent)
                                
                                Button {
                                    if let url = URL(string: "https://earth.google.com/web/search/\(latestPos.lat),\(latestPos.lon)") {
                                        UIApplication.shared.open(url)
                                    }
                                } label: {
                                    Label("Google Earth", systemImage: "globe")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                            }
                            .padding(.top, 8)
                        }
                    }
                } else {
                    Text("No transmitter selected")
                        .foregroundColor(.secondary)
                }
                
                Spacer(minLength: 12)
            }
            .padding()
            .frame(maxWidth: 540)
        }
        .presentationDetents([.fraction(0.55), .medium, .large])
        .presentationDragIndicator(.visible)
        .task(id: viewModel.selectedTransmitter?.platform_id) {
            if let tx = viewModel.selectedTransmitter,
               let pos = viewModel.positions.filter({ $0.effectiveTransmitterId == tx.platform_id }).sorted(by: { $0.timestamp > $1.timestamp }).first {
                await fetchAirTemp(lat: pos.lat, lon: pos.lon, timestamp: pos.timestamp)
            } else {
                airTempText = "--"
            }
        }
    }
    
    private func fetchAirTemp(lat: Double, lon: Double, timestamp: String) async {
        let date = DateFormatters.parseDate(timestamp) ?? Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        let dateStr = formatter.string(from: date)
        let cal = Calendar(identifier: .gregorian)
        let utcHour = cal.component(.hour, from: date)
        
        let urlStr = "https://api.open-meteo.com/v1/forecast?latitude=\(lat)&longitude=\(lon)&start_date=\(dateStr)&end_date=\(dateStr)&hourly=temperature_2m&timezone=UTC"
        guard let url = URL(string: urlStr) else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let hourly = json["hourly"] as? [String: Any],
               let temps = hourly["temperature_2m"] as? [Double],
               utcHour >= 0 && utcHour < temps.count {
                let t = temps[utcHour]
                self.airTempText = String(format: "%.1f°C", t)
            } else {
                self.airTempText = "--"
            }
        } catch {
            self.airTempText = "--"
        }
    }
}

struct DetailRow: View {
    let icon: String
    let title: String
    let value: String
    
    var body: some View {
        HStack {
            Label(title, systemImage: icon)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
    }
}
