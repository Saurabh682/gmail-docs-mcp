# Gmail + Google Docs MCP Server Documentation

Central repository for documentation, specifications, and architecture decisions for the **Gmail + Google Docs MCP Server** located at `groww-weekly-review-pulse/gmail-docs-mcp/`.

---

## Document Registry

| Document | Description | Status |
| :--- | :--- | :--- |
| [mcp-server-problem-statement.md](mcp-server-problem-statement.md) | Original problem statement, tool specs (`send_email`, `append_to_doc`), OAuth scopes, and safety guardrails | Active / Baseline |
| [gmail-docs-mcp-architecture.md](gmail-docs-mcp-architecture.md) | Architectural specification: layers, request flows, auth, policy engine, error model, and test strategy | Active / Approved |
| [deployment-plan.md](deployment-plan.md) | Vercel deployment roadmap: serverless architecture, HTTP/SSE transport, Upstash Redis state, and security | Active / Proposed |

---

## Maintenance Guidelines

1. **All Markdown in `docs/`:** Keep all architecture notes, tool schemas, and setup guides within this `docs/` folder.
2. **Registry Sync:** Update this table as new documents are added or updated.
