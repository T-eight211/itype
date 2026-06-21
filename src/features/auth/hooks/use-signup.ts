import { useState } from "react"
import { useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { mapSignupErrors } from "../lib/error-mappers"
import { isNetworkError } from "../lib/validators"
import { AUTH_REDIRECT_URLS, AUTH_ROUTES } from "../lib/constants"

// Custom sign-up hook used by `SignupForm`. It wraps Clerk's `useSignUp()`
// resource and exposes form-friendly state plus handler functions for email and
// Google sign-up.
export function useSignup() {
  // `signUp` is Clerk's client-side sign-up object. `isLoaded` prevents calling
  // Clerk methods before the SDK has initialised in the browser.
  const { signUp, isLoaded } = useSignUp()
  const router = useRouter()

  // Local UI state used by the form: loading disables inputs/buttons, field
  // errors are rendered beside individual inputs, and `formError` is for general
  // failures such as network errors.
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{
    username?: string
    email?: string
    password?: string
  }>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Starts Google OAuth sign-up. Clerk redirects the browser to Google and then
  // back to `/sso-callback?flow=signup`, where the app finalises the session and
  // fills in any missing username.
  const handleGoogleSignUp = async () => {
    if (!isLoaded) return

    setIsLoading(true)
    setFormError(null)
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: AUTH_REDIRECT_URLS.GOOGLE_SIGNUP,
        redirectUrlComplete: AUTH_REDIRECT_URLS.COMPLETE,
      })
    } catch (err: any) {
      console.error("Google signup error:", err)
      setFormError("Failed to sign up with Google. Please try again.")
      setIsLoading(false)
    }
  }

  // Starts email/password registration from `SignupForm`. The username is
  // required because the application is a game and needs a display name for
  // player identity and leaderboard presentation.
  const handleEmailSignup = async (username: string, email: string, password: string) => {
    if (!isLoaded) return

    setIsLoading(true)
    setErrors({})
    setFormError(null)

    try {
      // Create a pending Clerk sign-up with the required fields. At this point
      // the user is not fully registered because email verification is still
      // required.
      await signUp.create({
        username,
        emailAddress: email,
        password,
      })

      // Ask Clerk to send a one-time email code. The sign-up remains in
      // `missing_requirements` until the code is verified on the OTP page.
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })

      // Move the user to the OTP page where `useOTPVerification()` completes the
      // email verification step.
      router.push(AUTH_ROUTES.OTP)
    } catch (err: any) {
      console.error("Signup error:", err)

      // Network failures are handled separately because Clerk validation mapping
      // only applies when the SDK receives a structured error response.
      if (isNetworkError(err)) {
        setFormError("Network error. Please check your connection and try again.")
        return
      }

      if (err.errors && err.errors.length > 0) {
        // Convert Clerk's raw error objects into the local field-error shape
        // expected by the React form.
        const { fieldErrors, formError: mappedFormError } = mapSignupErrors(err.errors)
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

  // Returned values are destructured by `SignupForm`.
  return {
    isLoaded,
    isLoading,
    errors,
    formError,
    handleGoogleSignUp,
    handleEmailSignup,
  }
}
