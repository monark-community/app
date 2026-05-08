// Stub for the `server-only` package. In Next.js this module throws
// when imported from a client bundle ; in vitest it doesn't exist at
// all. Providing an empty module lets action tests that transitively
// import server-side code (trusted-device-cookie, supabase/server)
// resolve without crashing.
export {}
