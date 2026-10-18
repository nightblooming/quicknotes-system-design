# QuickNotes System Architecture Specification

This document details the production system architecture for QuickNotes, providing functional and non-functional requirements, empirical capacity and load estimates, high-level structural diagrams, component-level responsibilities, request lifecycle flows, architectural trade-offs, and resilience strategies to eliminate single points of failure (SPOFs).

---

## 1. System Requirements

### 1.1 Functional Requirements
* **Note Lifecycle Management:** Users can create, read, update, list (with pagination), and delete personal notes.
* **Tagging & Categorization:** Users can tag notes with reusable labels and filter notes by tag.
* **Search Capability:** Users can perform keyword search queries across note titles and content.
* **Authentication & Authorization:** Secure, stateless JWT-based authentication ensuring strict data isolation between accounts.
* **Asynchronous Background Processing:** Heavy or non-critical operations (e.g., search index synchronization, audit logging, push notifications) are decoupled from the synchronous HTTP request-response cycle.

### 1.2 Non-Functional Requirements
* **High Availability (HA):** Target uptime of $99.95\%$ ($\le 4.38\text{ hours}$ of unscheduled downtime per year).
* **Low Latency:** 
  * $P_{95}$ read latency $< 50\text{ ms}$ for cached queries; $< 120\text{ ms}$ for cold queries.
  * $P_{95}$ write latency $< 200\text{ ms}$.
* **Data Durability & Consistency:** Zero data loss for committed transactions (RPO $= 0$, RTO $< 60\text{ seconds}$); strong read-your-own-writes consistency for the authoring client.
* **Scalability:** Horizontal scaling across application compute nodes and database read replicas to support sudden traffic surges.
* **Security:** Transport Layer Security (TLS 1.3) in transit, AES-256 encryption at rest, parameterized queries against SQL injection, and strict input boundary validation.

---

## 2. Load & Storage Estimation (1 Million Users)

### 2.1 Assumptions & Baseline Metrics
* **Total Registered Users:** $U_{\text{total}} = 1{,}000{,}000$
* **Daily Active Users (DAU):** $20\%$ of total registered users:
  $$DAU = 1{,}000{,}000 \times 0.20 = 200{,}000\text{ users/day}$$
* **Read-to-Write Ratio:** Approximately $10:1$ (reading lists and notes occurs far more frequently than authoring or updating notes).
* **Daily Activity per Active User:**
  * Average note reads/fetches per user per day: $20\text{ reads}$
  * Average note creations/updates per user per day: $2\text{ writes}$

---

### 2.2 Throughput Estimates (Queries Per Second)

#### Read Throughput:
* **Total Daily Reads:**
  $$\text{Daily Reads} = 200{,}000\text{ DAU} \times 20\text{ reads/user} = 4{,}000{,}000\text{ reads/day}$$
* **Average Reads Per Second ($RPS_{\text{avg}}$):**
  $$RPS_{\text{avg}} = \frac{4{,}000{,}000\text{ reads}}{86{,}400\text{ seconds}} \approx 46.3\text{ reads/sec}$$
* **Peak Reads Per Second ($RPS_{\text{peak}}$):** Assuming a peak multiplier factor of $3.5\times$:
  $$RPS_{\text{peak}} = 46.3 \times 3.5 \approx 162\text{ reads/sec}$$

#### Write Throughput:
* **Total Daily Writes:**
  $$\text{Daily Writes} = 200{,}000\text{ DAU} \times 2\text{ writes/user} = 400{,}000\text{ writes/day}$$
* **Average Writes Per Second ($WPS_{\text{avg}}$):**
  $$WPS_{\text{avg}} = \frac{400{,}000\text{ writes}}{86{,}400\text{ seconds}} \approx 4.63\text{ writes/sec}$$
* **Peak Writes Per Second ($WPS_{\text{peak}}$):** Assuming a peak multiplier factor of $3.5\times$:
  $$WPS_{\text{peak}} = 4.63 \times 3.5 \approx 16.2\text{ writes/sec}$$

---

### 2.3 Storage Capacity Estimates (Per Year)

#### Average Record Size:
* `id` (UUID): $16\text{ bytes}$
* `user_id` (UUID): $16\text{ bytes}$
* `title` (VARCHAR 100, average 40 chars UTF-8): $\approx 40\text{ bytes}$
* `body` (TEXT, average 600 chars UTF-8): $\approx 600\text{ bytes}$
* `is_pinned` (BOOLEAN): $1\text{ byte}$
* `created_at` & `updated_at` (TIMESTAMPTZ): $2 \times 8\text{ bytes} = 16\text{ bytes}$
* Junction table associations (`note_tags`): $\approx 40\text{ bytes}$
* Storage overhead (B-Tree indexes, page headers, row pointers $\approx 30\%$): $\approx 220\text{ bytes}$
* **Total Estimated Footprint per Note:** $S_{\text{note}} \approx 950\text{ bytes} \approx 0.95\text{ KB}$

#### Annual Data Ingestion:
* **New Notes Ingested Annually ($N_{\text{annual}}$):** Assuming each write corresponds to a persistent note creation:
  $$N_{\text{annual}} = 400{,}000\text{ notes/day} \times 365\text{ days} = 146{,}000{,}000\text{ notes/year}$$
* **Annual Raw Storage Required ($S_{\text{annual}}$):**
  $$S_{\text{annual}} = 146{,}000{,}000 \times 0.95\text{ KB} \approx 138{,}700{,}000\text{ KB} \approx 138.7\text{ GB/year}$$
* **Storage with $3\times$ Multi-AZ Replication and WAL/Backups:**
  $$S_{\text{total}} \approx 138.7\text{ GB} \times 3 \approx 416.1\text{ GB/year}$$

---

## 3. Architecture Diagram

```
                              +-----------------------+
                              |      Web / Mobile     |
                              |         Client        |
                              +-----------------------+
                                          |
                                          | 1. DNS Resolution (Anycast)
                                          v
                              +-----------------------+
                              |       Route 53        |
                              |      (Global DNS)     |
                              +-----------------------+
                                          |
                       +------------------+------------------+
                       |                                     |
                       | 2a. Static Assets                   | 2b. API Requests (/v1/*)
                       v                                     v
            +--------------------+                +--------------------+
            |     Cloudflare     |                |  Application Load  |
            |     Edge / CDN     |                |   Balancer (ALB)   |
            +--------------------+                +--------------------+
                                                             |
                                           +-----------------+-----------------+
                                           |                                   |
                                           v                                   v
                                +--------------------+              +--------------------+
                                |    App Server 1    |              |    App Server 2    |
                                |    (Node.js/Go)    |              |    (Node.js/Go)    |
                                +--------------------+              +--------------------+
                                      |         |                         |         |
                  +-------------------+         |                         |         +-------------------+
                  |                             +------------+------------+                             |
                  |                                          |                                          |
                  v                                          v                                          v
      +------------------------+                +------------------------+                 +------------------------+
      |      Redis Cache       |                |      PostgreSQL        |                 |     Message Queue      |
      |   (User Sessions/Notes)|                |     (Primary / DB)     |                 |  (RabbitMQ / AWS SQS)  |
      +------------------------+                +------------------------+                 +------------------------+
                                                             |                                          |
                                              Streaming Sync | WAL Replication                          | Consume Tasks
                                                             v                                          v
                                                +------------------------+                 +------------------------+
                                                |       PostgreSQL       |                 |     Worker Service     |
                                                |     (Read Replica)     |                 | (Search Sync/Indexing) |
                                                +------------------------+                 +------------------------+
```

---

## 4. Component Problem Statements

* **Client (Web/Mobile):** Solves the problem of user interaction by rendering user interfaces and executing client-side state transitions.
* **DNS (Route 53):** Solves the problem of network address resolution by translating human-readable domain names into optimal, geo-routed IP addresses.
* **CDN (Cloudflare):** Solves the problem of geographic network latency and edge caching by serving static frontend assets close to the client.
* **Application Load Balancer (ALB):** Solves the problem of uneven compute load and network ingress by terminating SSL and distributing requests evenly across healthy application instances.
* **App Server 1 & 2:** Solve the problem of application business logic execution, authentication enforcement, and request orchestration.
* **Redis Cache:** Solves the problem of database read pressure and query latency by serving frequently accessed notes and session data from in-memory key-value structures.
* **Primary Database (PostgreSQL Primary):** Solves the problem of authoritative state persistence, transactional integrity, and strong consistency for write operations.
* **Read Replica (PostgreSQL Replica):** Solves the problem of database read saturation by offloading non-blocking query traffic from the primary instance.
* **Message Queue (RabbitMQ / SQS):** Solves the problem of request-processing coupling by buffering intensive background jobs asynchronously.
* **Worker Service:** Solves the problem of executing asynchronous, computationally heavy operations—such as search index synchronization and notifications—without delaying user-facing API responses.

---

## 5. Detailed Step-by-Step Request Flows

### 5.1 Flow: `GET /notes` (Paginated List)

```
Client -> DNS -> CDN/ALB -> App Server -> Cache -> (DB Replica if miss) -> Client
```

1. **Resolution & Ingress:** The client issues `GET /v1/notes?limit=10&page=1` with an `Authorization: Bearer <jwt>` header. DNS directs the request to the ALB, which terminates TLS and forwards the call to an available App Server.
2. **Auth Validation:** The App Server validates the JWT signature and extracts the `user_id`.
3. **Cache Lookup:** The App Server queries the Redis cluster for key `cache:notes:user:{user_id}:page:1`.
4. **Cache Hit Path:** If present, the App Server deserializes the cached JSON payload and directly returns an `HTTP 200 OK` response to the client via the ALB.
5. **Cache Miss Path:** 
   * If the cache key is absent, the App Server routes a parameterized SQL query to the **PostgreSQL Read Replica**:
     ```sql
     SELECT id, title, body, is_pinned, created_at, updated_at 
     FROM notes 
     WHERE user_id = $1 
     ORDER BY is_pinned DESC, updated_at DESC 
     LIMIT 10 OFFSET 0;
     ```
   * The Read Replica returns the query record set.
   * The App Server writes the serialized result into Redis with a Time-To-Live (e.g., $TTL = 300\text{ seconds}$).
6. **Response Delivery:** The App Server serializes the payload and sends `HTTP 200 OK` back through the load balancer to the client.

---

### 5.2 Flow: `POST /notes` (Create Note)

```
Client -> ALB -> App Server -> Primary DB -> Invalidate Cache -> Queue -> Worker -> Client
```

1. **Submission:** The client sends an HTTP `POST /v1/notes` containing `{ "title": "Architecture Review", "body": "...", "tags": ["ops"] }`.
2. **Ingress & Verification:** The ALB routes the request to an App Server; the server verifies the JWT and validates that the `title` is non-empty and does not exceed 100 characters.
3. **Transactional Persistence:** The App Server issues an atomic write transaction to the **PostgreSQL Primary**:
   ```sql
   INSERT INTO notes (user_id, title, body, is_pinned)
   VALUES ($1, $2, $3, $4)
   RETURNING id, title, body, is_pinned, created_at, updated_at;
   ```
4. **Cache Invalidation:** Upon successful database commit, the App Server invalidates user cache keys in Redis matching `cache:notes:user:{user_id}:*` to prevent stale subsequent reads.
5. **Asynchronous Job Dispatch:** The App Server publishes an event payload `{ "event": "NOTE_CREATED", "note_id": "...", "user_id": "..." }` to the **Message Queue**.
6. **HTTP Response:** The App Server returns `HTTP 201 Created` with the newly created note object and a `Location: /v1/notes/{id}` header.
7. **Background Worker Processing:** The **Worker Service** pulls the event from the Message Queue, updates the Elasticsearch/search index asynchronously, and dispatches any relevant system metrics or notifications.

---

## 6. Architectural Trade-offs

### Trade-off 1: Cache-Aside with Invalidation vs. Write-Through Caching
* **Decision:** We implement a **Cache-Aside** strategy combined with explicit eviction on writes, rather than a Write-Through cache.
* **Advantage:** Cache-Aside ensures memory efficiency in Redis. Only notes belonging to active users requesting their list are loaded into memory, avoiding cache pollution from infrequent writers.
* **Trade-off:** The first query following an invalidation incurs a cache miss penalty ($50\text{ ms} - 120\text{ ms}$). Additionally, during replica replication lag, a cache-aside reload from a slightly delayed read replica could theoretically populate stale data if not queried from the primary immediately after a write.

### Trade-off 2: Asynchronous Task Offloading vs. Synchronous Inline Indexing
* **Decision:** Decoupling full-text indexing and external integrations via a **Message Queue and Worker** rather than executing them synchronously within the `POST /notes` request thread.
* **Advantage:** Guarantees sub-$200\text{ ms}$ write latency for the user. If the search indexing cluster or background workers experience degradation, user note creation remains unaffected and reliable.
* **Trade-off:** Introduces **eventual consistency**. Newly authored notes will appear instantly in the user's primary list view (via the primary database/cache refresh), but will not be discoverable in keyword search queries for a window of $100\text{ ms} - 2\text{ seconds}$ until the worker consumes and indexes the queue message.

---

## 7. Elimination of Single Points of Failure (SPOFs)

| Component Layer | Potential Failure Mode | High-Availability Strategy & Redundancy |
| :--- | :--- | :--- |
| **DNS Layer** | DNS outage or route poisoning. | Managed multi-provider Anycast routing (e.g., AWS Route 53 with automated health checks failover). |
| **Ingress / CDN Layer** | Edge node unavailability or DDoS saturation. | Anycast-routed CDN distribution across hundreds of global edge points of presence with automated DDoS mitigation. |
| **Load Balancer** | Hardware instance or network interface failure. | Cloud-native ALB deployed across multiple Availability Zones (Multi-AZ) with redundant, auto-scaling ingress controller IPs. |
| **Compute (App Servers)** | Application process crash, memory leak, or host termination. | Stateless server instances distributed across at least two distinct AZs; monitored by ALB health check probes (`/healthz`) with Auto Scaling Groups automatically replacing unhealthy instances. |
| **Caching Layer** | Redis node failure or memory eviction storm. | Redis deployed as a Multi-AZ cluster with Sentinel or Redis Cluster mode enabled (automatic master failover and active read replicas). |
| **Primary Database** | Primary database hardware crash or corruption. | PostgreSQL configured with synchronous Multi-AZ standby replication; automated failover promotes the secondary replica to primary within $< 60\text{ seconds}$ with zero data loss ($RPO = 0$). |
| **Read Database** | Read replica termination under high query traffic. | Multiple read replicas configured behind an internal connection pooler (e.g., PgBouncer); read traffic automatically reroutes to surviving replicas. |
| **Queue & Workers** | Broker node failure or worker process exhaustion. | Message queue deployed in a multi-node mirrored cluster (or managed AWS SQS with continuous durability across AZs); worker instances scale horizontally based on queue depth metrics. |