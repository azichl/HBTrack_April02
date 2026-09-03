import SwiftUI

struct HistoryOverlay: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var dragOffset: CGSize = .zero
    @State private var accumulatedOffset: CGSize = .zero
    
    var body: some View {
        VStack(spacing: 12) {
            // Drag Pill Handle
            Capsule()
                .fill(Color(UIColor.tertiaryLabel))
                .frame(width: 38, height: 5)
                .padding(.top, 2)
            
            // Header: Title & Close Button
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(AppTheme.brandGold)
                    Text("Trajectory History")
                        .font(.system(size: 16, weight: .bold))
                }
                
                Spacer()
                
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        viewModel.showHistory = false
                        viewModel.rawHistoryPositions.removeAll()
                        viewModel.historyPositions.removeAll()
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(Color(UIColor.secondaryLabel))
                        .font(.system(size: 20))
                }
            }
            
            // Transmitter Selector
            if !viewModel.transmitters.isEmpty {
                HStack {
                    Text("PTT ID:")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(AppTheme.textSecondary)
                    
                    Menu {
                        ForEach(viewModel.transmitters) { tx in
                            Button {
                                viewModel.selectedTransmitter = tx
                                Task {
                                    await viewModel.loadHistory()
                                }
                            } label: {
                                HStack {
                                    Text("\(tx.platform_id) (\(tx.effectiveStatus))")
                                    if viewModel.selectedTransmitter?.platform_id == tx.platform_id {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(viewModel.selectedTransmitter?.platform_id ?? viewModel.transmitters.first?.platform_id ?? "Select PTT")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(AppTheme.brandGold)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(AppTheme.brandGold)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(AppTheme.brandGoldLight)
                        .cornerRadius(8)
                    }
                    
                    Spacer()
                    
                    if viewModel.isLoading {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        let gpsCount = viewModel.historyPositions.filter { ($0.locationType ?? "").uppercased() == "GPS" }.count
                        let dopplerCount = viewModel.historyPositions.filter { ($0.locationType ?? "").uppercased() == "DOPPLER" }.count
                        
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(viewModel.historyPositions.count) fixes")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(viewModel.historyPositions.isEmpty ? .secondary : .primary)
                            
                            if !viewModel.historyPositions.isEmpty {
                                Text("GPS: \(gpsCount) · Doppler: \(dopplerCount)")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
            
            // Timeframe Segmented Preset (24h, 48h, 7d, 30d, 6m, 1y, 2y, Custom)
            VStack(alignment: .leading, spacing: 5) {
                Text("Time Range")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(DatePreset.allCases) { preset in
                            Button {
                                viewModel.selectedDatePreset = preset
                                Task {
                                    await viewModel.loadHistory()
                                }
                            } label: {
                                Text(preset.rawValue)
                                    .font(.system(size: 12, weight: viewModel.selectedDatePreset == preset ? .bold : .medium))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(viewModel.selectedDatePreset == preset ? AppTheme.brandGold : Color(UIColor.systemGray6))
                                    .foregroundColor(viewModel.selectedDatePreset == preset ? .white : Color(UIColor.label))
                                    .cornerRadius(8)
                            }
                        }
                    }
                }
                
                // Custom Date Range Pickers if Custom is selected
                if viewModel.selectedDatePreset == .custom {
                    VStack(spacing: 6) {
                        DatePicker("From:", selection: $viewModel.customStartDate, displayedComponents: .date)
                            .font(.system(size: 12))
                        DatePicker("To:", selection: $viewModel.customEndDate, displayedComponents: .date)
                            .font(.system(size: 12))
                        
                        Button {
                            Task {
                                await viewModel.loadHistory()
                            }
                        } label: {
                            Text("Apply Date Filter")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                                .background(AppTheme.brandGold)
                                .cornerRadius(8)
                        }
                    }
                    .padding(8)
                    .background(Color(UIColor.systemGray6).opacity(0.5))
                    .cornerRadius(10)
                }
            }
            
            // Location Source Filter (All, GPS, Doppler)
            VStack(alignment: .leading, spacing: 4) {
                Text("Location Source")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                
                Picker("Location Type", selection: $viewModel.selectedLocationType) {
                    Text("All Fixes").tag("All")
                    Text("GPS").tag("GPS")
                    Text("Doppler").tag("Doppler")
                }
                .pickerStyle(.segmented)
                .onChange(of: viewModel.selectedLocationType) { _ in
                    viewModel.applyHistoryFilter()
                }
            }
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemGroupedBackground).opacity(0.96))
        .cornerRadius(20)
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.18), radius: 14, x: 0, y: 6)
        .frame(maxWidth: 360)
        .padding(.horizontal, 16)
        // Draggable modifier
        .offset(
            x: accumulatedOffset.width + dragOffset.width,
            y: accumulatedOffset.height + dragOffset.height
        )
        .gesture(
            DragGesture()
                .onChanged { value in
                    dragOffset = value.translation
                }
                .onEnded { value in
                    accumulatedOffset.width += value.translation.width
                    accumulatedOffset.height += value.translation.height
                    dragOffset = .zero
                }
        )
        .task {
            if viewModel.selectedTransmitter == nil, let first = viewModel.transmitters.first {
                viewModel.selectedTransmitter = first
            }
            if viewModel.rawHistoryPositions.isEmpty {
                await viewModel.loadHistory()
            }
        }
    }
}
