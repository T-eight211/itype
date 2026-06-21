"use client"

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

// Reset password is reached after the user requests a reset email code from the
// forgot-password page.
export default function ResetPasswordPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  // Signed-in users are returned to the game because this flow is for account
  // recovery before authentication.
  if (!isLoaded || isSignedIn) {
    return null
  }

  // The form submits the reset code and new password to Clerk.
  return (
    <div className="flex w-full items-center justify-center px-4 sm:px-6 lg:px-8 pt-4 pb-6 md:pb-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <ResetPasswordForm />
      </div>
    </div>
  )
}
