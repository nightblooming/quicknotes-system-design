# QuickNotes API Design Specification

This document specifies the RESTful API design for the QuickNotes production backend service. It serves as the single source of truth for backend engineering and client-side integration.

---

## 1. Global Conventions

- **Base URL:** `https://api.quicknotes.app/v1`
- **Data Format:** `application/json` (UTF-8 encoding)
- **Authentication:** Bearer token via the HTTP standard header: `Authorization: Bearer <jwt_token>`
- **Timestamps:** ISO 8601 extended format in UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`)

---

## 2. Endpoints Overview

The table below outlines the core RESTful endpoints provided by the QuickNotes API.

| HTTP Method | Path | Description | Success Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/notes` | Retrieve a paginated list of notes owned by the authenticated user. Supports filtering and limit/cursor query params. | `200 OK` |
| `POST` | `/notes` | Create a new note under the authenticated user's account. | `201 Created` |
| `GET` | `/notes/{id}` | Retrieve details of an individual note by its unique identifier. | `200 OK` |
| `PUT` | `/notes/{id}` | Replace all editable attributes of an existing note (full update). | `200 OK` |
| `PATCH` | `/notes/{id}` | Partially update specific fields (e.g. `title`, `body`, or `is_pinned`) of an existing note. | `200 OK` |
| `DELETE` | `/notes/{id}` | Permanently remove an existing note by its unique identifier. | `204 No Content` |
| `GET` | `/notes/search` | Full-text keyword search across notes owned by the authenticated user. | `200 OK` |

---

## 3. Request & Response Examples

### 3.1. Create a Note (`POST /notes`)

#### Request
- **Headers:**
  ```http
  POST /v1/notes HTTP/1.1
  Host: api.quicknotes.app
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6...
  Content-Type: application/json
  Accept: application/json
  ```
- **Body:**
  ```json
  {
    "title": "System Architecture Review",
    "body": "Meeting notes discussing migration to event-driven microservices and database sharding strategy.",
    "tags": ["architecture", "engineering", "q4-planning"],
    "is_pinned": false
  }
  ```

#### Response
- **Status:** `201 Created`
- **Headers:**
  ```http
  Location: /v1/notes/note_9df8a3c2-11e4-4a27-a065-27a90b411ec5
  Content-Type: application/json; charset=utf-8
  ```
- **Body:**
  ```json
  {
    "id": "note_9df8a3c2-11e4-4a27-a065-27a90b411ec5",
    "user_id": "usr_58a101f3-2dbe-4416-831e-450f39ef4cb2",
    "title": "System Architecture Review",
    "body": "Meeting notes discussing migration to event-driven microservices and database sharding strategy.",
    "tags": ["architecture", "engineering", "q4-planning"],
    "is_pinned": false,
    "created_at": "2026-10-18T17:15:00.000Z",
    "updated_at": "2026-10-18T17:15:00.000Z"
  }
  ```

---

### 3.2. List Notes (`GET /notes`)

#### Request
- **Headers:**
  ```http
  GET /v1/notes?limit=2&page=1&sort=updated_at:desc HTTP/1.1
  Host: api.quicknotes.app
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6...
  Accept: application/json
  ```

#### Response
- **Status:** `200 OK`
- **Headers:**
  ```http
  Content-Type: application/json; charset=utf-8
  ```
- **Body:**
  ```json
  {
    "data": [
      {
        "id": "note_9df8a3c2-11e4-4a27-a065-27a90b411ec5",
        "user_id": "usr_58a101f3-2dbe-4416-831e-450f39ef4cb2",
        "title": "System Architecture Review",
        "body": "Meeting notes discussing migration to event-driven microservices and database sharding strategy.",
        "tags": ["architecture", "engineering", "q4-planning"],
        "is_pinned": false,
        "created_at": "2026-10-18T17:15:00.000Z",
        "updated_at": "2026-10-18T17:15:00.000Z"
      },
      {
        "id": "note_3ca119e7-44bc-4456-993d-d5a2d7168019",
        "user_id": "usr_58a101f3-2dbe-4416-831e-450f39ef4cb2",
        "title": "Grocery Checklist",
        "body": "Oat milk, sourdough bread, dark roast coffee beans.",
        "tags": ["personal"],
        "is_pinned": true,
        "created_at": "2026-10-17T09:20:00.000Z",
        "updated_at": "2026-10-18T08:10:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 2,
      "total_records": 48,
      "total_pages": 24,
      "has_next_page": true,
      "has_previous_page": false
    }
  }
  ```

---

## 4. Error Handling & HTTP Status Codes

QuickNotes follows RFC 7807 (Problem Details for HTTP APIs) principles for consistent machine- and human-readable error responses.

### 4.1. Supported Error Codes

| Status Code | Description | Scenario / Trigger |
| :--- | :--- | :--- |
| `400 Bad Request` | Malformed syntax or schema validation error. | Missing required field `title`, `title` exceeding 100 characters, invalid JSON, or invalid query parameters. |
| `401 Unauthorized` | Missing or invalid credentials. | Expired token, malformed authorization header, or missing Bearer token. |
| `403 Forbidden` | Authenticated user lacks permission. | User attempts to update or delete a note belonging to another account. |
| `404 Not Found` | Target resource does not exist. | Note ID requested via `/notes/{id}` does not exist or has been permanently deleted. |
| `500 Internal Server Error` | Unexpected server condition. | Unhandled backend exception, database timeout, or upstream infrastructure outage. |

---

### 4.2. Standard Error Response Body

Every error response returns a consistent JSON schema containing machine-readable error codes and specific validation details when applicable.

#### Example: `400 Bad Request` (Validation Failure)
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The payload failed schema validation.",
    "status": 400,
    "timestamp": "2026-10-18T17:20:00.000Z",
    "details": [
      {
        "field": "title",
        "issue": "Title is required and cannot be empty."
      },
      {
        "field": "title",
        "issue": "Title exceeds maximum length of 100 characters."
      }
    ]
  }
}
```

#### Example: `401 Unauthorized`
```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Bearer token is expired or invalid. Please authenticate again.",
    "status": 401,
    "timestamp": "2026-10-18T17:20:00.000Z"
  }
}
```

#### Example: `403 Forbidden`
```json
{
  "error": {
    "code": "ACCESS_DENIED",
    "message": "You do not have permission to modify or delete this resource.",
    "status": 403,
    "timestamp": "2026-10-18T17:20:00.000Z"
  }
}
```

#### Example: `404 Not Found`
```json
{
  "error": {
    "code": "NOTE_NOT_FOUND",
    "message": "No note exists with ID 'note_9df8a3c2-11e4-4a27-a065-27a90b411ec5'.",
    "status": 404,
    "timestamp": "2026-10-18T17:20:00.000Z"
  }
}
```

#### Example: `500 Internal Server Error`
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred while processing your request. Please try again later.",
    "status": 500,
    "timestamp": "2026-10-18T17:20:00.000Z"
  }
}
```