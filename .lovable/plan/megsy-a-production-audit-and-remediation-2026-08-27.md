# Megsy A+ Production Audit and Remediation

## Goal
Stabilize Megsy as a production React application, remove TanStack completely, fix the requested chat/mobile UI issues, and remediate high-confidence security, privacy, performance, accessibility, and SEO issues without changing product behavior unnecessarily.

## Workstreams

### 1. Restore reliable startup and remove TanStack
- Remove all direct TanStack query/start packages, providers, persistence helpers, stubs, aliases, build chunk rules, documentation references, package metadata, and lockfile entries.
- Replace the app-wide query cache usage with a small native cache reset path because no feature currently consumes React Query hooks.
- Preserve the Lovable preview bridge through a non-TanStack package if available; otherwise use a local Vite-compatible bridge implementation so preview startup remains reliable.
- Reinstall dependencies and verify a repository-wide search returns zero `tanstack` / `@tanstack` matches.

### 2. Chat UI and responsive fixes
- Make chat service chips more rectangular by reducing pill radius consistently on mobile and desktop.
- Fix center greeting/content collision when the mobile sidebar is open by constraining/hiding or translating empty-state content with the chat surface and respecting safe viewport bounds.
- Test authenticated chat at phone, tablet, and desktop sizes, including sidebar open/close, light/dark themes, composer, scrolling, loading, and long output rendering.

### 3. Security and privacy hardening
- Review backend policies/functions for ownership checks on conversations, messages, files, workspaces, credits, subscriptions, quotas, roles, and premium access.
- Verify sensitive values are server-authoritative and cannot be changed through local storage, URLs, or request bodies.
- Harden upload validation with server-side allowlists, size limits, safe filenames, and signature/content checks where supported.
- Verify Markdown/AI output sanitization, safe links, prompt/tool permission boundaries, error redaction, and absence of client-exposed secrets.
- Apply only safe schema/policy changes and avoid reading or modifying other users’ data.

### 4. Production quality audit
- Remove confirmed dead/debug code and unused dependencies without broad rewrites.
- Fix high-confidence performance issues such as unnecessary polling, duplicate requests, eager heavy imports, and avoidable rerenders.
- Audit public metadata, canonical/robots/sitemap behavior, private route indexing, headings, alt text, keyboard focus, labels, contrast, and error/loading states.
- Preserve the existing design system while standardizing inconsistent interactive states discovered during testing.

### 5. Verification
- Run focused tests and the production build.
- Test sign-in and critical authenticated flows using only the provided QA account.
- Re-test desktop/mobile, light/dark, sidebar, chat send/response/loading/error behavior, and public routes.
- Check browser console/network/runtime errors and final build diagnostics.
- Run final repository-wide TanStack and secret-pattern scans and report verified results plus any backend limitation that cannot be proven from this workspace.

## Technical notes
- Existing React Router architecture remains unchanged.
- No frontend state will be treated as authoritative for billing, credits, permissions, ownership, or quotas.
- Large AI calls will be minimized during QA; representative presentation checks will favor existing/test-safe content.
