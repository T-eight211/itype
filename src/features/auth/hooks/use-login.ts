import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { mapLoginErrors } from "../lib/error-mappers"
import { isNetworkError } from "../lib/validators"
import { AUTH_REDIRECT_URLS, AUTH_ROUTES } from "../lib/constants"

export function useLogin() {
  const { signIn, isLoaded, setActive } = useSignIn()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)

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

  const handleEmailLogin = async (identifier: string, password: string) => {
    if (!isLoaded) return

    setIsLoading(true)
    setErrors({})
    setFormError(null)

    try {
      const result = await signIn.create({
        identifier,
        password,
      })

      if (result.status === "needs_second_factor") {
        setFormError("Two-factor authentication is required. Please complete the verification.")
        return
      }

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        router.push(AUTH_ROUTES.HOME)
        window.location.href = AUTH_ROUTES.HOME
      } else {
        setFormError("Sign in incomplete. Please try again.")
      }
    } catch (err: any) {
      console.error("Login error:", err)

      if (isNetworkError(err)) {
        setFormError("Network error. Please check your connection and try again.")
        return
      }

      if (err.errors && err.errors.length > 0) {
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

  return {
    isLoaded,
    isLoading,
    errors,
    formError,
    handleGoogleSignIn,
    handleEmailLogin,
  }
}
