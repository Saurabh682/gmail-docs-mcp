# Gmail + Google Docs MCP Server (Antigravity Stdio)

A secure **Model Context Protocol (MCP)** server built for **Antigravity** that exposes two Google tools to AI agents:

1. **`send_email`**: Send plain-text or HTML emails via Gmail API with strict safety guardrails (recipient allowlists, rate limiting, header-injection protection, dry-run mode, and a master live-send switch).
2. **`append_to_doc`**: Append structured content to the end of an existing Google Doc atomically via the Google Docs API with heading styling, separators, and revision conflict retries.

---

## Documentation

Full architectural specifications and requirements are maintained in [`docs/`](docs/README.md):

- [Problem Statement & Specification (`docs/mcp-server-problem-statement.md`)](docs/mcp-server-problem-statement.md)
- [Architecture Specification (`docs/gmail-docs-mcp-architecture.md`)](docs/gmail-docs-mcp-architecture.md)
- [Vercel Deployment Plan (`docs/deployment-plan.md`)](docs/deployment-plan.md)
- [Documentation Index (`docs/README.md`)](docs/README.md)

---

## Directory Structure

```
gmail-docs-mcp/
├── README.md
├── docs/                               # Specifications & architecture docs
│   ├── README.md
│   ├── mcp-server-problem-statement.md
│   └── gmail-docs-mcp-architecture.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts                        # MCP server stdio bootstrap & composition root
│   ├── server.ts                       # McpServer registration & tool definitions
│   ├── errors.ts                       # DomainError taxonomy & error codes
│   ├── logger.ts                       # Stderr JSON logger (stdout reserved for MCP)
│   ├── config/
│   │   └── config.ts                   # Zod-validated environment config & scopes
│   ├── auth/
│   │   ├── AuthManager.ts              # OAuth2 client management & token refresh
│   │   ├── TokenStore.ts               # Secure local token store (FileTokenStore)
│   │   └── loopbackFlow.ts             # Loopback HTTP server for OAuth browser flow
│   ├── state/
│   │   ├── Ledger.ts                   # Sliding-window rate limit ledger
│   │   └── AuditLog.ts                 # JSONL metadata audit trail (no content)
│   ├── policy/
│   │   ├── index.ts                    # PolicyEngine facade
│   │   ├── RecipientPolicy.ts          # Recipient allowlists & cap enforcement
│   │   ├── DocPolicy.ts                # Google Doc allowlist enforcement
│   │   ├── RateLimiter.ts              # Rate limiter facade
│   │   └── validators.ts               # CR/LF injection checks, URL & email validators
│   ├── mime/
│   │   └── buildMessage.ts             # RFC 2822 / RFC 2047 MIME builder & base64url
│   ├── docs/
│   │   └── appendPlan.ts               # Atomic batchUpdate calculation & UTF-16 index math
│   ├── ports/
│   │   ├── GmailPort.ts                # Gmail port interface
│   │   └── DocsPort.ts                 # Docs port interface
│   ├── adapters/
│   │   ├── google/
│   │   │   ├── GoogleGmailAdapter.ts   # Live Gmail API adapter
│   │   │   ├── GoogleDocsAdapter.ts    # Live Google Docs API adapter
│   │   │   └── errorMap.ts             # Google error mapping to DomainError
│   │   └── fake/
│   │       ├── FakeGmail.ts            # Test mock for Gmail
│   │       └── FakeDocs.ts             # Test mock for Docs
│   ├── services/
│   │   ├── EmailService.ts             # Email business logic & dry-run gating
│   │   └── DocService.ts               # Doc append business logic & concurrency retry
│   └── tools/
│       ├── sendEmail.ts                # send_email tool definition & handler
│       ├── appendToDoc.ts              # append_to_doc tool definition & handler
│       └── result.ts                   # Standardized MCP result envelopes
├── scripts/
│   └── auth.ts                         # Standalone OAuth CLI (npm run auth)
└── tests/
    ├── unit/                           # Pure unit tests (validators, policy, mime, errors)
    └── contract/                       # In-memory MCP client/server & stdio process tests
```

---

## Safety & Security Model

- **Zero Secret Exposure:** Google credentials and tokens remain strictly on the host and inside the server process. They are never output in tool responses, prompts, or logs.
- **Recipient Allowlist (`GDM_ALLOWED_RECIPIENTS`):** By default (empty), emails can only be sent to the authenticated account's own address. Wildcard domains like `@company.com` can be configured.
- **Master Live-Send Switch (`GDM_ALLOW_LIVE_SEND`):** Defaults to `false`. When `false`, calling `send_email` with `dry_run: false` is blocked by policy (`LIVE_SEND_DISABLED`).
- **Dry Run Support:** Both tools support `dry_run: true` to validate schemas, recipient allowlists, rate limits, and batchUpdate plans before performing any mutation.
- **Header Injection Guard:** CR (`\r`) and LF (`\n`) characters in subjects and addresses are strictly rejected.
- **Reserved Stdout:** All structured logging goes to `stderr`. `stdout` is strictly reserved for the MCP JSON-RPC protocol.

---

## Setup & Quickstart

### 1. Install Dependencies & Build

```bash
cd gmail-docs-mcp
npm install
npm run build
```

### 2. Configure Credentials

Place your Google Cloud Console Desktop OAuth client JSON (`client_secret_*.json`) in the project root directory, or configure `.env`:

```bash
cp .env.example .env
```

Ensure the following Google Cloud APIs are enabled in your Google Cloud Project:
- **Gmail API**
- **Google Docs API**

### 3. Complete One-Time Authorization

Run the loopback authorization CLI:

```bash
npm run auth
```

This will launch your browser for Google consent. Upon granting consent, your tokens will be saved to `token.json` (or the configured OS state directory).

To check the authorization status:
```bash
npm run auth:status
```

To revoke or remove local tokens:
```bash
npm run auth:revoke
```

---

## Antigravity Registration

### Mode A: Local Process (stdio)
Add this to your local MCP client configuration:

```json
{
  "mcpServers": {
    "gmail-docs": {
      "command": "node",
      "args": ["D:/VibeCode/Applied Generative AI Bootcamp/gmail-docs-mcp/dist/index.js"],
      "env": {
        "GDM_GOOGLE_CLIENT_ID": "<your-client-id>",
        "GDM_GOOGLE_CLIENT_SECRET": "<your-client-secret>",
        "GDM_TOKEN_PATH": "D:/VibeCode/Applied Generative AI Bootcamp/gmail-docs-mcp/token.json",
        "GDM_ALLOWED_RECIPIENTS": "",
        "GDM_DEFAULT_DRY_RUN": "true",
        "GDM_ALLOW_LIVE_SEND": "false"
      }
    }
  }
}
```

### Mode B: Hosted on Vercel (Streamable HTTP / SSE)
Deploy with the Vercel CLI:

```bash
# 1. Authorize locally once to obtain your refresh token
npm run auth

# 2. Deploy to Vercel
vercel --prod
```

Configure these environment variables in the Vercel Project Dashboard:
- `GDM_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
- `GDM_GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
- `GDM_GOOGLE_REFRESH_TOKEN`: The `refresh_token` from your `token.json`
- `GDM_ACCOUNT_EMAIL`: The authenticated account email address
- `GDM_SERVER_API_KEY`: A secure secret string required in `Authorization: Bearer <key>`
- `GDM_DEFAULT_DRY_RUN`: `true`
- `GDM_ALLOW_LIVE_SEND`: `false` (or `true` when ready)
- *(Optional)* `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: For distributed multi-lambda rate limiting

Then register the remote URL in your MCP client:

```json
{
  "mcpServers": {
    "gmail-docs-vercel": {
      "url": "https://your-mcp-app.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_GDM_SERVER_API_KEY>"
      }
    }
  }
}
```

---

## Smoke-Test Prompts for Agents

Once registered in Antigravity, you can test the tools with these prompts:

1. **Test Google Docs Dry Run:**
   > "Call `append_to_doc` with `dry_run: true` on `<Google Doc URL>` with content 'Test entry'."
2. **Test Google Docs Live Append:**
   > "Call `append_to_doc` with `dry_run: false` on `<Google Doc URL>` with heading 'Weekly Update' and content 'Progress update for the week'."
3. **Test Email Dry Run:**
   > "Call `send_email` with `dry_run: true` to my own email address with subject 'MCP Test' and body 'Hello from Antigravity'."
4. **Test Live Email Delivery:**
   > *(Ensure `GDM_ALLOW_LIVE_SEND=true` is set)*
   > "Send an email to my email address with subject 'Antigravity Live Test' and body 'This is a live test email'."
5. **Test Allowlist Rejection:**
   > "Send an email to unapproved@externaldomain.com" → verifies `RECIPIENT_NOT_ALLOWED`.

---

## Running Tests

Execute the Vitest test suite:

```bash
npm test
```

All 46 unit and contract tests run with fully mocked Google adapters without performing any external network calls.
