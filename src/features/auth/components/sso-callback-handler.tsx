"use client"

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"
import { useSSOCallback } from "../hooks/use-sso-callback"

interface SSOCallbackHandlerProps {
  flow: string | null
  continueSignUp: string | null
}

// Handles the visual/Clerk component side of the OAuth callback route. The
// custom `useSSOCallback()` hook runs alongside Clerk's callback component to
// complete app-specific work such as generated usernames.
export function SSOCallbackHandler({ flow, continueSignUp }: SSOCallbackHandlerProps) {
  // Controls the fallback text while the callback hook is finalising Clerk state.
  const { isProcessing } = useSSOCallback(flow)

  if (flow === "signup") {
    console.log("SSO Callback - Using AuthenticateWithRedirectCallback for sign-up flow with transferable=false")
    return (
      // Explicit sign-up flow. `transferable={false}` prevents this callback
      // from silently converting into a login flow.
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
    console.log("SSO Callback - Using AuthenticateWithRedirectCallback for login flow with transferable=true")
    return (
      // Login flow can be transferable because a user may choose a Google account
      // that does not exist yet. Clerk can then continue into sign-up.
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

  // Fallback UI for continued sign-up handling or delayed Clerk callback state.
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
