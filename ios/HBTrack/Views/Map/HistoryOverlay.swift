import SwiftUI

struct HistoryOverlay: View {
    @ObservedObject var viewModel: MapViewModel
    @State private var dragOffset: CGSize = .zero
    @State private var accumulatedOffset: CGSize = .zero
    @State private var showSearchInput: Bool = false
    @State private var pttSearchText: String = ""
    
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
                        showSearchInput = false
                        pttSearchText = ""
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
                            
                            // "+ Add PTT" Search Toggle Button
                            Button {
                                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                    showSearchInput.toggle()
                                    if !showSearchInput {
                                        pttSearchText = ""
                                    }
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: showSearchInput ? "chevron.up" : "magnifyingglass")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text(showSearchInput ? "Close" : "Add PTT")
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
                    
                    // Search & Direct Entry Case for Scalable 1k - 10k+ PTTs
                    if showSearchInput {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                HStack(spacing: 6) {
                                    Image(systemName: "magnifyingglass")
                                        .font(.system(size: 11))
                                        .foregroundColor(AppTheme.textMuted)
                                    
                                    TextField("Type PTT ID (e.g. 244289)...", text: $pttSearchText)
                                        .font(.system(size: 12))
                                        .keyboardType(.numbersAndPunctuation)
                                        .autocapitalization(.none)
                                        .disableAutocorrection(true)
                                        .onSubmit {
                                            submitTypedPTT()
                                        }
                                    
                                    if !pttSearchText.isEmpty {
                                        Button {
                                            pttSearchText = ""
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .font(.system(size: 12))
                                                .foregroundColor(Color(UIColor.secondaryLabel))
                                        }
                                    }
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(Color(UIColor.systemBackground))
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(AppTheme.brandGold.opacity(0.5), lineWidth: 1)
                                )
                                
                                Button {
                                    submitTypedPTT()
                                } label: {
                                    Text("Add")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 7)
                                        .background(pttSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.gray.opacity(0.4) : AppTheme.brandGold)
                                        .cornerRadius(8)
                                }
                                .disabled(pttSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            }
                            
                            // Instant Suggestions Matching Typed Query
                            let cleanQuery = pttSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
                            let matches = cleanQuery.isEmpty ? [] : viewModel.transmitters.filter {
                                $0.platform_id.localizedCaseInsensitiveContains(cleanQuery) &&
                                !viewModel.selectedTransmitterIds.contains($0.platform_id)
                            }.prefix(4)
                            
                            if !matches.isEmpty {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 6) {
                                        ForEach(Array(matches), id: \.platform_id) { tx in
                                            Button {
                                                viewModel.toggleHistoryTransmitter(tx.platform_id)
                                                pttSearchText = ""
                                                withAnimation {
                                                    showSearchInput = false
                                                }
                                            } label: {
                                                HStack(spacing: 3) {
                                                    Image(systemName: "plus")
                                                        .font(.system(size: 9, weight: .bold))
                                                    Text(tx.platform_id)
                                                        .fontWeight(.bold)
                                                    Text("(\(tx.effectiveStatus))")
                                                        .foregroundColor(.secondary)
                                                }
                                                .font(.system(size: 10.5))
                                                .padding(.horizontal, 7)
                                                .padding(.vertical, 3.5)
                                                .background(Color(UIColor.systemBackground))
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 6)
                                                        .stroke(Color(UIColor.separator).opacity(0.4), lineWidth: 1)
                                                )
                                                .cornerRadius(6)
                                            }
                                        }
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
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
    
    private func submitTypedPTT() {
        let clean = pttSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        
        if let match = viewModel.transmitters.first(where: { $0.platform_id.lowercased() == clean.lowercased() }) {
            if !viewModel.selectedTransmitterIds.contains(match.platform_id) {
                viewModel.toggleHistoryTransmitter(match.platform_id)
            }
        } else {
            if !viewModel.selectedTransmitterIds.contains(clean) {
                viewModel.toggleHistoryTransmitter(clean)
            }
        }
        pttSearchText = ""
        withAnimation {
            showSearchInput = false
        }
    }
}
