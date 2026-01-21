"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { SSOCallbackHandler } from "@/features/auth/components/sso-callback-handler"

function SSOCallbackContent() {
  const searchParams = useSearchParams()
  const flow = searchParams.get("flow")
  const continueSignUp = searchParams.get("continue")

  return <SSOCallbackHandler flow={flow} continueSignUp={continueSignUp} />
}

export default function SSOCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    }>
      <SSOCallbackContent />
    </Suspense>
  )
}
