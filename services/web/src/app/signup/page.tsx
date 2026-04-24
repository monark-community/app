import { SignUpForm } from "./signup-form"

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-medium">Create your Monark account</h1>
        <p className="mb-6 text-sm text-text-muted">
          Join the Monark community in under a minute.
        </p>
        <SignUpForm />
        <p className="mt-6 text-center text-xs text-text-muted">
          Already have an account?{" "}
          <a href="/signin" className="underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  )
}
