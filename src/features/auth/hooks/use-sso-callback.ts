import { useEffect, useState } from "react"
import { useSignUp, useSignIn, useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { generateUsername, generateFallbackUsername } from "../lib/username-generator"
import { AUTH_ROUTES } from "../lib/constants"

// Handles the return from Google OAuth. Clerk may return a completed sign-in, a
// completed sign-up, or a sign-up that is still missing the required username.
// This hook normalises those cases and sends the user to the game once a session
// is active.
export function useSSOCallback(flow: string | null) {
  // Both Clerk resources are loaded because Google OAuth can transfer between
  // sign-in and sign-up depending on whether the Google account already exists.
  const { signUp, isLoaded: signUpLoaded, setActive: setSignUpActive } = useSignUp()
  const { signIn, isLoaded: signInLoaded, setActive: setSignInActive } = useSignIn()
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const router = useRouter()

  // Prevents the callback from activating the same OAuth result more than once
  // as Clerk state updates and the polling loop runs.
  const [hasProcessed, setHasProcessed] = useState(false)
  const [isProcessing, setIsProcessing] = useState(true)

  // Google sign-up can fail to meet the app's username requirement. This helper
  // derives a username from the OAuth profile/email, updates Clerk, and activates
  // the created session if the sign-up becomes complete.
  const setUsernameWithRetry = async (retryCount = 0): Promise<boolean> => {
    if (!signUp) return false

    try {
      // Read the data Clerk has from the OAuth provider.
      const userData = {
        firstName: signUp.firstName,
        lastName: signUp.lastName,
        fullName: (signUp.unsafeMetadata as any)?.fullName,
        emailAddress: signUp.emailAddress,
      }

      const username = generateUsername(userData)

      // OAuth profile data can arrive asynchronously. A short retry gives Clerk
      // time to populate name/email fields before falling back.
      if ((!username || username.length < 4) && retryCount < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return setUsernameWithRetry(retryCount + 1)
      }

      // Submit the generated username to Clerk to satisfy the missing
      // requirement.
      await signUp.update({ username })

      if (signUp.status === "complete") {
        setHasProcessed(true)
        if (signUp.createdSessionId && setSignUpActive) {
          // Activate the newly created Clerk session in the browser.
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        window.location.href = AUTH_ROUTES.HOME
        return true
      }

      return false
    } catch (err: any) {
      console.error("Error setting username:", err)

      try {
        // If the readable username fails, retry with a random suffix to avoid
        // collisions with existing usernames.
        const userData = {
          firstName: signUp?.firstName,
          lastName: signUp?.lastName,
          fullName: (signUp?.unsafeMetadata as any)?.fullName,
          emailAddress: signUp?.emailAddress,
        }
        const fallbackUsername = generateFallbackUsername(userData)

        await signUp?.update({ username: fallbackUsername })

        if (signUp?.status === "complete" && signUp?.createdSessionId && setSignUpActive) {
          setHasProcessed(true)
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
          window.location.href = AUTH_ROUTES.HOME
          return true
        }
      } catch (fallbackErr) {
        console.error("Error with fallback username:", fallbackErr)
      }

      return false
    }
  }

  // Handles whatever Clerk state is already available when the callback page
  // first loads. This is the fastest path and may complete without polling.
  const handleImmediateCallback = async () => {
    try {
      // If Clerk already considers the user signed in, there is nothing else to
      // activate.
      if (isSignedIn) {
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      // Existing Google account: Clerk returns a completed sign-in and a session
      // ID that must be activated.
      if (signIn && signIn.status === "complete" && signIn.createdSessionId) {
        setHasProcessed(true)
        await setSignInActive({ session: signIn.createdSessionId })
        await new Promise((resolve) => setTimeout(resolve, 500))
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      // New Google account missing the required username. Generate/update the
      // username before the sign-up can be considered complete.
      if (signUp && signUp.status === "missing_requirements") {
        await setUsernameWithRetry()
        return
      }

      // New Google account already complete. Activate the session if Clerk
      // supplied one, otherwise redirect after a short wait for auth state.
      if (signUp && signUp.status === "complete") {
        setHasProcessed(true)

        if (signUp.createdSessionId) {
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
          window.location.href = AUTH_ROUTES.HOME
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))

        if (isSignedIn) {
          window.location.href = AUTH_ROUTES.HOME
          return
        }

        window.location.href = AUTH_ROUTES.HOME
        return
      }
    } catch (error) {
      console.error("Immediate callback error:", error)
    }
  }

  // Polls Clerk state after the immediate pass. OAuth callback state may settle
  // shortly after the component mounts, especially when Clerk transfers between
  // sign-in and sign-up flows.
  const pollForSession = () => {
    const checkInterval = setInterval(async () => {
      if (isSignedIn) {
        clearInterval(checkInterval)
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      // Completed sign-in from an existing Google account.
      if (signIn?.status === "complete" && signIn.createdSessionId && setSignInActive) {
        clearInterval(checkInterval)
        setHasProcessed(true)
        await setSignInActive({ session: signIn.createdSessionId })
        await new Promise((resolve) => setTimeout(resolve, 500))
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      // Missing username during sign-up. The same username-generation logic is
      // repeated here because this state may appear only after polling starts.
      if (signUp && signUp.status === "missing_requirements") {
        const userData = {
          firstName: signUp.firstName,
          lastName: signUp.lastName,
          fullName: (signUp.unsafeMetadata as any)?.fullName,
          emailAddress: signUp.emailAddress,
        }

        let username = generateUsername(userData)

        if (username.length < 4) {
          username = username.padEnd(4, "0")
        }

        try {
          await signUp.update({ username })
        } catch (err: any) {
          // Collision or format error: retry with a random suffix.
          const fallbackUsername = generateFallbackUsername(userData)
          try {
            await signUp.update({ username: fallbackUsername })
          } catch (fallbackErr) {
            console.error("Error setting username:", fallbackErr)
          }
        }
      }

      // Completed sign-up from a new Google account.
      if (signUp && signUp.status === "complete") {
        clearInterval(checkInterval)
        setHasProcessed(true)

        if (signUp.createdSessionId && setSignUpActive) {
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        window.location.href = AUTH_ROUTES.HOME
        return
      }
    }, 500)

    // Safety timeout: if Clerk state does not settle, stop polling and redirect
    // instead of leaving the callback screen stuck forever.
    setTimeout(() => {
      clearInterval(checkInterval)
      if (!hasProcessed) {
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
      }
    }, 10000)
  }

  useEffect(() => {
    // Wait until at least one Clerk resource has loaded before reading status.
    if (!signUpLoaded && !signInLoaded && !authLoaded) return
    if (hasProcessed) return

    const processCallback = async () => {
      try {
        // Try the immediate state first, then poll for late-arriving Clerk OAuth
        // state.
        await handleImmediateCallback()
        pollForSession()
      } catch (error) {
        console.error("SSO callback error:", error)
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
      } finally {
        setIsProcessing(false)
      }
    }

    processCallback()
  }, [
    signUp,
    signIn,
    signUpLoaded,
    signInLoaded,
    authLoaded,
    isSignedIn,
    setSignInActive,
    setSignUpActive,
    hasProcessed,
  ])

  // Returned values are used by the callback component to show processing text.
  return {
    isProcessing,
    hasProcessed,
  }
}
