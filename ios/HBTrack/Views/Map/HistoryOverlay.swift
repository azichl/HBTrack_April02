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
                        viewModel.selectedTransmitterIds.removeAll()
                        viewModel.rawHistoryPositionsByTx.removeAll()
                        viewModel.historyPaths.removeAll()
                        viewModel.historyPositions.removeAll()
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(Color(UIColor.secondaryLabel))
                        .font(.system(size: 20))
                }
            }
            
            // Multi-Transmitter Selector with Distinct Color Badges
            if !viewModel.transmitters.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Active Trajectory:")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(AppTheme.textSecondary)
                        
                        Spacer()
                        
                        if viewModel.isLoading {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            let totalFixes = viewModel.historyPositions.count
                            let gpsCount = viewModel.historyPositions.filter { ($0.locationType ?? "").uppercased() == "GPS" }.count
                            let dopplerCount = viewModel.historyPositions.filter { ($0.locationType ?? "").uppercased() == "DOPPLER" }.count
                            
                            Text("\(totalFixes) fixes (GPS: \(gpsCount) · Doppler: \(dopplerCount))")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(totalFixes == 0 ? .secondary : AppTheme.brandGold)
                        }
                    }
                    
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(viewModel.selectedTransmitterIds, id: \.self) { pttId in
                                HStack(spacing: 6) {
                                    Circle()
                                        .fill(viewModel.colorForHistoryTransmitter(pttId))
                                        .frame(width: 8, height: 8)
                                    
                                    Text(pttId)
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(Color(UIColor.label))
                                    
                                    if viewModel.selectedTransmitterIds.count > 1 {
                                        Button {
                                            withAnimation {
                                                viewModel.toggleHistoryTransmitter(pttId)
                                            }
                                        } label: {
                                            Image(systemName: "xmark")
                                                .font(.system(size: 9, weight: .bold))
                                                .foregroundColor(Color(UIColor.secondaryLabel))
                                        }
                                    }
                                }
                                .padding(.horizontal, 9)
                                .padding(.vertical, 5)
                                .background(viewModel.colorForHistoryTransmitter(pttId).opacity(0.12))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(viewModel.colorForHistoryTransmitter(pttId).opacity(0.4), lineWidth: 1)
                                )
                                .cornerRadius(8)
                            }
                            
                            // "+ Add PTT" Dropdown Menu
                            Menu {
                                ForEach(viewModel.transmitters) { tx in
                                    let isSelected = viewModel.selectedTransmitterIds.contains(tx.platform_id)
                                    Button {
                                        viewModel.toggleHistoryTransmitter(tx.platform_id)
                                    } label: {
                                        HStack {
                                            Text("\(tx.platform_id) (\(tx.effectiveStatus))")
                                            if isSelected {
                                                Image(systemName: "checkmark")
                                            }
                                        }
                                    }
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text("Add PTT")
                                        .font(.system(size: 11, weight: .bold))
                                }
                                .foregroundColor(AppTheme.brandGold)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 5)
                                .background(AppTheme.brandGoldLight)
                                .cornerRadius(8)
                            }
                        }
                        .padding(.vertical, 2)
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
            if viewModel.selectedTransmitterIds.isEmpty {
                if let sel = viewModel.selectedTransmitter {
                    viewModel.selectedTransmitterIds = [sel.platform_id]
                } else if let first = viewModel.transmitters.first {
                    viewModel.selectedTransmitter = first
                    viewModel.selectedTransmitterIds = [first.platform_id]
                }
            }
            if viewModel.historyPaths.isEmpty {
                await viewModel.loadHistory()
            }
        }
    }
}
