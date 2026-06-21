"use client"

import { OTPForm } from "@/features/auth/components/otp-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

// OTP is only valid during an incomplete email sign-up. This page first handles
// already signed-in users; `useOTPVerification()` then validates Clerk's
// current sign-up state before accepting the code.
export default function OTPPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  // Avoid showing the OTP form while Clerk is loading or after sign-in.
  if (!isLoaded || isSignedIn) {
    return null
  }

  // The form verifies the six-digit code sent by Clerk.
  return (
    <div className="flex w-full items-center justify-center px-4 sm:px-6 lg:px-8 pt-4 pb-6 md:pb-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <OTPForm />
      </div>
    </div>
  )
}
