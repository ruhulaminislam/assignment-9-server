# SalonBook — SERVER AUDIT REPORT

**Repository:** `assignment-nine-server`
**Stack:** Node.js · Express 5 · MongoDB (native driver) · Stripe · Better Auth (token issued by client)
**Entry point:** `index.js` (single file, ~556 lines)
**Source of truth:** `../assignment-nine-client/docs/assignment.txt`

Status legend: **COMPLETE** · **PARTIAL** · **MISSING** · **NOT VERIFIED**

---

## 1. Executive Summary

The server is a single-file Express app providing REST endpoints for users, services, appointments, and transactions, plus a Stripe webhook and a session-token verification middleware backed by the Better Auth `session` collection.

Core CRUD and happy-path flows are present and mostly wired to the client. However there are **serious authorization, validation, and security defects**:

1. **CH-02 JWT verification is not implemented.** `verifyToken` does a DB lookup of the opaque Better Auth session token in the `session` collection. It does **not** verify a JWT. The assignment explicitly requires JWT verification middleware (CH-02) and "Verify JWT tokens on the Express backend" (Section 15).
2. **Broken access control on state-changing endpoints:**
   - `PATCH /appointments/status/:id` — only `verifyToken`; any authenticated user (incl. a customer) can set any status on any appointment.
   - `GET /transactions` — only `verifyToken`; returns all customers' transactions.
   - `GET /appointments/customer/:id` — any customer can read any other customer's appointments by changing `:id`.
   - `PATCH /users/update-user/:id` / `/users/update-admin/:id` — `$set: req.body` with no ownership check or field allow-list → a customer can set `role:"admin"`, `isBlocked:false`, or edit another user's profile.
   - `POST /appointments` trusts `req.body.customerId` instead of `req.user.id`.
   - `POST /transactions` has **no auth** at all.
3. **No input validation** anywhere (price > 0, duration > 0, required fields, image required, enum values, date format).
4. **Inactive-service booking is not blocked**; duplicate-slot check exists but is coarse.
5. **Stripe webhook secret missing** from `.env` (only `MONGODB_URI`, `STRIPE_SECRET_KEY`) → signature verification fails for every event unless configured in deployment.
6. **No global error handler, no 404 handler, no rate limiting, permissive CORS.**

---

## 2. API Surface (as implemented)

| Method | Path | Auth (as coded) | Purpose |
|---|---|---|---|
| POST | `/webhook/stripe` | Stripe signature | Handle `checkout.session.completed` |
| GET | `/` | verifyToken + verifyAdmin | health |
| GET | `/users` | verifyToken + verifyAdmin | list users |
| PATCH | `/users/block/:id` | verifyToken + verifyAdmin | block/unblock |
| PATCH | `/users/update-admin/:id` | verifyToken + verifyAdmin | update admin profile |
| PATCH | `/users/update-user/:id` | verifyToken + veryfiuser | update user profile |
| POST | `/services` | verifyToken + verifyAdmin | create service |
| GET | `/services/public` | public | list active (search/filter/sort) |
| GET | `/services` | verifyToken + verifyAdmin | list all services |
| GET | `/services/:id` | public | get one active service |
| DELETE | `/services/delete/:id` | verifyToken + verifyAdmin | delete service |
| PATCH | `/services/status/:id` | verifyToken + verifyAdmin | toggle status |
| PATCH | `/services/update/:id` | verifyToken + verifyAdmin | update service |
| POST | `/appointments` | verifyToken | create appointment |
| GET | `/appointments` | verifyToken + verifyAdmin | list all |
| PATCH | `/appointments/status/:id` | **verifyToken only** | update status |
| GET | `/appointments/customer/:id` | verifyToken + veryfiuser | list by customer id |
| PATCH | `/appointments/cancel/:id` | verifyToken + veryfiuser | cancel own pending |
| POST | `/transactions` | **public** | create transaction from session_id |
| GET | `/transactions` | **verifyToken only** | list all transactions |

---

## 3. Section-by-Section Audit

### 3.1 Technology Stack (Section 2)

| Item | Status | Notes |
|---|---|---|
| Node.js + Express | **COMPLETE** | Express 5 |
| MongoDB | **COMPLETE** | native driver, db `assignment-nine` |
| Mongoose (optional) | **COMPLETE (N/A)** | native driver is acceptable |
| Stripe | **COMPLETE** | checkout session retrieve + webhook constructEvent |
| REST API | **COMPLETE** | REST endpoints |
| JWT | **MISSING / INCORRECT** | No JWT verification anywhere (see 3.2) |
| Better Auth | **PARTIAL** | Server does not integrate Better Auth; only reads the `session` collection written by the **client's** Better Auth. No token issuance or JWT verification on the server. |
| ImgBB | **COMPLETE (N/A server)** | Upload is client-side; server stores URL |

---

### 3.2 Authentication & Authorization (Sections 5, 15)

#### `verifyToken` (index.js:141-164) — **PARTIAL / INCORRECT**

- Reads `Authorization: Bearer <token>`, looks up `session` collection by `token`, then loads `user` by `session.userId`.
- **Problems:**
  1. **No JWT verification.** The token is an opaque Better Auth session token, not a JWT. CH-02 and Section 15 ("Verify JWT tokens on the Express backend") are **not satisfied**.
  2. **No session expiry check.** `session.expiresAt` is ignored — expired sessions are accepted indefinitely.
  3. **No `isBlocked` check.** A blocked user with a valid session token passes and can call every protected endpoint. Violates 5.3 / 7.4.
  4. Two DB round-trips per request (session + user). Acceptable but not ideal.

#### Role middleware

- `veryfiuser` (165-171): `req.user.role !== 'user'` → 401.
- `verifyAdmin` (172-177): `req.user.role !== 'admin'` → 401.
- Correct in isolation, but **not applied to all sensitive routes**.

#### Endpoint-level authorization defects (Critical)

| Endpoint | Line | Problem |
|---|---|---|
| `PATCH /appointments/status/:id` | 352 | Only `verifyToken`. **Any authenticated user can confirm/cancel ANY appointment.** Violates 7.3 / 6.2. **Fix:** add `verifyAdmin` (admin confirms/cancels) and validate `status` ∈ {pending,confirmed,cancelled}; only allow confirm when current status is `pending`. |
| `GET /appointments/customer/:id` | 361 | `veryfiuser` but no `:id === req.user._id` check. Any customer can read any other customer's appointments. Violates 6.2. **Fix:** enforce `id === req.user._id.toString()`. |
| `PATCH /users/update-user/:id` | 225 | `$set: req.body`, no ownership check, no allow-list. A customer can set `role:"admin"`, `isBlocked:false`, or edit another user. Violates 10.2. **Fix:** verify `:id === req.user._id`; allow-list only `name`, `image` (and optionally `phone`). Never allow `role`/`isBlocked`. |
| `PATCH /users/update-admin/:id` | 212 | `$set: req.body`, no allow-list; an admin can change any user's role/blocked status. **Fix:** allow-list `name`, `image` only; prevent editing role/blocked here too. |
| `PATCH /users/block/:id` | 194 | `$set: req.body` — admin can set arbitrary fields incl. `role`. **Fix:** only set `isBlocked: Boolean(req.body.isBlocked)`. |
| `GET /transactions` | 535 | Only `verifyToken` — any customer sees all transactions. **Fix:** add `verifyAdmin`. |
| `POST /transactions` | 433 | **No auth.** Anyone can POST a `session_id`. Verifies with Stripe (good) but is a second, webhook-parallel path to mark paid. **Fix:** require auth + verify the session's `metadata.userId === req.user.id` (or remove entirely and rely solely on the webhook). |
| `POST /appointments` | 322 | Uses `req.body.customerId` (client-supplied) instead of `req.user.id`. A user can impersonate another `customerId`. **Fix:** derive `customerId` from `req.user`. |

---

### 3.3 Services (Section 7.2)

| Item | Status | Notes |
|---|---|---|
| Create service | **PARTIAL** | Inserts `req.body` verbatim (241-245). No validation of `serviceName`, `category`, `price>0`, `duration>0`, `image`, `status` enum. |
| List active (public) | **COMPLETE** | filters `status:"active"` |
| Search by name (CH-01) | **COMPLETE (with caveats)** | Builds `$regex` from `cleaned.split("").join("\\s*")`; works but unusual, does not escape regex metacharacters (ReDoS/injection risk), and can be slow. **Fix:** escape input or use a text index. |
| Filter by category | **COMPLETE (server side)** | exact match; correctness depends on client sending exact stored string (see CLIENT.md category bug) |
| Sort by price (CH-03) | **COMPLETE** | `price-asc`/`price-desc` |
| List all (admin) | **COMPLETE** | `/services` admin-only |
| Get by id | **PARTIAL** | `new ObjectId(id)` with **no `ObjectId.isValid` guard** → invalid id throws → unhandled 500. `res.send(service)` with `null` sends empty body; client's `response.json()` then throws. **Fix:** validate id; `res.status(404)` when not found. |
| Update | **PARTIAL** | `$set: req.body` verbatim; no validation, no allow-list. |
| Delete | **PARTIAL** | No `ObjectId.isValid` guard; hard delete; no check for dependent appointments (orphans). |
| Toggle status | **PARTIAL** | No enum validation; no `ObjectId.isValid` guard. |
| Default status active on create | **MISSING (server)** | Server does not set default; relies on client. If omitted, status is undefined. **Fix:** default `status:"active"` server-side. |

**Missing validation (services):** price positive, duration positive, image required, status enum, required fields — all **MISSING**.

---

### 3.4 Appointments (Section 8)

| Item | Status | Notes |
|---|---|---|
| Create appointment | **PARTIAL** | Sets `status:"pending"`, `paymentStatus:"unpaid"` (good). But: trusts `req.body.customerId`; does **not** verify the service exists; does **not** block inactive services; duplicate check is global per date+slot but ignores service; no date format validation; no ObjectId validation on `customerId`. |
| Prevent duplicate active appointment (same date+slot) | **PARTIAL** | Query at line 331 checks `status ∈ {pending,confirmed}` for same `appointmentDate` + `timeSlot`. Works globally ( salon-wide ) but the requirement is per date+slot — acceptable interpretation, though it also blocks different services at the same time. If per-service uniqueness is intended, add `serviceId` to the query. |
| Prevent booking inactive service | **MISSING** | No check of service `status`. A customer can book an inactive service if they know its id. Violates 8.5. **Fix:** look up service, ensure `status:"active"`. |
| Only customers book (block admin) | **COMPLETE** | Checks `customer.role === "admin"` → 400. |
| List all (admin) | **COMPLETE** | `/appointments` admin-only |
| Update status (admin) | **PARTIAL / SECURITY** | See 3.2 — needs `verifyAdmin` + status/ownership rules. |
| List by customer | **PARTIAL / SECURITY** | No ownership check (3.2). |
| Cancel own pending | **COMPLETE** | `cancel/:id` (384-430) correctly filters `{_id, customerId: req.user._id, status:"pending"}` → sets cancelled; returns 404 if not matched. **This is the one correctly-secured mutation.** |
| Default status/paymentStatus | **COMPLETE** | set server-side |

**Other appointment issues**

- **`POST /appointments` does not validate `appointmentDate`** — accepts any string; downstream date math/formatting may break.
- **No `ObjectId.isValid` on `customerId`** in `POST /appointments` (line 326) — `new ObjectId(custmerId)` throws on bad input → 500.
- **No verification that `serviceId` is valid or active**, and `servicePrice`/`serviceName`/`customerName`/`customerEmail` are taken from the request body and stored — these should be derived from the DB (service + session user), not trusted from the client.

---

### 3.5 Transactions & Payments (Section 9)

#### Webhook `POST /webhook/stripe` (index.js:15-116) — **PARTIAL**

- Correctly: registers before `express.json()` so raw body is available; verifies signature with `STRIPE_WEBHOOK_SECRET`; handles only `checkout.session.completed`; checks `status==="complete" && payment_status==="paid"`; validates `appointmentId` ObjectId; idempotent via `findOne({session_id})`; creates transaction; updates appointment `paymentStatus:"paid"`.
- **Problems:**
  1. **`STRIPE_WEBHOOK_SECRET` is missing from `.env`.** `stripe.webhooks.constructEvent` will throw for every event → 400 "Invalid signature". Payments never get marked paid via webhook. **Critical.** (Must be configured in deployment env; `.env` only has `MONGODB_URI`, `STRIPE_SECRET_KEY`.)
  2. **Transaction schema mismatch with assignment 14.4.** Stored fields are `session_id, appointmentId, status, customer_email, userId, payment_intent, payment_status, amount, currency, paymentDate`. The assignment specifies `stripeSessionId`, `customerId`, `status (paid|failed)`, `createdAt`. `status` here is Stripe's `"complete"` (not `paid`/`failed`), and there is no `createdAt`. This is a schema/enum deviation. **Fix:** store `status: "paid"` (or `"failed"`), add `createdAt`, map `stripeSessionId` (keep `session_id` for compatibility), and store `customerId` (from `metadata.userId`).
  3. Does not verify the `amount`/currency matches the appointment's `servicePrice` (tamper check). Minor.
  4. On idempotent replay it sets appointment paid but does not re-insert; acceptable.

#### `POST /transactions` (index.js:433-533) — **PARTIAL / SECURITY**

- Unauthenticated. Retrieves the Stripe session by `session_id` from the request body, verifies `status`/`payment_status`, checks `metadata.appointmentId`, inserts transaction, updates appointment.
- This duplicates webhook logic and is the path actually used by the client success page (`src/app/success/page.tsx` → `POST /transactions`). It does verify payment with Stripe (so a user cannot fake a paid status without a real Stripe session), which satisfies "never trust the frontend redirect" in spirit. **But**: no auth, no ownership check (anyone with a session id can trigger), and it stores the same non-conformant schema (`session_id`, `status` = Stripe status, no `createdAt`).
- **Fix:** require auth; verify `metadata.userId === req.user.id`; align schema; ideally rely on the webhook as the single source of truth.

#### `GET /transactions` (index.js:535-550) — **PARTIAL / SECURITY**

- Only `verifyToken`. Returns `{ success, message, transactions }` for **all** transactions to **any** authenticated user. **Fix:** add `verifyAdmin`.

#### Payment security rules (9.3)

| Rule | Status | Notes |
|---|---|---|
| Use Stripe Checkout | **COMPLETE** | Checkout sessions created client-side via `src/app/api/checkout_sessions`; server verifies. |
| Verify webhook events | **PARTIAL** | Code verifies signature, but secret missing → fails in practice. |
| Payment status only after verified webhook | **PARTIAL** | Webhook path is correct; but the parallel `POST /transactions` path also sets paid (after Stripe verify). Both are Stripe-verified, so acceptable, but duplicated. |
| Never trust frontend success redirect | **COMPLETE** | Both paths verify with Stripe. |
| Admin cannot manually mark unsuccessful as successful | **COMPLETE** | No admin endpoint to mutate transactions. |

---

### 3.6 Users (Sections 5, 7.4, 10)

| Item | Status | Notes |
|---|---|---|
| List users | **PARTIAL** | `/users` admin-only (good) but returns **raw Better Auth user docs including `passwordHash`** and account fields. **Security:** never return password hashes. **Fix:** project only `_id, name, email, image, role, isBlocked, createdAt`. |
| Block/unblock | **PARTIAL** | `$set: req.body` (mass assignment). Should only set `isBlocked`. Client relies on returned object but server returns Mongo result (see CLIENT.md). |
| Update admin profile | **PARTIAL / SECURITY** | `$set: req.body`, no allow-list, admin can change role/blocked. |
| Update user profile | **PARTIAL / SECURITY** | No ownership check; mass assignment; customer can escalate to admin. |
| Cannot change own role / blocked status | **MISSING** | No allow-list enforcement. |
| Cannot update another user's profile | **MISSING** | No `:id === req.user._id` check. |
| Users collection fields (14.1) | **COMPLETE (managed by Better Auth)** | `name,email,image,role,isBlocked` present on Better Auth user docs. |

---

### 3.7 Database Architecture (Section 14)

| Collection | Status | Notes |
|---|---|---|
| `services` | **PARTIAL** | Fields present but no schema enforcement; `createdAt` only if client sends it; `updatedAt` optional. |
| `appointments` | **PARTIAL** | Stores extra denormalized `serviceName, customerName, customerEmail` (fine) but **not** `serviceImage`/`serviceCategory` (client expects them). `servicePrice` trusted from client. No `updatedAt`. |
| `transactions` | **PARTIAL** | Schema deviates from 14.4 (see 3.5). |
| `user` (Better Auth) | **COMPLETE** | Managed by Better Auth. |
| References between collections | **PARTIAL** | `serviceId`/`customerId`/`appointmentId` stored as strings/ids, but no `ObjectId` typing, no referential integrity, and deletes don't cascade or null out. |

**Note:** Database name `assignment-nine` is hardcoded in both server (`index.js:133`) and client (`lib/auth.ts:6`). Consistent, but should be env-driven.

---

### 3.8 Security & Environment (Section 15)

| Item | Status | Notes |
|---|---|---|
| Secrets in env vars | **PARTIAL** | `MONGODB_URI`, `STRIPE_SECRET_KEY` present. **Missing `STRIPE_WEBHOOK_SECRET`.** No Google/Better Auth secrets server-side (those live on client). |
| `.env` not pushed | **COMPLETE** | `.gitignore` includes `.env` |
| Server-side role verification on protected APIs | **PARTIAL / BROKEN** | Inconsistent (see 3.2). |
| Verify JWT on backend | **MISSING** | Not a JWT flow. |
| Protect user/appointment data from unauthorized access | **MISSING** | Multiple IDOR issues (3.2). |
| Prevent customers modifying others' data | **MISSING** | Appointments/transactions/profiles. |
| Prevent users changing role/blocked | **MISSING** | Mass assignment. |
| CORS | **PARTIAL** | `app.use(cors())` allows all origins. Fine for dev; consider restricting in production. |
| Rate limiting / helmet / input sanitization | **MISSING** | None. |

---

### 3.9 Error Handling, Loading, Notifications (Section 11) — server scope

| Item | Status | Notes |
|---|---|---|
| Global error handler | **MISSING** | No `app.use((err,req,res,next)=>...)`. Unhandled throws (e.g., invalid ObjectId) become default Express 500 HTML. |
| 404 handler | **MISSING** | No catch-all; unknown routes get Express default 404. |
| Try/catch coverage | **PARTIAL** | Only transactions/cancel/appointment-customer routes use try/catch. Most service/user routes do not; DB errors → unhandled. |
| Meaningful error responses | **PARTIAL** | Inconsistent shapes (`{message}` vs `{success,message}` vs raw Mongo result). |
| Async error handling | **PARTIAL** | Express 5 auto-forwards rejected promises, which helps, but without a global handler they still produce generic 500s. |

---

### 3.10 README / Deployment (Sections 16, 17, 18) — server scope

| Item | Status | Notes |
|---|---|---|
| README with required sections | **COMPLETE** | `README.md` includes description, features, stack, links. Verify env var names section lists `STRIPE_WEBHOOK_SECRET`. |
| ≥12 meaningful commits | **COMPLETE** | 14 commits. |
| CORS / 404 / 504 / refresh | **NOT VERIFIED** | Cannot verify live from code. |
| Stripe webhook on live | **NOT VERIFIED / AT RISK** | Depends on `STRIPE_WEBHOOK_SECRET` being set in deployment. |
| Admin credentials for evaluation | **NOT VERIFIED** | No seed/admin-creation script found. Admin must be created manually in DB. |

---

## 4. Client–Server Integration

| Flow | Status | Notes |
|---|---|---|
| Auth token | **PARTIAL** | Client sends Better Auth session token as Bearer; server looks it up in `session` collection. Works only if client and server share the same MongoDB database (`assignment-nine`) — they do. Not a JWT. |
| Services CRUD | **COMPLETE** | Endpoints match client `src/data/services.ts` |
| Appointments create/list/cancel/status | **PARTIAL** | Works, but status endpoint is open to any user (security) and returns raw Mongo results |
| Users list/block/profile | **PARTIAL** | Returns password hashes; mass assignment |
| Transactions | **PARTIAL** | Non-conformant schema; `GET` not admin-gated |
| Stripe webhook | **PARTIAL** | Code correct but secret missing → non-functional out of the box |
| Error shapes | **PARTIAL** | Inconsistent; client branches on `modifiedCount`/`insertedId` from raw Mongo results, which is fragile but currently functional |

---

## 5. Critical & Security Issues (Server)

1. **CH-02 JWT verification missing** — session-token DB lookup is not JWT verification.
2. **IDOR / broken access control** on:
   - `PATCH /appointments/status/:id` (any user → any appointment)
   - `GET /appointments/customer/:id` (any customer → any customer's appointments)
   - `GET /transactions` (any user → all transactions)
   - `PATCH /users/update-user/:id` (no ownership check + mass assignment → privilege escalation to admin)
3. **Mass assignment** (`$set: req.body`) on user block/update endpoints → role/blocked tampering.
4. **`POST /transactions` unauthenticated** and duplicates webhook logic.
5. **`GET /users` leaks `passwordHash`** and other sensitive Better Auth fields.
6. **No validation** on services/appointments (price/duration positivity, required fields, enums).
7. **Inactive services bookable**; duplicate-slot check is coarse and per-date+slot only.
8. **Invalid `ObjectId` handling absent** on most routes → 500s.
9. **Webhook secret missing** → payments never verified via webhook.
10. **No global error/404 handler, no rate limiting, permissive CORS.**

---

## 6. Prioritized Remaining Work (Server)

**P0 — Security (exploitable now)**
- [ ] Add `verifyAdmin` to `PATCH /appointments/status/:id`; enforce status/ownership rules (only pending→confirmed/cancelled by admin).
- [ ] Enforce `GET /appointments/customer/:id` returns only `req.user`'s data.
- [ ] Add `verifyAdmin` to `GET /transactions`.
- [ ] Fix `PATCH /users/update-user/:id` and `/update-admin/:id`: verify ownership (for user route) and use a strict allow-list (`name`, `image`, optionally `phone`); never allow `role`/`isBlocked`.
- [ ] `PATCH /users/block/:id`: set only `isBlocked`.
- [ ] `POST /appointments`: derive `customerId` from `req.user`; validate `serviceId`/`customerId` ObjectIds.
- [ ] `GET /users`: project safe fields; never return `passwordHash`.
- [ ] Require auth + ownership on `POST /transactions` (or remove and rely on webhook).

**P1 — Correctness / requirements**
- [ ] Implement real JWT verification (CH-02) or document the session-token approach and add expiry check + `isBlocked` check in `verifyToken`.
- [ ] Add `isBlocked` check to `verifyToken` → 403 for blocked users.
- [ ] Validate service create/update: `serviceName` required, `category` required, `price > 0`, `duration > 0`, `image` required, `status ∈ {active,inactive}`; default `status:"active"` server-side.
- [ ] Block booking inactive services in `POST /appointments`; verify service exists.
- [ ] Validate `appointmentDate` format and `timeSlot` enum.
- [ ] Add `ObjectId.isValid` guards on all `:id` routes; return 404 for not found.
- [ ] Align `transactions` schema with 14.4 (`status: paid|failed`, `createdAt`, `customerId`, `stripeSessionId`).

**P2 — Robustness**
- [ ] Configure `STRIPE_WEBHOOK_SECRET` in env/deployment.
- [ ] Add global error-handling middleware + 404 handler.
- [ ] Wrap all async route logic in try/catch or a wrapper.
- [ ] Standardize response shapes (`{success, message, data}`).
- [ ] Escape/sanitize the search regex input.
- [ ] Restrict CORS to the client origin in production.
- [ ] Add `updatedAt` maintenance for services/appointments.

**P3 — Verification**
- [ ] Provide an admin-seed script or documented admin creation.
- [ ] Test Stripe webhook end-to-end with the CLI.
- [ ] Verify no secrets in repo; confirm `.env` not deployed.

---

## 7. Status Counts (Server)

| Status | Count |
|---|---|
| COMPLETE | 22 |
| PARTIAL | 27 |
| MISSING | 11 |
| NOT VERIFIED | 4 |

**MISSING (server):**
1. JWT verification (CH-02 / Section 15).
2. Blocked-user enforcement in `verifyToken`.
3. Inactive-service booking prevention.
4. Ownership check on user profile update.
5. Role/blocked mass-assignment protection.
6. Input validation (services, appointments, enums, positivity).
7. Global error handler.
8. 404 handler.
9. Rate limiting / helmet.
10. Server-side default service status.
11. Admin seed / provisioning.

**NOT VERIFIED:**
1. Live deployment CORS/404/504/refresh behavior.
2. Stripe webhook live flow (secret-dependent).
3. Admin credentials for evaluation.
4. Concurrency of duplicate-slot prevention under race conditions.

> Note: Counts are per audited line item in this report and may differ slightly from a re-tally, as some rows bundle multiple sub-checks.