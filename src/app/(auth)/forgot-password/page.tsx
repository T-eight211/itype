"use client"

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

// Forgot password is a client page because it reads Clerk's live authentication
// state. Signed-in users are redirected away from recovery screens.
export default function ForgotPasswordPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  // Hide the page while Clerk is loading, or while a signed-in user is being
  // redirected back to the main game route.
  if (!isLoaded || isSignedIn) {
    return null
  }

  // The form starts Clerk's reset-password email-code flow.
  return (
    <div className="flex w-full items-center justify-center px-4 sm:px-6 lg:px-8 pt-4 pb-6 md:pb-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <ForgotPasswordForm />
      </div>
    </div>
  )
}
