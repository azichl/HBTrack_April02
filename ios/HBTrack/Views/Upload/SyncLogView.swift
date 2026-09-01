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
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Timestamp")
                        Spacer()
                        Text(result.timestamp, style: .date)
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
            }
            .navigationTitle("Sync Log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}
