import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { mapLoginErrors } from "../lib/error-mappers"
import { isNetworkError } from "../lib/validators"
import { AUTH_REDIRECT_URLS, AUTH_ROUTES } from "../lib/constants"

// Custom login hook used by `LoginForm`. It adapts Clerk's `useSignIn()` API to
// the form's loading state, field errors and submit handlers.
export function useLogin() {
  // `setActive` activates the Clerk session after a successful sign-in.
  const { signIn, isLoaded, setActive } = useSignIn()
  const router = useRouter()

  // Local UI state for disabling controls and displaying mapped Clerk errors.
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Starts the Google OAuth sign-in flow. The callback route is used to handle
  // OAuth edge cases, including Clerk transferring a Google sign-in into a
  // sign-up flow if the account does not exist yet.
  const handleGoogleSignIn = async () => {
    if (!isLoaded) return

    setIsLoading(true)
    setFormError(null)
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: AUTH_REDIRECT_URLS.GOOGLE_LOGIN,
        redirectUrlComplete: AUTH_REDIRECT_URLS.COMPLETE,
      })
    } catch (err: any) {
      console.error("Google signin error:", err)
      setFormError("Failed to sign in with Google. Please try again.")
      setIsLoading(false)
    }
  }

  // Handles email/username + password login from `LoginForm`.
  const handleEmailLogin = async (identifier: string, password: string) => {
    if (!isLoaded) return

    setIsLoading(true)
    setErrors({})
    setFormError(null)

    try {
      // Clerk accepts either email or username as the identifier because the
      // Clerk dashboard enables username sign-in.
      const result = await signIn.create({
        identifier,
        password,
      })

      // The project does not implement a custom 2FA UI, so the flow stops with a
      // clear form message if Clerk requires a second factor.
      if (result.status === "needs_second_factor") {
        setFormError("Two-factor authentication is required. Please complete the verification.")
        return
      }

      if (result.status === "complete") {
        // Convert the completed Clerk sign-in attempt into the active browser
        // session, then navigate to the game.
        await setActive({ session: result.createdSessionId })
        router.push(AUTH_ROUTES.HOME)
        window.location.href = AUTH_ROUTES.HOME
      } else {
        setFormError("Sign in incomplete. Please try again.")
      }
    } catch (err: any) {
      console.error("Login error:", err)

      // Network failures do not contain Clerk field codes, so they are shown as
      // a form-level error.
      if (isNetworkError(err)) {
        setFormError("Network error. Please check your connection and try again.")
        return
      }

      if (err.errors && err.errors.length > 0) {
        // Convert Clerk's raw login error codes into identifier/password errors
        // that the component can render next to inputs.
        const { fieldErrors, formError: mappedFormError } = mapLoginErrors(err.errors)
        setErrors(fieldErrors)
        if (mappedFormError) {
          setFormError(mappedFormError)
        }
      } else {
        setFormError("An error occurred. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Returned values are destructured by `LoginForm`.
  return {
    isLoaded,
    isLoading,
    errors,
    formError,
    handleGoogleSignIn,
    handleEmailLogin,
  }
}
