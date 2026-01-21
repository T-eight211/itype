import { useState } from "react"
import { useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { mapSignupErrors, isNetworkError } from "../lib/error-mappers"
import { AUTH_REDIRECT_URLS, AUTH_ROUTES } from "../lib/constants"

export function useSignup() {
  const { signUp, isLoaded } = useSignUp()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{
    username?: string
    email?: string
    password?: string
  }>({})
  const [formError, setFormError] = useState<string | null>(null)

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

  const handleEmailSignup = async (username: string, email: string, password: string) => {
    if (!isLoaded) return

    setIsLoading(true)
    setErrors({})
    setFormError(null)

    try {
      await signUp.create({
        username,
        emailAddress: email,
        password,
      })

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })

      router.push(AUTH_ROUTES.OTP)
    } catch (err: any) {
      console.error("Signup error:", err)

      if (isNetworkError(err)) {
        setFormError("Network error. Please check your connection and try again.")
        return
      }

      if (err.errors && err.errors.length > 0) {
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

  return {
    isLoaded,
    isLoading,
    errors,
    formError,
    handleGoogleSignUp,
    handleEmailSignup,
  }
}
