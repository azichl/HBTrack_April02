import Foundation
import FirebaseFirestore

struct UserProfile: Identifiable, Codable {
    @DocumentID var id: String?
    var name: String
    var email: String
    var username: String?
    var phone: String?
    var role: String
    var avatarUrl: String?
    var status: String
    var timezone: String?
    var language: String?
    
    var fullName: String {
        get { name }
        set { name = newValue }
    }
    
    var permissions: [String]
    var appAccess: [String]?
    var iosDataUpload: Bool?
    var iosPttVisibility: String? // "all" or "custom"
    var iosVisiblePtts: [String]?
    
    func hasPermission(_ permission: String) -> Bool {
        permissions.contains(permission)
    }
    
    func hasAppAccess(_ access: String) -> Bool {
        appAccess?.contains(access) ?? false
    }
    
    func canViewTransmitter(_ platformId: String) -> Bool {
        if iosPttVisibility == "all" { return true }
        return iosVisiblePtts?.contains(platformId) ?? false
    }
}
