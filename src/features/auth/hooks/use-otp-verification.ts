import { useState, useEffect } from "react"
import { useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { validateCode, isNetworkError } from "../lib/validators"
import { isSessionExpired, mapGenericError } from "../lib/error-mappers"
import { AUTH_ROUTES } from "../lib/constants"

// Handles the OTP page after email sign-up. It verifies the code Clerk sent
// through `prepareEmailAddressVerification()` in `useSignup()`.
export function useOTPVerification() {
  // The OTP page depends on Clerk's current pending `signUp` object. If there is
  // no pending sign-up, the user should restart at the sign-up form.
  const { signUp, isLoaded } = useSignUp()
  const router = useRouter()

  // Local UI state for the OTP form.
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    if (isLoaded) {
      // Clerk uses `missing_requirements` for an incomplete sign-up. In this
      // app, that means the user has supplied username/email/password but still
      // needs to verify the email code.
      if (!signUp || signUp.status === null || signUp.status !== "missing_requirements") {
        router.push(AUTH_ROUTES.SIGNUP)
      }
    }
  }, [isLoaded, signUp, router])

  // Attempts to complete email verification using the six-digit code typed in
  // `OTPForm`.
  const verifyCode = async (code: string) => {
    if (!isLoaded || !signUp) {
      setError("Please start the signup process first.")
      router.push(AUTH_ROUTES.SIGNUP)
      return false
    }

    // Local length validation prevents unnecessary Clerk calls for incomplete
    // codes.
    const codeValidationError = validateCode(code)
    if (codeValidationError) {
      setError(codeValidationError)
      return false
    }

    // Re-check the sign-up state at submit time in case the Clerk state changed
    // while the page was open.
    if (signUp.status !== "missing_requirements") {
      setError("Please start the signup process first.")
      router.push(AUTH_ROUTES.SIGNUP)
      return false
    }

    setIsLoading(true)
    setError("")

    try {
      // Clerk validates the email code. A successful attempt completes the
      // sign-up and creates the user/session.
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === "complete") {
        // A full reload is used after completion so Clerk session state and the
        // app route are in sync.
        await new Promise((resolve) => setTimeout(resolve, 500))
        window.location.href = AUTH_ROUTES.HOME
        return true
      } else {
        setError("Verification incomplete. Please try again.")
        return false
      }
    } catch (err: any) {
      console.error("OTP verification error:", err)

      // Network and expired-flow errors are shown differently because the user
      // may need to restart sign-up if the Clerk attempt is no longer valid.
      if (isNetworkError(err)) {
        setError("Network error. Please check your connection and try again.")
        return false
      }

      if (err.errors && isSessionExpired(err.errors)) {
        setError("Your session has expired. Please start over.")
        setTimeout(() => {
          router.push(AUTH_ROUTES.SIGNUP)
        }, 2000)
        return false
      }

      setError(mapGenericError(err))
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Resends a new code by asking Clerk to prepare email verification again for
  // the same pending sign-up attempt.
  const resendCode = async () => {
    if (!isLoaded || !signUp) {
      setError("Please start the signup process first.")
      router.push(AUTH_ROUTES.SIGNUP)
      return false
    }

    setIsLoading(true)
    setError("")

    try {
      // Clerk sends a fresh email code using the configured email-code strategy.
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })
      return true
    } catch (err: any) {
      console.error("Resend error:", err)

      if (isNetworkError(err)) {
        setError("Network error. Please check your connection and try again.")
        return false
      }

      if (err.errors && isSessionExpired(err.errors)) {
        setError("Your session has expired. Please start over.")
        setTimeout(() => {
          router.push(AUTH_ROUTES.SIGNUP)
        }, 2000)
        return false
      }

      setError("Failed to resend code. Please try again.")
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Returned values are destructured by `OTPForm`.
  return {
    isLoaded,
    isLoading,
    error,
    verifyCode,
    resendCode,
  }
}
