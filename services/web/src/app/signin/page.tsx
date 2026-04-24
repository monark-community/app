import { SignInForm } from "./signin-form"

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-medium">Welcome back</h1>
        <p className="mb-6 text-sm text-text-muted">Sign in to continue to Monark.</p>
        <SignInForm />
        <p className="mt-6 text-center text-xs text-text-muted">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="underline">
            Create one
          </a>
        </p>
      </div>
    </main>
  )
}
