import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject var viewModel = SettingsViewModel()
    @AppStorage("isDarkMode") private var isDarkMode = false
    @State private var showSignOutAlert = false
    
    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("Profile")) {
                    TextField("Full Name", text: $viewModel.fullName)
                    
                    TextField("Email", text: $viewModel.email)
                        .disabled(true)
                        .foregroundColor(.gray)
                    
                    if let role = authVM.userProfile?.role {
                        HStack {
                            Text("Role")
                            Spacer()
                            Text(role)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.blue.opacity(0.2))
                                .foregroundColor(.blue)
                                .cornerRadius(8)
                        }
                    }
                    
                    Picker("Timezone", selection: $viewModel.selectedTimezone) {
                        ForEach(viewModel.timezones, id: \.self) { tz in
                            Text(tz).tag(tz)
                        }
                    }
                    
                    Picker("Language", selection: $viewModel.language) {
                        Text("English").tag("English")
                        Text("Arabic").tag("Arabic")
                    }
                }
                
                Section(header: Text("Preferences")) {
                    Toggle("Dark Mode", isOn: $isDarkMode)
                        .onChange(of: isDarkMode) { newValue in
                            viewModel.darkMode = newValue
                        }
                }
                
                Section(header: Text("Security")) {
                    SecureField("Current Password", text: $viewModel.currentPassword)
                    SecureField("New Password", text: $viewModel.newPassword)
                    SecureField("Confirm Password", text: $viewModel.confirmPassword)
                    
                    Button("Update Password") {
                        Task {
                            await viewModel.changePassword()
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
                
                if let message = viewModel.saveMessage {
                    Section {
                        Text(message).foregroundColor(.green)
                    }
                }
                
                if let error = viewModel.saveError {
                    Section {
                        Text(error).foregroundColor(.red)
                    }
                }
                
                Section(header: Text("Account"), footer: Text("RAF Tracking v2.0")) {
                    Button(action: {
                        Task {
                            if let userId = authVM.currentUser?.uid {
                                await viewModel.saveProfile(userId: userId)
                            }
                        }
                    }) {
                        HStack {
                            Spacer()
                            if viewModel.isSaving {
                                ProgressView()
                            } else {
                                Text("Save Changes")
                            }
                            Spacer()
                        }
                    }
                    
                    Button(action: {
                        showSignOutAlert = true
                    }) {
                        HStack {
                            Spacer()
                            Text("Sign Out")
                                .foregroundColor(.red)
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .onAppear {
                viewModel.loadProfile(from: authVM.userProfile)
                viewModel.darkMode = isDarkMode
            }
            .alert("Sign Out", isPresented: $showSignOutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {
                    do {
                        try viewModel.signOut()
                    } catch {
                        viewModel.saveError = error.localizedDescription
                    }
                }
            } message: {
                Text("Are you sure you want to sign out?")
            }
            .preferredColorScheme(isDarkMode ? .dark : .light)
        }
    }
}
