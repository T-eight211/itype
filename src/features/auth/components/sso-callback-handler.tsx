"use client"

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"
import { useSSOCallback } from "../hooks/use-sso-callback"

interface SSOCallbackHandlerProps {
  flow: string | null
  continueSignUp: string | null
}

export function SSOCallbackHandler({ flow, continueSignUp }: SSOCallbackHandlerProps) {
  const { isProcessing } = useSSOCallback(flow)

  // Sign-up flow - don't transfer to sign-in
  if (flow === "signup") {
    console.log("📝 SSO Callback - Using AuthenticateWithRedirectCallback for sign-up flow with transferable=false")
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

  // Login flow - can transfer to sign-up
  if (flow === "login" && !continueSignUp) {
    console.log("🔐 SSO Callback - Using AuthenticateWithRedirectCallback for login flow with transferable=true")
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

  // Default loading state
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
