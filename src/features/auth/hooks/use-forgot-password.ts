import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { validateEmail, isNetworkError } from "../lib/validators"
import { mapGenericError } from "../lib/error-mappers"
import { AUTH_ROUTES } from "../lib/constants"

// Starts Clerk's password-reset flow. Used by `ForgotPasswordForm`.
export function useForgotPassword() {
  const router = useRouter()
  // Password reset is modelled by Clerk as a sign-in attempt using the
  // `reset_password_email_code` strategy.
  const { isLoaded, signIn } = useSignIn()

  // Local UI state for disabling the submit button and showing a form error.
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  // Sends the password reset code to the supplied email address.
  const sendResetCode = async (email: string) => {
    if (!isLoaded || !signIn) {
      setError("Please wait while we initialise...")
      return false
    }

    // Local email validation avoids sending an obviously invalid request to
    // Clerk.
    const validationError = validateEmail(email)
    if (validationError) {
      setError(validationError)
      return false
    }

    setIsLoading(true)
    setError("")

    try {
      // Creates a temporary Clerk sign-in attempt for password reset and sends
      // the email code.
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      })

      // The reset page uses `useResetPassword()` to submit the code and new
      // password against this same Clerk sign-in attempt.
      router.push(AUTH_ROUTES.RESET_PASSWORD)
      return true
    } catch (err: any) {
      console.error("Password reset error:", err)

      // Network errors are not Clerk validation errors, so they get a generic
      // connection message.
      if (isNetworkError(err)) {
        setError("Network error. Please check your connection and try again.")
        return false
      }

      setError(mapGenericError(err))
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Called by the form when the email input changes.
  const clearError = () => setError("")

  // Returned values are consumed by `ForgotPasswordForm`.
  return {
    isLoaded,
    isLoading,
    error,
    sendResetCode,
    clearError,
  }
}
