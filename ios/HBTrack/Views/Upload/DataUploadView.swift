import SwiftUI

struct DataUploadView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject var viewModel = DataUploadViewModel()
    @State private var showSyncLog = false

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("API Credentials")) {
                    TextField("Username", text: $viewModel.username)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                    
                    SecureField("Password", text: $viewModel.password)
                    
                    TextField("Client ID", text: $viewModel.clientId)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }
                
                Section {
                    Button(action: {
                        Task {
                            await viewModel.sync()
                        }
                    }) {
                        HStack {
                            Spacer()
                            if viewModel.isSyncing {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle())
                                    .tint(.white)
                            } else {
                                Text("Connect & Sync")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(viewModel.isSyncing)
                    .foregroundColor(.white)
                    .listRowBackground(viewModel.isSyncing ? Color.gray : Color.blue)
                }
                
                if let lastSyncTime = viewModel.lastSyncTime {
                    Section(header: Text("Last Sync")) {
                        HStack {
                            Text("Time")
                            Spacer()
                            Text(lastSyncTime, style: .time)
                                .foregroundColor(.secondary)
                        }
                        
                        if let result = viewModel.syncResult {
                            HStack {
                                Text("Records Imported")
                                Spacer()
                                Text("\(result.recordsImported)")
                                    .foregroundColor(.secondary)
                            }
                            
                            Button("View Sync Log") {
                                showSyncLog = true
                            }
                        }
                    }
                }
                
                if let error = viewModel.syncError {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                    }
                }
                
                if viewModel.syncResult != nil && viewModel.syncError == nil {
                    Section {
                        Text("Sync completed successfully.")
                            .foregroundColor(.green)
                    }
                }
            }
            .navigationTitle("Data Upload")
            .sheet(isPresented: $showSyncLog) {
                if let result = viewModel.syncResult {
                    SyncLogView(result: result)
                }
            }
        }
    }
}
