"use client"

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"
import { useSSOCallback } from "../hooks/use-sso-callback"

interface SSOCallbackHandlerProps {
  flow: string | null
  continueSignUp: string | null
}

export function SSOCallbackHandler({ flow, continueSignUp }: SSOCallbackHandlerProps) {
  const { isProcessing } = useSSOCallback(flow)

  if (flow === "signup") {
    return (
      <AuthenticateWithRedirectCallback 
        transferable={false}
        signInUrl="/log-in"
        signUpUrl="/sign-up"
        continueSignUpUrl="/sso-callback?flow=signup"
        signInFallbackRedirectUrl="/game"
        signUpFallbackRedirectUrl="/game"
      />
    )
  }

  if (flow === "login" && !continueSignUp) {
    return (
      <AuthenticateWithRedirectCallback 
        transferable={true}
        signInUrl="/log-in"
        signUpUrl="/sign-up"
        continueSignUpUrl="/sso-callback?flow=login&continue=true"
        signInFallbackRedirectUrl="/game"
        signUpFallbackRedirectUrl="/game"
      />
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-lg">
          {isProcessing ? "Completing authentication..." : "Redirecting..."}
        </p>
        <p className="text-sm text-muted-foreground mt-2">Please wait...</p>
        <div id="clerk-captcha" />
      </div>
    </div>
  )
}
