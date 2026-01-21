import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { validateEmail } from "../lib/validators"
import { mapGenericError, isNetworkError } from "../lib/error-mappers"
import { AUTH_ROUTES } from "../lib/constants"

export function useForgotPassword() {
  const router = useRouter()
  const { isLoaded, signIn } = useSignIn()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  const sendResetCode = async (email: string) => {
    if (!isLoaded || !signIn) {
      setError("Please wait while we initialize...")
      return false
    }

    const validationError = validateEmail(email)
    if (validationError) {
      setError(validationError)
      return false
    }

    setIsLoading(true)
    setError("")

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      })

      router.push(AUTH_ROUTES.RESET_PASSWORD)
      return true
    } catch (err: any) {
      console.error("Password reset error:", err)

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

  const clearError = () => setError("")

  return {
    isLoaded,
    isLoading,
    error,
    sendResetCode,
    clearError,
  }
}
