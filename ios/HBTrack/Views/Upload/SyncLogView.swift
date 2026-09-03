import SwiftUI

struct SyncLogView: View {
    @Environment(\.dismiss) var dismiss
    let result: SyncResult
    
    var body: some View {
        NavigationStack {
            List {
                Section("Summary") {
                    HStack {
                        Text("Records Imported")
                        Spacer()
                        Text("\(result.recordsImported)")
                            .fontWeight(.bold)
                            .foregroundColor(AppTheme.brandGold)
                    }
                    
                    HStack {
                        Text("Transmitters Updated")
                        Spacer()
                        Text("\(result.transmittersUpdated)")
                            .fontWeight(.semibold)
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Timestamp")
                        Spacer()
                        Text(DateFormatters.displayDate(result.timestamp) + " " + DateFormatters.displayTime(result.timestamp))
                            .foregroundColor(.secondary)
                    }
                }
                
                if !result.errors.isEmpty {
                    Section("Errors") {
                        ForEach(result.errors, id: \.self) { error in
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                    }
                }
                
                if !result.logs.isEmpty {
                    Section("Execution Logs") {
                        ForEach(result.logs, id: \.self) { log in
                            Text(log)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(Color(UIColor.label))
                        }
                    }
                }
            }
            .navigationTitle("CLS Upload Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}
