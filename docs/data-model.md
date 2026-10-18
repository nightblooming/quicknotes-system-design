# QuickNotes Data Model Specification

This document defines the relational database architecture for the QuickNotes service, including schema definitions, table relationships, indexing strategies, example queries, and the architectural rationale for choosing a relational (SQL) database engine.

---

## 1. Entity Specifications

### 1.1 `users`
Represents registered user accounts on the platform.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique user identifier. |
| `email` | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` | User login email address. |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | Argon2id / bcrypt salted password hash. |
| `display_name` | `VARCHAR(100)` | `NOT NULL` | User profile handle or display name. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Account creation timestamp in UTC. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Last account modification timestamp. |

---

### 1.2 `notes`
Represents individual text notes authored by users.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique note identifier. |
| `user_id` | `UUID` | `NOT NULL`, `FOREIGN KEY REFERENCES users(id)` | Author account identifier. |
| `title` | `VARCHAR(100)` | `NOT NULL` | Note header (enforced max 100 characters). |
| `body` | `TEXT` | `NULL` | Optional freeform text content. |
| `is_pinned` | `BOOLEAN` | `NOT NULL`, `DEFAULT FALSE` | Flag pinning note to the top of list views. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Last modification timestamp. |

---

### 1.3 `tags`
Represents reusable categorization labels.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique tag identifier. |
| `name` | `VARCHAR(50)` | `NOT NULL`, `UNIQUE` | Normalized lowercase tag identifier (e.g., `work`). |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp. |

---

### 1.4 `note_tags` (Junction Table)
Associates notes with tags in a many-to-many relationship.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `note_id` | `UUID` | `NOT NULL`, `FOREIGN KEY REFERENCES notes(id)` | Identifier of the tagged note. |
| `tag_id` | `UUID` | `NOT NULL`, `FOREIGN KEY REFERENCES tags(id)` | Identifier of the applied tag. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | Association timestamp. |

* **Primary Key:** Composite key `(note_id, tag_id)`.

---

## 2. Entity Relationships

```
+------------+          1:N          +------------+          M:N          +------------+
|   users    | --------------------> |   notes    | <===================> |    tags    |
+------------+                       +------------+      (note_tags)      +------------+
```

### 2.1 One-to-Many ($1:N$): `users` $\rightarrow$ `notes`
* A user can author zero, one, or many notes.
* Every note is strictly owned by exactly one user through the foreign key `notes.user_id`.
* **Referential Action:** `ON DELETE CASCADE`. If a user deletes their account, all associated notes are purged automatically to comply with data privacy policies and prevent orphaned records.

### 2.2 Many-to-Many ($M:N$): `notes` $\leftrightarrow$ `tags` via `note_tags`
* A note can have zero, one, or multiple tags assigned to it.
* A tag can be attached to zero, one, or multiple notes across different accounts.
* The junction table `note_tags` resolves the many-to-many relationship into two one-to-many relationships:
  * `notes` $(1) \rightarrow (N)$ `note_tags` (`ON DELETE CASCADE` ensures tag associations are removed when a note is deleted).
  * `tags` $(1) \rightarrow (N)$ `note_tags` (`ON DELETE RESTRICT` or `CASCADE` prevents invalid dangling associations).

---

## 3. SQL DDL Statements (`CREATE TABLE`)

```sql
-- Enable UUID generation extension if using PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Notes Table
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(100) NOT NULL,
    body TEXT,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notes_user
        FOREIGN KEY (user_id) 
        REFERENCES users (id) 
        ON DELETE CASCADE,
    CONSTRAINT chk_title_not_empty 
        CHECK (char_length(trim(title)) > 0)
);

-- 3. Tags Table
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_tag_name_lowercase 
        CHECK (name = lower(name))
);

-- 4. Note Tags (Junction Table)
CREATE TABLE note_tags (
    note_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, tag_id),
    CONSTRAINT fk_note_tags_note
        FOREIGN KEY (note_id) 
        REFERENCES notes (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_note_tags_tag
        FOREIGN KEY (tag_id) 
        REFERENCES tags (id) 
        ON DELETE CASCADE
);
```

---

## 4. Indexing Strategy

```sql
-- Composite index for paginated note listings by user
CREATE INDEX idx_notes_user_updated_desc 
ON notes (user_id, is_pinned DESC, updated_at DESC);

-- Index for reverse lookup in junction table
CREATE INDEX idx_note_tags_tag_id 
ON note_tags (tag_id);
```

### Technical Rationale for Indexes:
1. **`idx_notes_user_updated_desc` on `notes(user_id, is_pinned DESC, updated_at DESC)`:**
   The dominant read access pattern is querying a user's notes sorted by priority (pinned first) and freshness (`updated_at DESC`) with a pagination limit (e.g., `LIMIT 10`). Without this composite index, PostgreSQL must perform an expensive index scan on `user_id` followed by a costly in-memory sort ($O(N \log N)$). With this compound B-tree index, the database satisfies the filter and sort order directly from the index in $O(\log K)$ time.
2. **`idx_note_tags_tag_id` on `note_tags(tag_id)`:**
   The composite primary key `(note_id, tag_id)` automatically indexes lookups filtering by `note_id` first. However, queries filtering notes by a specific tag (e.g., "Find all notes tagged 'work'") filter by `tag_id`. An index leading with `tag_id` allows instant index scans for tag-based filtering.

---

## 5. Example Queries

### Query 1: Paginated User Notes with Aggregated Tags (Multi-table `JOIN`)
Retrieves the most recent 10 notes for a specific user, joining tags and formatting them as a JSON array.

```sql
SELECT 
    n.id,
    n.title,
    n.body,
    n.is_pinned,
    n.created_at,
    n.updated_at,
    COALESCE(
        json_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), 
        '[]'::json
    ) AS tags
FROM notes n
LEFT JOIN note_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
WHERE n.user_id = '58a101f3-2dbe-4416-831e-450f39ef4cb2'
GROUP BY n.id
ORDER BY n.is_pinned DESC, n.updated_at DESC
LIMIT 10 OFFSET 0;
```

---

### Query 2: Insert a New Note
Inserts a new note with server-enforced timestamps and returns the generated UUID.

```sql
INSERT INTO notes (user_id, title, body, is_pinned)
VALUES (
    '58a101f3-2dbe-4416-831e-450f39ef4cb2',
    'Sprint Planning Checklist',
    'Review outstanding tickets, refine backlog items, assign owners.',
    FALSE
)
RETURNING id, title, body, is_pinned, created_at, updated_at;
```

---

### Query 3: Filter User Notes by Tag Name (`JOIN`)
Fetches all notes owned by an authenticated user that have the tag `'architecture'`.

```sql
SELECT 
    n.id,
    n.title,
    n.body,
    n.updated_at
FROM notes n
JOIN note_tags nt ON n.id = nt.note_id
JOIN tags t ON nt.tag_id = t.id
WHERE n.user_id = '58a101f3-2dbe-4416-831e-450f39ef4cb2'
  AND t.name = 'architecture'
ORDER BY n.updated_at DESC;
```

---

## 6. Architecture Decision: SQL vs. NoSQL

QuickNotes selects a relational database (**PostgreSQL**) over a NoSQL document store (such as MongoDB or DynamoDB). QuickNotes features deeply relational data: notes belong to users, and tags form an arbitrary many-to-many relationship with notes. In a document store, tags and notes would either require data denormalization—introducing eventual consistency hazards, duplicate storage, and complex atomic multikey mutations—or client-side manual joins. PostgreSQL offers native ACID guarantees, strict schema validation (enforcing character constraints and non-null semantics at the database engine layer), and performant relational joins. Furthermore, PostgreSQL provides built-in `jsonb` support and native Full-Text Search (FTS) via `tsvector` and `tsquery`, allowing the application to deliver search capabilities and tag aggregations without adding secondary search clusters or compromising relational integrity.