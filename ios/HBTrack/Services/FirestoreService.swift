import Foundation
import FirebaseFirestore

class FirestoreService {
    static let shared = FirestoreService()
    let db = Firestore.firestore()
    private init() {}
    
    func getDocument<T: Decodable>(collection: String, documentId: String) async throws -> T? {
        let docRef = db.collection(collection).document(documentId)
        let snapshot = try await docRef.getDocument()
        return try snapshot.data(as: T.self, decoder: Firestore.Decoder())
    }
    
    func getDocuments<T: Decodable>(collection: String) async throws -> [T] {
        let querySnapshot = try await db.collection(collection).getDocuments()
        return querySnapshot.documents.compactMap { try? $0.data(as: T.self, decoder: Firestore.Decoder()) }
    }
    
    func getDocuments<T: Decodable>(collection: String, whereField: String, isEqualTo value: Any) async throws -> [T] {
        let querySnapshot = try await db.collection(collection).whereField(whereField, isEqualTo: value).getDocuments()
        return querySnapshot.documents.compactMap { try? $0.data(as: T.self, decoder: Firestore.Decoder()) }
    }
    
    func getDocuments<T: Decodable>(collection: String, whereField: String, in values: [Any]) async throws -> [T] {
        guard !values.isEmpty else { return [] }
        let querySnapshot = try await db.collection(collection).whereField(whereField, in: values).getDocuments()
        return querySnapshot.documents.compactMap { try? $0.data(as: T.self, decoder: Firestore.Decoder()) }
    }
    
    func setDocument<T: Encodable>(collection: String, documentId: String, data: T, merge: Bool = true) async throws {
        let docRef = db.collection(collection).document(documentId)
        try docRef.setData(from: data, merge: merge)
    }
    
    func addSnapshotListener<T: Decodable>(collection: String, onChange: @escaping ([T]) -> Void) -> ListenerRegistration {
        return db.collection(collection).addSnapshotListener { querySnapshot, error in
            guard let documents = querySnapshot?.documents else {
                print("Error fetching documents: \(error?.localizedDescription ?? "Unknown error")")
                return
            }
            let decodedDocs = documents.compactMap { try? $0.data(as: T.self, decoder: Firestore.Decoder()) }
            onChange(decodedDocs)
        }
    }
}
