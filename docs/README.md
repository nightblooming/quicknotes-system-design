# QuickNotes

A fast, lightweight, and secure web application for capturing and managing notes, backed by an enterprise-grade system architecture and REST API specification.

---

## 1. Description

QuickNotes demonstrates both front-end systems engineering and distributed backend architecture design. The project consists of two core components:

1. **Interactive Client**: A zero-dependency, vanilla HTML5, CSS3, and JavaScript client that connects to a REST API. It showcases secure DOM manipulation (enforcing strict XSS prevention through `textContent`), client-side input validation, robust HTTP lifecycle handling, and defensive UI states (loading indicators, error handling, button disabling during requests, and empty states).
2. **System Design & Backend Architecture**: Comprehensive engineering specifications outlining the production backend—including RESTful endpoint contracts, a normalized PostgreSQL data model with indexing strategies, capacity estimation for 1 million registered users, and a resilient, multi-AZ system topology with no single point of failure (SPOF).

---

## 2. How to Run the API Client

The client is built using pure web standards and does not require a build step or external dependencies.

### Prerequisites

* Any modern web browser (Chrome, Firefox, Safari, Edge).
* (Recommended) A simple local HTTP static server.

### Steps to Run

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/your-username/quicknotes.git
   cd quicknotes
   ```

2. **Serve the Static Files:**
   Because the application loads `api.js` using standard module/defer practices, serving files over `http://` is recommended:

   * **Using Python 3:**
     ```bash
     python3 -m http.server 8000
     ```
   * **Using Node.js (`npx`):**
     ```bash
     npx serve .
     ```
   * **Directly via Browser:**
     Alternatively, double-click or open `index.html` directly in your web browser.

3. **Using the Application:**
   * **Fetch Notes:** Click **"Load notes"** to trigger a `GET` request fetching the initial 10 notes. The button will temporarily disable and display a loading notice before populating the feed.
   * **Create a Note:** Enter a title (required, maximum 100 characters) and an optional body in the form, then click **"Create Note"**. Upon submission, a `POST` request is sent, the new note is prepended to the top of the list, and the server response status and ID are displayed.
   * **Delete a Note:** Click the **"Delete"** button beside any note. The application fires a `DELETE` request and purges the note element from the DOM once the server confirms success.

---

## 3. Engineering Documentation

Detailed architectural and database specifications for the QuickNotes backend team can be found in the `docs/` directory:

* [**API Design Specification (`docs/api-design.md`)**](docs/api-design.md): Details the RESTful endpoints, success status codes, request/response JSON contracts for note creation and pagination, and RFC 7807-compliant error payloads (400, 401, 403, 404, 500).
* [**Data Model Specification (`docs/data-model.md`)**](docs/data-model.md): Specifies the schema for `users`, `notes`, `tags`, and `note_tags`, complete with PostgreSQL DDL statements, multi-table `JOIN` queries, composite B-tree indexing strategies, and an evaluation of SQL vs. NoSQL trade-offs.
* [**System Architecture Specification (`docs/architecture.md`)**](docs/architecture.md): Contains functional/non-functional requirements, empirical capacity and storage projections for 1 million users, an end-to-end component diagram, step-by-step request flows for reads and writes, architectural trade-offs, and strategies for eliminating single points of failure.

---

## 4. What I Learned

1. **Defensive DOM Manipulation and XSS Prevention:**
   Relying solely on `textContent` and programmatic element creation (`document.createElement()`) rather than `innerHTML` ensures that untrusted user input—such as note titles or markdown bodies—cannot execute arbitrary scripts in the client context, completely mitigating cross-site scripting (XSS) vulnerabilities.

2. **Synchronizing Network State with UI Elements:**
   Managing async operations cleanly requires orchestrating multiple simultaneous UI states. Wrapping asynchronous operations in `try...catch...finally` blocks guarantees that buttons are disabled during active network requests to prevent duplicate form submissions and race conditions, and that controls are reliably re-enabled even when network errors occur.

3. **Adapting Mock REST Contracts to Real UI Lifecycles:**
   Working with mock endpoints like JSONPlaceholder reinforces the difference between in-memory simulation and persistent data storage. Designing the client to issue real HTTP verbs (`GET`, `POST`, `DELETE`) while managing optimistic or local DOM reconciliation demonstrated how to write production-ready API client code that can transition smoothly to a live backend.

4. **Distributed Systems Planning and Capacity Estimation:**
   Calculating storage consumption and read/write QPS for 1 million users highlighted how access patterns shape infrastructure. Implementing a cache-aside pattern with read replicas addresses read-heavy workloads ($10:1$ read-to-write ratio), while offloading tasks like search indexing to message queues and background workers protects write latencies and decouples critical services.