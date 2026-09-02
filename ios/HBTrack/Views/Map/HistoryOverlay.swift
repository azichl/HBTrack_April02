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
                        Text("\(viewModel.historyPositions.count) fixes")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(viewModel.historyPositions.isEmpty ? .secondary : .green)
                    }
                }
            }
            
            // Timeframe Segmented Preset
            VStack(alignment: .leading, spacing: 4) {
                Text("Time Range")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                
                Picker("Timeframe", selection: $viewModel.historyDatePreset) {
                    Text("24h").tag(DatePreset.twentyFourHours)
                    Text("7d").tag(DatePreset.sevenDays)
                    Text("30d").tag(DatePreset.thirtyDays)
                    Text("1y").tag(DatePreset.oneYear)
                    Text("2y").tag(DatePreset.twoYears)
                }
                .pickerStyle(.segmented)
                .onChange(of: viewModel.historyDatePreset) { _ in
                    Task {
                        await viewModel.loadHistory()
                    }
                }
            }
            
            // Location Fix Type Filter (All, GPS, Doppler)
            VStack(alignment: .leading, spacing: 4) {
                Text("Location Source")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                
                Picker("Location Type", selection: $viewModel.historyLocationType) {
                    Text("All Fixes").tag("All")
                    Text("GPS").tag("GPS")
                    Text("Doppler").tag("Doppler")
                }
                .pickerStyle(.segmented)
                .onChange(of: viewModel.historyLocationType) { _ in
                    Task {
                        await viewModel.loadHistory()
                    }
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
            await viewModel.loadHistory()
        }
    }
}
