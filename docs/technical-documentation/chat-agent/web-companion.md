# Web companion

Mounted once in `(authed)/layout.tsx` via `ChatProvider` (like
`GlobalSearchProvider`), so the docked panel persists across navigation. It's a
non-modal right-side `Sheet` (full-screen on mobile) with two screens ;
conversation list → thread ; and inline confirm/reject cards for gated tool
calls. `messages.send` carries an optional page `context` (route + focused
model/record) that's folded into the system prompt so the agent can interpret
"this record".
