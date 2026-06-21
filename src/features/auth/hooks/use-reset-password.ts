import { useState, useEffect } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { validateCode, validatePasswordWithSpecialChars, validatePasswordMatch, isNetworkError } from "../lib/validators"
import { mapPasswordResetErrors, isSessionExpired } from "../lib/error-mappers"
import { AUTH_ROUTES } from "../lib/constants"

// Completes Clerk's password reset email-code flow. Used by
// `ResetPasswordForm` after `useForgotPassword()` has created the reset attempt.
export function useResetPassword() {
  const router = useRouter()
  // `signIn` stores the temporary reset-password attempt. `setActive` activates
  // the new session if Clerk signs the user in after the password change.
  const { isLoaded, signIn, setActive } = useSignIn()

  // Split errors allow the form to show code and password problems next to the
  // correct input rather than only showing a single generic message.
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [codeError, setCodeError] = useState<string>("")
  const [passwordError, setPasswordError] = useState<string>("")
  const [secondFactor, setSecondFactor] = useState(false)

  useEffect(() => {
    if (isLoaded && signIn) {
      // A valid reset-password attempt should be waiting for its first factor:
      // the email code plus the new password. If not, the user likely opened the
      // reset page directly and must start from forgot password.
      if (signIn.status !== "needs_first_factor") {
        router.push(AUTH_ROUTES.FORGOT_PASSWORD)
      }
    }
  }, [isLoaded, signIn, router])

  // Attempts to verify the email code and set the new password.
  const resetPassword = async (code: string, password: string, confirmPassword: string) => {
    if (!isLoaded || !signIn) {
      setError("Please wait while we initialise...")
      return false
    }

    // Re-check the Clerk state at submit time to prevent using the page outside
    // the active reset flow.
    if (signIn.status !== "needs_first_factor") {
      setError("Please start the password reset process first.")
      router.push(AUTH_ROUTES.FORGOT_PASSWORD)
      return false
    }

    setCodeError("")
    setPasswordError("")
    setError("")

    // Local validation gives immediate feedback and reduces invalid Clerk
    // requests.
    const codeValidationError = validateCode(code)
    if (codeValidationError) {
      setCodeError(codeValidationError)
      return false
    }

    const passwordValidationError = validatePasswordWithSpecialChars(password)
    if (passwordValidationError) {
      setPasswordError(passwordValidationError)
      return false
    }

    const passwordMatchError = validatePasswordMatch(password, confirmPassword)
    if (passwordMatchError) {
      setPasswordError(passwordMatchError)
      return false
    }

    setIsLoading(true)

    try {
      // Clerk validates the reset code and applies the new password.
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      })

      // This project does not include a 2FA reset UI, so the user is informed if
      // Clerk requires a second factor.
      if (result.status === "needs_second_factor") {
        setSecondFactor(true)
        setError("Two-factor authentication is required. This UI does not handle 2FA.")
        return false
      }

      if (result.status === "complete") {
        // If Clerk created a session, activate it so the user can continue
        // without logging in again.
        if (result.createdSessionId) {
          await setActive({
            session: result.createdSessionId,
            navigate: async ({ session }) => {
              if (session?.currentTask) {
                console.log(session?.currentTask)
                return
              }
              router.push(AUTH_ROUTES.HOME)
            },
          })
        } else {
          router.push(AUTH_ROUTES.HOME)
        }
        return true
      } else {
        setError("Password reset incomplete. Please try again.")
        return false
      }
    } catch (err: any) {
      console.error("Password reset error:", err)

      // Network failures and expired temporary sessions are handled separately
      // from field-level Clerk validation errors.
      if (isNetworkError(err)) {
        setError("Network error. Please check your connection and try again.")
        return false
      }

      if (err.errors && isSessionExpired(err.errors)) {
        setError("Your session has expired. Please start over.")
        setTimeout(() => {
          router.push(AUTH_ROUTES.FORGOT_PASSWORD)
        }, 2000)
        return false
      }

      if (err.errors && err.errors.length > 0) {
        // Map Clerk's code/password errors to the input-specific state used by
        // the reset form.
        const { codeError: mappedCodeError, passwordError: mappedPasswordError, formError: mappedFormError } = mapPasswordResetErrors(err.errors)

        if (mappedCodeError) setCodeError(mappedCodeError)
        if (mappedPasswordError) setPasswordError(mappedPasswordError)
        if (mappedFormError) setError(mappedFormError)
      } else {
        setError("An error occurred. Please try again.")
      }
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Sends the user back to the first reset page to request a new code.
  const handleResend = () => {
    router.push(AUTH_ROUTES.FORGOT_PASSWORD)
  }

  // Called by controlled inputs to clear stale errors after the user edits a
  // field.
  const clearCodeError = () => setCodeError("")
  const clearPasswordError = () => setPasswordError("")

  // Returned values are consumed by `ResetPasswordForm`.
  return {
    isLoaded,
    isLoading,
    error,
    codeError,
    passwordError,
    secondFactor,
    resetPassword,
    handleResend,
    clearCodeError,
    clearPasswordError,
  }
}
