"use client"

import { OTPForm } from "@/features/auth/components/otp-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

export default function OTPPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  if (!isLoaded || isSignedIn) {
    return null
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center px-4 sm:px-6 lg:px-8 pt-20 md:pt-30 pb-6 md:pb-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <OTPForm />
      </div>
    </div>
  )
}
