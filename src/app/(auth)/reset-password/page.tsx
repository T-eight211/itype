"use client"

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

export default function ResetPasswordPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  if (!isLoaded || isSignedIn) {
    return null
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <ResetPasswordForm />
      </div>
    </div>
  )
}
