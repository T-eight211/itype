"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { SSOCallbackHandler } from "@/features/auth/components/sso-callback-handler"

// Reads OAuth callback query parameters. `flow` records whether Google was
// started from login or sign-up, while `continue` is used when Clerk transfers
// between sign-in and sign-up during OAuth.
function SSOCallbackContent() {
  const searchParams = useSearchParams()
  const flow = searchParams.get("flow")
  const continueSignUp = searchParams.get("continue")

  return <SSOCallbackHandler flow={flow} continueSignUp={continueSignUp} />
}

export default function SSOCallbackPage() {
  return (
    // Suspense is needed because `useSearchParams()` is a client-side hook in
    // this route. The fallback is shown while the callback page hydrates.
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center pt-20 md:pt-30">
        <div className="text-center">
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    }>
      <SSOCallbackContent />
    </Suspense>
  )
}
