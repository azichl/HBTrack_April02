import SwiftUI
import CoreLocation

struct TransmitterDetailSheet: View {
    @ObservedObject var viewModel: MapViewModel
    let authRole: String
    
    var body: some View {
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
                
                if ["Administrator", "Manager", "Researcher", "Field Coordinator"].contains(authRole) {
                    Divider()
                    Button(role: transmitter.derived_status == "Dead" ? .cancel : .destructive) {
                        Task {
                            if transmitter.derived_status == "Dead" {
                                await viewModel.unmarkDead()
                            } else {
                                await viewModel.markDead(userId: "user", email: "", role: authRole)
                            }
                        }
                    } label: {
                        Text(transmitter.derived_status == "Dead" ? "Unmark as Dead" : "Mark as Dead")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                Text("No transmitter selected")
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding()
        .presentationDetents([.fraction(0.45), .medium])
        .presentationDragIndicator(.visible)
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
