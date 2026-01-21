import { useState, useEffect } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { validateCode, validatePasswordWithSpecialChars, validatePasswordMatch, isNetworkError } from "../lib/validators"
import { mapPasswordResetErrors, isSessionExpired } from "../lib/error-mappers"
import { AUTH_ROUTES } from "../lib/constants"

export function useResetPassword() {
  const router = useRouter()
  const { isLoaded, signIn, setActive } = useSignIn()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [codeError, setCodeError] = useState<string>("")
  const [passwordError, setPasswordError] = useState<string>("")
  const [secondFactor, setSecondFactor] = useState(false)

  // Redirect if not in correct reset flow
  useEffect(() => {
    if (isLoaded && signIn) {
      if (signIn.status !== "needs_first_factor") {
        router.push(AUTH_ROUTES.FORGOT_PASSWORD)
      }
    }
  }, [isLoaded, signIn, router])

  const resetPassword = async (code: string, password: string, confirmPassword: string) => {
    if (!isLoaded || !signIn) {
      setError("Please wait while we initialize...")
      return false
    }

    if (signIn.status !== "needs_first_factor") {
      setError("Please start the password reset process first.")
      router.push(AUTH_ROUTES.FORGOT_PASSWORD)
      return false
    }

    // Clear previous errors
    setCodeError("")
    setPasswordError("")
    setError("")

    // Validate inputs
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
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      })

      if (result.status === "needs_second_factor") {
        setSecondFactor(true)
        setError("Two-factor authentication is required. This UI does not handle 2FA.")
        return false
      }

      if (result.status === "complete") {
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

  const handleResend = () => {
    router.push(AUTH_ROUTES.FORGOT_PASSWORD)
  }

  const clearCodeError = () => setCodeError("")
  const clearPasswordError = () => setPasswordError("")

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
