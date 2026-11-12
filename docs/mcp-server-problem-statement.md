# Problem Statement: Gmail + Google Docs MCP Server (built in Antigravity)

> Build a small, secure **MCP (Model Context Protocol) server** that exposes two tools to an AI agent:
> 1. **Send an email** through Gmail.
> 2. **Append content** to an existing Google Doc.
>
> The server is developed and run inside **Antigravity**, and is designed so that agent workflows (such as the Groww Weekly Review Pulse) can use it without handling Google credentials themselves.

**Status:** Draft v1  |  **Transport:** stdio (local)  |  **Auth:** Google OAuth 2.0 (handled inside the server)

---

## 1. Background and Motivation

Agent workflows often need two simple Google actions: notify someone by email, and write results into a shared document. Calling Google APIs directly from every workflow means repeating OAuth setup, token storage, MIME encoding, and error handling, and spreading Google credentials across projects.

An MCP server solves this once. The agent sees two well-described tools; the server owns authentication, validation, safety checks, and the Google API calls. Any MCP-capable client (Antigravity, Claude, others) can then reuse the same server.

### Relationship to the Groww Weekly Review Pulse project
The pulse pipeline (`problemStatement.md`, `architecture.md`, `implementation-plan.md`) requires Docs and Gmail access **via MCP**, with no direct Google API integration in the pipeline itself. This server is a candidate for that role. Note two differences to resolve (see §12):

- The pulse design is **draft-only** (it never sends email). This server's `send_email` tool actually sends, so it needs guardrails and must not be bound into the pulse capability map unless explicitly approved.
- The pulse needs to **create** a Doc and **create a draft**; this server's v1 only **appends** to an existing Doc and **sends**. Those two creation capabilities are listed as future tools.

---

## 2. Goals

- Provide exactly **two MCP tools** in v1: `send_email` and `append_to_doc`.
- Keep Google credentials **inside the server process/host only**; never in prompts, tool arguments, logs, or the repository.
- Request **least-privilege OAuth scopes**.
- Return **structured, predictable results and errors** so agents can recover or report clearly.
- Add **safety guardrails** appropriate for a tool that can send real email (allowlists, limits, dry run).
- Be easy to **register and run in Antigravity** and testable without hitting Google (mockable client).

## 3. Non-Goals (v1)

- Reading, searching, or deleting emails or documents.
- Attachments, inline images, or calendar features.
- Creating new Docs, creating drafts, replacing or editing existing Doc content (see future work).
- Multi-user / multi-tenant hosting, remote (HTTP) deployment, or a hosted OAuth service.
- Bulk mailing or marketing email.
- Handling of non-Google mail or document providers.

---

## 4. Users and Use Cases

| User | Use case |
|---|---|
| **Developer in Antigravity** | Lets an agent email a status summary to themselves or a teammate after a task finishes |
| **Agent workflow (e.g., Groww pulse)** | Appends a weekly note to a running Google Doc and notifies stakeholders |
| **Any MCP client** | Reuses the same two tools without writing Google API code |

Example agent instructions this server must support:
- "Append today's summary to the project log doc, then email me that it's done."
- "Send the weekly note to my alias with the Doc link."

---

## 5. Tool Specifications

Tool names use `snake_case`. All inputs are validated against a JSON Schema (e.g., with Zod or Pydantic) before any network call.

### 5.1 `send_email`

**Purpose:** Send a plain-text or HTML email from the authenticated Gmail account.

**Input**

| Field | Type | Required | Rules |
|---|---|---|---|
| `to` | string[] | Yes | 1-10 valid email addresses; each must pass the recipient policy (§7) |
| `cc` | string[] | No | Same rules; combined recipients (to+cc+bcc) ≤ configured max |
| `bcc` | string[] | No | Same rules |
| `subject` | string | Yes | 1-200 chars; no CR/LF characters (header-injection guard) |
| `body` | string | Yes | 1-50,000 chars |
| `body_format` | `"text"` \| `"html"` | No | Default `text` |
| `reply_to` | string | No | Valid email address |
| `dry_run` | boolean | No | Default from config; when true, validate and build the message but **do not send** |

**Behavior**
- Build a standards-compliant MIME message (UTF-8; RFC 2047 encoding for non-ASCII subjects; `multipart/alternative` when HTML is sent with a text fallback).
- Encode as base64url and send via Gmail API `users.messages.send` as the authenticated user (`me`).
- `From` is always the authenticated account; the tool cannot spoof a sender.

**Success output**
```json
{
  "status": "sent",
  "message_id": "<gmail message id>",
  "thread_id": "<gmail thread id>",
  "recipients": {"to": 1, "cc": 0, "bcc": 0},
  "dry_run": false
}
```
`dry_run: true` returns `"status": "validated_not_sent"` and a size/recipient summary (never the body).

**Error output (examples):** `INVALID_RECIPIENT`, `RECIPIENT_NOT_ALLOWED`, `TOO_MANY_RECIPIENTS`, `INVALID_SUBJECT`, `BODY_TOO_LARGE`, `RATE_LIMITED_LOCAL`, `AUTH_REQUIRED`, `GMAIL_API_ERROR`, `QUOTA_EXCEEDED`.

**MCP annotations:** not read-only, **destructive/side-effecting**, **not idempotent** (retrying can send twice).

### 5.2 `append_to_doc`

**Purpose:** Append text to the **end** of an existing Google Doc.

**Input**

| Field | Type | Required | Rules |
|---|---|---|---|
| `document_id` | string | Yes | Doc ID **or** full Docs URL (server extracts the ID); must match the Doc allowlist if configured (§7) |
| `content` | string | Yes | 1-100,000 chars |
| `format` | `"plain"` \| `"markdown_basic"` | No | Default `plain` (see below) |
| `separator` | `"none"` \| `"newline"` \| `"blank_line"` \| `"horizontal_rule"` | No | Default `blank_line`; inserted before the content so entries are visually separated |
| `heading` | string | No | Optional heading line added before the content (Heading 2 style) |
| `dry_run` | boolean | No | Validate and compute the request without writing |

**Format modes**
- `plain`: inserts text exactly as given.
- `markdown_basic` (v1 stretch goal, may ship in v1.1): converts a small Markdown subset (`#`/`##`/`###` headings, `-`/`*` bullets, `**bold**`, `> quotes`) into Docs formatting via `documents.batchUpdate` requests. Anything unsupported is inserted as plain text, never dropped.

**Behavior**
- Use the Docs API `documents.batchUpdate` with an `insertText` request at the end of the document body (`endOfSegmentLocation`), followed by optional `updateParagraphStyle` / `updateTextStyle` requests for heading or markdown formatting.
- Apply all requests in **one** `batchUpdate` so the append is atomic.
- Never modify or delete existing content.

**Success output**
```json
{
  "status": "appended",
  "document_id": "<id>",
  "document_url": "https://docs.google.com/document/d/<id>/edit",
  "characters_appended": 1234,
  "dry_run": false
}
```

**Error output (examples):** `INVALID_DOCUMENT_ID`, `DOCUMENT_NOT_ALLOWED`, `DOCUMENT_NOT_FOUND`, `PERMISSION_DENIED`, `CONTENT_TOO_LARGE`, `AUTH_REQUIRED`, `DOCS_API_ERROR`, `QUOTA_EXCEEDED`.

**MCP annotations:** not read-only, **non-destructive** (additive), **not idempotent** (retrying appends again).

---

## 6. Authentication and Credentials

- **OAuth 2.0 (Desktop/installed-app flow)** performed by the server on first run (browser consent), with the refresh token stored locally.
- **Scopes (least privilege):**
  - `https://www.googleapis.com/auth/gmail.send` for sending only (no read access to the mailbox).
  - `https://www.googleapis.com/auth/documents` for editing Docs the user can access.
  - Evaluate whether `drive.file` could replace `documents` for a narrower footprint; if not workable, document why.
- **Google Cloud setup (documented in README):** create a project, enable the **Gmail API** and **Google Docs API**, configure the OAuth consent screen, create a Desktop OAuth client, add the developer as a test user.
- **Secrets handling**
  - Client ID/secret and token paths come from environment variables or a local, git-ignored file.
  - Token file is stored with restrictive permissions and **excluded from version control**.
  - Credentials, tokens, and email/doc content are **never** written to logs, tool results, or error messages.
- **Re-auth:** if the token is missing/expired/revoked, tools return `AUTH_REQUIRED` with plain instructions (e.g., run `npm run auth`), and the server does not hang waiting for interactive input during a tool call.

---

## 7. Safety Guardrails

Because `send_email` has real-world side effects and agents can be manipulated by untrusted text (prompt injection), the **server enforces policy itself**, independent of the client:

| Guardrail | Requirement |
|---|---|
| **Recipient allowlist** | Config `ALLOWED_RECIPIENTS` (exact addresses and/or domains). Default: **only the authenticated account's own address**. Anything else returns `RECIPIENT_NOT_ALLOWED`. |
| **Recipient cap** | Max recipients per message (default 5). |
| **Rate limits** | Max N sends per minute and per day (defaults e.g. 5/min, 50/day), tracked locally; exceeding returns `RATE_LIMITED_LOCAL`. |
| **Dry-run default** | Configurable global `DEFAULT_DRY_RUN`; recommended `true` during development. |
| **Header-injection protection** | Reject CR/LF in subject and addresses; build headers via a MIME library, never string concatenation. |
| **Doc allowlist** | Optional `ALLOWED_DOC_IDS`; when set, appends to any other Doc are refused. |
| **Size limits** | Subject, body, and append content limits as in §5. |
| **No content in logs** | Logs record timestamps, tool name, result status, counts, and IDs only. |
| **Client confirmation** | Tool descriptions state clearly that `send_email` sends real mail so MCP clients (like Antigravity) can prompt the human for approval before execution. |

---

## 8. Technical Requirements

- **Protocol:** MCP over **stdio** (local process launched by Antigravity).
- **Language/SDK:** TypeScript with the official MCP TypeScript SDK (default), or Python with the official MCP Python SDK. Pick one and record the choice.
- **Google clients:** official Google API client library for the language, used only inside the server's `google/` module.
- **Validation:** schema validation on every tool input; consistent error shape: `{ "error": { "code": "...", "message": "...", "retryable": true|false } }`.
- **Retries:** exponential backoff (max 3 attempts) for 429/5xx **only for operations safe to retry**. Because sends and appends are not idempotent, retry only when the failure is known to occur before the request reached Google (e.g., connection errors before send, or explicit rate-limit rejections); otherwise return the error and let the caller decide.
- **Timeouts:** per-call timeout (default 20s).
- **Logging:** structured JSON to stderr (never stdout, which carries the MCP stream).
- **Testability:** Google clients injected via an interface so tests use a fake; no network calls in unit tests.
- **Portability:** works on Windows paths and POSIX paths; config via env vars.

---

## 9. Antigravity Integration Requirements

- Provide a documented way to **register the server in Antigravity's MCP configuration** (command, args, env vars for client ID/secret/token path/allowlists). Verify the exact steps against Antigravity's current documentation when implementing.
- Provide an `npm run auth` (or equivalent) command to complete OAuth outside the agent session.
- Provide a **smoke-test prompt** for Antigravity, e.g.:
  1. "Use `append_to_doc` with `dry_run` true on document `<id>`, then run it for real with the text 'MCP test entry'."
  2. "Use `send_email` with `dry_run` true to my own address, then send it."
- Tool names, descriptions, and parameter descriptions must be clear enough for the agent to choose and fill them correctly without extra prompting.

---

## 10. Deliverables

1. Working MCP server exposing `send_email` and `append_to_doc`.
2. Authentication command and token storage (git-ignored).
3. Config template (`.env.example`) documenting every setting, including guardrail defaults.
4. Unit and integration tests (Google clients mocked), plus a manual smoke-test checklist.
5. `README.md` with Google Cloud setup, Antigravity registration, usage examples, safety model, and troubleshooting.
6. Short example prompts for agents (including the Groww pulse use case).

**Suggested layout**
```
gmail-docs-mcp/
├── README.md
├── .env.example
├── .gitignore               # includes tokens, .env
├── src/
│   ├── index.ts             # MCP server bootstrap (stdio)
│   ├── tools/
│   │   ├── sendEmail.ts
│   │   └── appendToDoc.ts
│   ├── google/
│   │   ├── auth.ts          # OAuth flow + token store
│   │   ├── gmail.ts
│   │   └── docs.ts
│   ├── policy/              # allowlists, rate limiter, validators
│   ├── mime.ts              # message builder
│   └── errors.ts
├── scripts/auth.ts
└── tests/
```

---

## 11. Acceptance Criteria

- [ ] Server starts under Antigravity over stdio and lists exactly two tools with clear schemas and descriptions.
- [ ] `send_email` sends a real email from the authenticated account to an allowed recipient; response includes message and thread IDs.
- [ ] `send_email` with `dry_run: true` sends nothing and returns a validation summary.
- [ ] `send_email` rejects non-allowlisted recipients, CR/LF in subject/addresses, oversized bodies, and recipient-cap violations with the documented error codes.
- [ ] Non-ASCII subject and body (e.g., "₹", "★", Devanagari text) arrive intact.
- [ ] `append_to_doc` appends text to the end of an existing Doc, preserving all existing content, in a single atomic request.
- [ ] `append_to_doc` accepts either a Doc ID or a full Docs URL.
- [ ] `append_to_doc` refuses Docs outside `ALLOWED_DOC_IDS` when configured, and returns clear errors for not-found and permission-denied.
- [ ] Rate limits and size limits are enforced server-side.
- [ ] No credentials, tokens, email bodies, or doc content appear in logs or tool outputs.
- [ ] Missing/expired auth yields `AUTH_REQUIRED` with actionable instructions and no hang.
- [ ] OAuth scopes are limited to those documented in §6.
- [ ] All unit tests pass with mocked Google clients; manual smoke test passes with real accounts.
- [ ] README lets a new developer set up Google Cloud, authenticate, and register the server in Antigravity.

---

## 12. Open Questions and Decisions

| # | Question | Default assumed |
|---|---|---|
| 1 | TypeScript or Python? | TypeScript |
| 2 | Is `drive.file` sufficient instead of the broader `documents` scope? | Start with `documents`; revisit |
| 3 | Should `markdown_basic` formatting ship in v1 or v1.1? | v1.1 (plain text first) |
| 4 | Should the server support idempotency keys to prevent duplicate appends/sends on agent retries? | Not in v1; consider a local ledger of recent keys |
| 5 | Allowed recipients beyond the user's own address (team alias, domain)? | Own address only until configured |
| 6 | Use this server for the Groww pulse? If yes, add `create_doc` and `create_draft` tools, and keep `send_email` disabled for the pulse capability map (pulse is draft-only). | Not decided |
| 7 | OAuth consent screen mode: apps in "Testing" status can have short-lived refresh tokens; is a production/internal consent configuration needed for long-running use? | Verify in current Google docs; document the outcome |

---

## 13. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Prompt injection causes the agent to email sensitive data or spam | Server-side recipient allowlist, rate limits, dry-run default, human confirmation in the client |
| Duplicate emails or appended entries from retries | Non-idempotent annotations, restricted retry policy, optional idempotency keys later |
| Credential leakage | Env-only secrets, git-ignored token store, no sensitive logging |
| Refresh token expiry or revocation | `AUTH_REQUIRED` flow, re-auth script, documented consent-screen setup |
| Over-broad OAuth scopes | Least-privilege scopes; evaluate `drive.file` |
| Stdout pollution breaks the MCP stream | All logs to stderr; tests assert stdout contains only protocol messages |
| Large or malformed content breaks Docs requests | Size caps, chunked batch requests, special-character tests |
| API quota exhaustion | Local rate limiter, clear `QUOTA_EXCEEDED` errors |

---

## 14. Future Work (post-v1)

- `create_doc` and `create_draft` tools (needed to serve the Groww pulse pipeline end to end).
- `replace_doc_section` / update-in-place to support idempotent weekly updates.
- Attachments and inline Doc links/tables.
- Idempotency keys and a persistent send/append ledger.
- Optional remote (HTTP) transport with proper authorization.
- Read-only tools (search Docs, list drafts) under separate, opt-in scopes.
