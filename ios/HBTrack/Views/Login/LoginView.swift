import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    
    @State private var identifier = ""
    @State private var password = ""
    
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            VStack(spacing: 16) {
                Image(systemName: "bird")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 80, height: 80)
                    .foregroundColor(.blue)
                
                Text("RAF Tracking")
                    .font(.largeTitle)
                    .fontWeight(.bold)
            }
            .padding(.bottom, 32)
            
            VStack(spacing: 16) {
                TextField("Username or Email", text: $identifier)
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
                    .autocapitalization(.none)
                    .keyboardType(.emailAddress)
                
                SecureField("Password", text: $password)
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
            }
            .padding(.horizontal)
            
            if let error = authVM.authError {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            Button(action: {
                Task {
                    await authVM.login(identifier: identifier, password: password)
                }
            }) {
                HStack {
                    if authVM.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("Sign In")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
            }
            .disabled(authVM.isLoading || identifier.isEmpty || password.isEmpty)
            .padding(.horizontal)
            
            Spacer()
        }
        .padding()
    }
}
