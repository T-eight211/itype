"use client"

import { OTPForm } from "@/features/auth/components/otp-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

export default function OTPPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  if (!isLoaded || isSignedIn) {
    return null
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <OTPForm />
      </div>
    </div>
  )
}
