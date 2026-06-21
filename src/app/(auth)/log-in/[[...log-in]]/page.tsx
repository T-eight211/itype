"use client"

import { LoginForm } from "@/features/auth/components/login-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

// Custom login route backed by Clerk. The optional catch-all folder allows
// Clerk/Next nested auth URLs while still rendering this custom form.
export default function LoginPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  // Authenticated users should not see the login form again.
  if (!isLoaded || isSignedIn) {
    return null
  }

  // `LoginForm` calls `useLogin()` for email/password and Google OAuth flows.
  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-4 pb-6 md:pb-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <LoginForm />
      </div>
    </div>
  )
}
