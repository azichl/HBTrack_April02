import Foundation
import FirebaseFirestore
import SwiftUI

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
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case displayName
        case email
        case username
        case phone
        case role
        case avatarUrl
        case status
        case timezone
        case timeZone
        case language
        case permissions
        case appAccess
        case iosDataUpload
        case iosPttVisibility
        case iosVisiblePtts
    }
    
    init(
        id: String? = nil,
        name: String = "User",
        email: String = "",
        username: String? = nil,
        phone: String? = nil,
        role: String = "Viewer",
        avatarUrl: String? = nil,
        status: String = "active",
        timezone: String? = "System",
        language: String? = "English",
        permissions: [String] = ["View Data"],
        appAccess: [String]? = ["web", "ios"],
        iosDataUpload: Bool? = true,
        iosPttVisibility: String? = "all",
        iosVisiblePtts: [String]? = []
    ) {
        self.id = id
        self.name = name
        self.email = email
        self.username = username
        self.phone = phone
        self.role = role
        self.avatarUrl = avatarUrl
        self.status = status
        self.timezone = timezone
        self.language = language
        self.permissions = permissions
        self.appAccess = appAccess
        self.iosDataUpload = iosDataUpload
        self.iosPttVisibility = iosPttVisibility
        self.iosVisiblePtts = iosVisiblePtts
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try? container.decodeIfPresent(String.self, forKey: .id)
        
        let rawName = (try? container.decodeIfPresent(String.self, forKey: .name)) ??
                      (try? container.decodeIfPresent(String.self, forKey: .displayName)) ?? "User"
        self.name = rawName.isEmpty ? "User" : rawName
        
        self.email = (try? container.decodeIfPresent(String.self, forKey: .email)) ?? ""
        self.username = try? container.decodeIfPresent(String.self, forKey: .username)
        self.phone = try? container.decodeIfPresent(String.self, forKey: .phone)
        
        let rawRole = (try? container.decodeIfPresent(String.self, forKey: .role)) ?? "Viewer"
        switch rawRole.lowercased() {
        case "admin", "administrator": self.role = "Administrator"
        case "manager": self.role = "Manager"
        case "researcher": self.role = "Researcher"
        case "field_operator", "field_coordinator", "field coordinator": self.role = "Field Coordinator"
        case "data_entry", "data entry": self.role = "Data Entry"
        default: self.role = rawRole.isEmpty ? "Viewer" : rawRole
        }
        
        self.avatarUrl = try? container.decodeIfPresent(String.self, forKey: .avatarUrl)
        self.status = (try? container.decodeIfPresent(String.self, forKey: .status)) ?? "active"
        self.timezone = (try? container.decodeIfPresent(String.self, forKey: .timezone)) ??
                        (try? container.decodeIfPresent(String.self, forKey: .timeZone)) ?? "System"
        self.language = (try? container.decodeIfPresent(String.self, forKey: .language)) ?? "English"
        
        // Handle permissions as [String] or [String: Bool]
        if let permArray = try? container.decodeIfPresent([String].self, forKey: .permissions) {
            self.permissions = permArray
        } else if let permMap = try? container.decodeIfPresent([String: Bool].self, forKey: .permissions) {
            self.permissions = permMap.filter { $0.value }.map { $0.key }
        } else {
            self.permissions = ["View Data"]
        }
        
        // Handle appAccess as [String]
        if let accessArray = try? container.decodeIfPresent([String].self, forKey: .appAccess) {
            self.appAccess = accessArray
        } else {
            self.appAccess = ["web", "ios"]
        }
        
        self.iosDataUpload = try? container.decodeIfPresent(Bool.self, forKey: .iosDataUpload)
        self.iosPttVisibility = (try? container.decodeIfPresent(String.self, forKey: .iosPttVisibility)) ?? "all"
        
        // Handle iosVisiblePtts safely
        if let pttsArray = try? container.decodeIfPresent([String].self, forKey: .iosVisiblePtts) {
            self.iosVisiblePtts = pttsArray
        } else {
            self.iosVisiblePtts = []
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(email, forKey: .email)
        try container.encodeIfPresent(username, forKey: .username)
        try container.encodeIfPresent(phone, forKey: .phone)
        try container.encode(role, forKey: .role)
        try container.encodeIfPresent(avatarUrl, forKey: .avatarUrl)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(timezone, forKey: .timezone)
        try container.encodeIfPresent(language, forKey: .language)
        try container.encode(permissions, forKey: .permissions)
        try container.encodeIfPresent(appAccess, forKey: .appAccess)
        try container.encodeIfPresent(iosDataUpload, forKey: .iosDataUpload)
        try container.encodeIfPresent(iosPttVisibility, forKey: .iosPttVisibility)
        try container.encodeIfPresent(iosVisiblePtts, forKey: .iosVisiblePtts)
    }
    
    func hasPermission(_ permission: String) -> Bool {
        if role == "Administrator" { return true }
        return permissions.contains(permission)
    }
    
    func hasAppAccess(_ access: String) -> Bool {
        let list = appAccess ?? ["web", "ios"]
        return list.contains(access)
    }
    
    func canViewTransmitter(_ platformId: String) -> Bool {
        if role == "Administrator" || role == "Manager" { return true }
        if iosPttVisibility == "all" { return true }
        return iosVisiblePtts?.contains(platformId) ?? false
    }
}
