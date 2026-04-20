import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
}

struct EmptyResponse: Decodable, Sendable {}

struct APIRequest<Response: Decodable & Sendable>: Sendable {
    let path: String
    let method: HTTPMethod
    var queryItems: [URLQueryItem] = []
    var headers: [String: String] = [:]
    var body: Data?
    var requiresAuth: Bool = false

    init(
        path: String,
        method: HTTPMethod = .get,
        queryItems: [URLQueryItem] = [],
        headers: [String: String] = [:],
        body: Data? = nil,
        requiresAuth: Bool = false
    ) {
        self.path = path
        self.method = method
        self.queryItems = queryItems
        self.headers = headers
        self.body = body
        self.requiresAuth = requiresAuth
    }
}

enum APIError: LocalizedError {
    case missingBaseURL
    case missingSession
    case invalidRequest
    case invalidResponse
    case httpStatus(Int)
    case serverMessage(String)
    case nonJSONResponse(status: Int, preview: String)
    case decoding(String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .missingBaseURL:
            return "The API base URL is missing."
        case .missingSession:
            return "You need to be signed in to perform this request."
        case .invalidRequest:
            return "The request could not be built."
        case .invalidResponse:
            return "The server returned an invalid response."
        case let .httpStatus(status):
            return "Request failed with status \(status)."
        case let .serverMessage(message):
            return message
        case let .nonJSONResponse(status, preview):
            return "Expected JSON but received non-JSON content (\(status)): \(preview)"
        case let .decoding(message):
            return "Could not decode server data: \(message)"
        case let .transport(message):
            return message
        }
    }
}

final class APIClient: @unchecked Sendable {
    private let baseURL: URL?
    private let sessionStore: SessionStore
    private let urlSession: URLSession
    private let decoder: JSONDecoder

    init(baseURL: URL?, sessionStore: SessionStore, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.sessionStore = sessionStore
        self.urlSession = urlSession
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    func send<Response>(_ request: APIRequest<Response>) async throws -> Response {
        guard let baseURL else {
            throw APIError.missingBaseURL
        }

        let normalizedPath = request.path.hasPrefix("/") ? String(request.path.dropFirst()) : request.path
        guard var components = URLComponents(url: baseURL.appendingPathComponent(normalizedPath), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidRequest
        }

        if !request.queryItems.isEmpty {
            components.queryItems = request.queryItems
        }

        guard let url = components.url else {
            throw APIError.invalidRequest
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.httpBody = request.body
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")

        for (key, value) in request.headers {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }

        if request.requiresAuth {
            guard let token = await sessionStore.loadSession()?.token else {
                throw APIError.missingSession
            }

            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await urlSession.data(for: urlRequest)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            if !(200 ... 299).contains(httpResponse.statusCode) {
                throw parseError(from: data, response: httpResponse)
            }

            if Response.self == EmptyResponse.self {
                return EmptyResponse() as! Response
            }

            if data.isEmpty {
                throw APIError.invalidResponse
            }

            let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type") ?? ""
            let text = String(data: data, encoding: .utf8) ?? ""
            let looksLikeJSON = contentType.contains("application/json")
                || contentType.contains("text/json")
                || text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("{")
                || text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("[")

            guard looksLikeJSON else {
                throw APIError.nonJSONResponse(
                    status: httpResponse.statusCode,
                    preview: String(text.prefix(120))
                )
            }

            do {
                return try decoder.decode(Response.self, from: data)
            } catch {
                throw APIError.decoding(error.localizedDescription)
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
    }

    private func parseError(from data: Data, response: HTTPURLResponse) -> APIError {
        guard !data.isEmpty else {
            return .httpStatus(response.statusCode)
        }

        if
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = object["error"] as? String
        {
            return .serverMessage(message)
        }

        let text = String(data: data, encoding: .utf8) ?? ""
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmed.hasPrefix("<") {
            return .nonJSONResponse(status: response.statusCode, preview: String(trimmed.prefix(120)))
        }

        return .httpStatus(response.statusCode)
    }
}
