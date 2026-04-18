# Phase 2 Plan — Tennis App Evolution

**Status:** Planning only — no implementation in this document.

This plan describes moving from a **personal, local stats keeper** toward a **social + memory-aware tennis app**, in stages so architecture stays simple and scalable.

---

## Executive summary

| Today | Target for this phase |
|--------|------------------------|
| Local personal tracker | User accounts + cloud-backed data |
| Single-user mindset | Multi-user foundation |
| Device-only data | Canonical cloud source of truth |

The next phase is **not only login** — it is turning the app into a **cloud-backed product** with identity, durable history, and room for sharing, memories, and notifications later.

---

## 1. Current app state

### What exists today

- Personal match logging
- Score and stat recording
- Remarks / notes
- Local-only usage mindset

### Limitations this creates

- No login across devices
- Weak backup / recovery story
- Hard to share with friends
- Social features blocked
- Memory-style notifications harder later

**Conclusion:** Build a **backend foundation** in this phase.

---

## 2. What this phase should introduce

### A. Authentication / login

- Sign up / login
- Persistent user profile
- Stable **unique user ID**
- Later (optional): username, display name, profile picture

**Anchor:** User ID ties together matches, friendships, sharing, memories, and notifications in later phases.

### B. Cloud database connection

Move **core app data** off “fully local-only” into a **cloud database**.

**Store (structured):**

- Users
- Matches
- Participants
- Scores
- Dates
- Remarks
- (Later) friend relationships
- (Later) memory / share metadata

**Media / heavy payloads:**

- Structured app data → cloud
- Heavy media → handle deliberately; **do not** blindly store large originals forever

**Why:** One **canonical source of truth** simplifies sharing and sync.

### C. Cloud-first raw data; app-computed stats

| Backend stores | Client computes (e.g. on device) |
|----------------|----------------------------------|
| Raw match history | Win ratio, head-to-head, bagels, streaks, trends |

**Raw examples:** who played, when, set scores, winner/loser, remarks, optional image **metadata** (not necessarily full blobs).

**Principle:** Simpler backend early; avoid heavy server-side analytics until needed.

---

## 3. Why cloud-first is the right next step

**Benefits:**

- Easier sharing later
- Multi-device sync
- Recovery when changing phones
- Friend-based features
- Memory generation from history
- Push notification workflows later

**Priority for now:** Cloud-backed **structured** data + **simple client-side** analytics from raw matches.

---

## 4. Architecture mindset

### Client (mobile app)

- UI / UX
- Local cache
- Fetch / save match data
- Stats from raw matches
- Timelines and match history
- Later: local memory **candidates**

### Backend

- Auth
- Canonical storage: users, matches
- Permission / ownership rules
- Later: friendships, share records, push support

### Platform shape (early stage)

A full custom server may not be required immediately. A stack with **database + auth + serverless functions** is likely enough for this phase.

---

## 5. Data model direction (this phase)

Minimum direction for entities:

### Users

Each account / identity in the app.

### Matches

- Date
- Owner / creator
- Score summary
- Optional remarks
- `created_at` / `updated_at`

### Match participants

Separate from match header where useful so matches are not hardcoded to one user forever — supports multiplayer / social later.

### Sets / score details

Structured set-by-set storage separate from match header if needed.

### Optional media metadata

References / metadata for photos later — not necessarily full image storage in v1.

**Future-enabled by this shape:** user vs user history, shared matches, rivalry tracking, memory generation.

---

## 6. Social phase (after backend foundation)

**Prerequisites:** Login + cloud data stable.

**Then add:**

- Friend system
- User search / add friend
- Shared match records
- Head-to-head between users
- Share a past match or memory with another user

**Product shift:** From private tracker → **tennis history and rivalry app**.

---

## 7. Memory feature phase (after social-ready data)

**Do not start with LLMs** for triggering.

### Phase 7a — Rule-based memories (deterministic, cheap)

Examples:

- Match anniversary (e.g. exactly one year ago)
- First win vs a friend
- First bagel vs a friend
- Longest streak started on this match
- Win ratio shift over a time window
- No match with this friend in X months

### Phase 7b — Optional LLM (presentation only)

Use LLM only for:

- Nice captions
- Short “why this matters” summaries
- Playful share copy

**Architecture principle:**

- **Rules** decide *whether* a memory exists and *when*.
- **LLM** (optional) decides *how* to phrase it.

Memory triggering stays **reliable and cheap**, not dependent on an LLM.

---

## 8. Notification strategy (design now, build incrementally)

| Type | Examples | Typical driver |
|------|-----------|----------------|
| Local / personal | Based on one user’s data | Can be device-generated in some cases |
| Server / social | Sharing, friend actions, invites, cross-user memories | Backend + push for reliability |

Design for **both** paths even if full notification logic is not built in this phase.

---

## 9. Recommended implementation order

1. **Authentication** and user accounts  
2. **Connect** app to cloud database  
3. **Persist** raw match data in cloud  
4. **Refactor** stats to derive from cloud-backed raw data  
5. **Schema** ready for multi-user / shared match relationships (without overbuilding UI)  
6. **Friend graph** / social relationships  
7. **Rule-based** memory generation  
8. **Optional** LLM captions / summaries for memory cards and sharing  

Each step should build on the previous one and avoid overengineering.

---

## 10. Key principles for development

- Treat **users** as first-class entities.
- Treat **matches** as reusable structured records.
- Prefer **participant-based** modeling over single-user assumptions.
- Keep paths open for **sharing**, **memory from history**, and an **optional LLM presentation layer** — without implementing those features before their phase.

---

## Document control

| Item | Value |
|------|--------|
| Purpose | Phase 2 planning reference |
| Implementation | Out of scope until tasks are picked from sections 9+ |
