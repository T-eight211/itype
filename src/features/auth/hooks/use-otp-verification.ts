import { useState, useEffect } from "react"
import { useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { validateCode, isNetworkError } from "../lib/validators"
import { isSessionExpired, mapGenericError } from "../lib/error-mappers"
import { AUTH_ROUTES } from "../lib/constants"

export function useOTPVerification() {
  const { signUp, isLoaded } = useSignUp()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  // Redirect if not in correct signup flow
  useEffect(() => {
    if (isLoaded) {
      if (!signUp || signUp.status === null || signUp.status !== "missing_requirements") {
        router.push(AUTH_ROUTES.SIGNUP)
      }
    }
  }, [isLoaded, signUp, router])

  const verifyCode = async (code: string) => {
    if (!isLoaded || !signUp) {
      setError("Please start the signup process first.")
      router.push(AUTH_ROUTES.SIGNUP)
      return false
    }

    const codeValidationError = validateCode(code)
    if (codeValidationError) {
      setError(codeValidationError)
      return false
    }

    if (signUp.status !== "missing_requirements") {
      setError("Please start the signup process first.")
      router.push(AUTH_ROUTES.SIGNUP)
      return false
    }

    setIsLoading(true)
    setError("")

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === "complete") {
        await new Promise((resolve) => setTimeout(resolve, 500))
        window.location.href = AUTH_ROUTES.HOME
        return true
      } else {
        setError("Verification incomplete. Please try again.")
        return false
      }
    } catch (err: any) {
      console.error("OTP verification error:", err)

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

  const resendCode = async () => {
    if (!isLoaded || !signUp) {
      setError("Please start the signup process first.")
      router.push(AUTH_ROUTES.SIGNUP)
      return false
    }

    setIsLoading(true)
    setError("")

    try {
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

  return {
    isLoaded,
    isLoading,
    error,
    verifyCode,
    resendCode,
  }
}
