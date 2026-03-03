import { useEffect, useState } from "react"
import { useSignUp, useSignIn, useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { generateUsername, generateFallbackUsername } from "../lib/username-generator"
import { AUTH_ROUTES } from "../lib/constants"

export function useSSOCallback(flow: string | null) {
  const { signUp, isLoaded: signUpLoaded, setActive: setSignUpActive } = useSignUp()
  const { signIn, isLoaded: signInLoaded, setActive: setSignInActive } = useSignIn()
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const router = useRouter()
  const [hasProcessed, setHasProcessed] = useState(false)
  const [isProcessing, setIsProcessing] = useState(true)

  const setUsernameWithRetry = async (retryCount = 0): Promise<boolean> => {
    if (!signUp) return false

    try {
      const userData = {
        firstName: signUp.firstName,
        lastName: signUp.lastName,
        fullName: (signUp.unsafeMetadata as any)?.fullName,
        emailAddress: signUp.emailAddress,
      }

      const username = generateUsername(userData)

      if ((!username || username.length < 4) && retryCount < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return setUsernameWithRetry(retryCount + 1)
      }

      await signUp.update({ username })

      if (signUp.status === "complete") {
        setHasProcessed(true)
        if (signUp.createdSessionId && setSignUpActive) {
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        window.location.href = AUTH_ROUTES.HOME
        return true
      }

      return false
    } catch (err: any) {
      console.error("Error setting username:", err)

      try {
        const userData = {
          firstName: signUp?.firstName,
          lastName: signUp?.lastName,
          fullName: (signUp?.unsafeMetadata as any)?.fullName,
          emailAddress: signUp?.emailAddress,
        }
        const fallbackUsername = generateFallbackUsername(userData)

        await signUp?.update({ username: fallbackUsername })

        if (signUp?.status === "complete" && signUp?.createdSessionId && setSignUpActive) {
          setHasProcessed(true)
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
          window.location.href = AUTH_ROUTES.HOME
          return true
        }
      } catch (fallbackErr) {
        console.error("Error with fallback username:", fallbackErr)
      }

      return false
    }
  }

  const handleImmediateCallback = async () => {
    try {
      if (isSignedIn) {
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      if (signIn && signIn.status === "complete" && signIn.createdSessionId) {
        setHasProcessed(true)
        await setSignInActive({ session: signIn.createdSessionId })
        await new Promise((resolve) => setTimeout(resolve, 500))
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      if (signUp && signUp.status === "missing_requirements") {
        await setUsernameWithRetry()
        return
      }

      if (signUp && signUp.status === "complete") {
        setHasProcessed(true)

        if (signUp.createdSessionId) {
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
          window.location.href = AUTH_ROUTES.HOME
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))

        if (isSignedIn) {
          window.location.href = AUTH_ROUTES.HOME
          return
        }

        window.location.href = AUTH_ROUTES.HOME
        return
      }
    } catch (error) {
      console.error("Immediate callback error:", error)
    }
  }

  const pollForSession = () => {
    const checkInterval = setInterval(async () => {
      if (isSignedIn) {
        clearInterval(checkInterval)
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      if (signIn?.status === "complete" && signIn.createdSessionId && setSignInActive) {
        clearInterval(checkInterval)
        setHasProcessed(true)
        await setSignInActive({ session: signIn.createdSessionId })
        await new Promise((resolve) => setTimeout(resolve, 500))
        window.location.href = AUTH_ROUTES.HOME
        return
      }

      if (signUp && signUp.status === "missing_requirements") {
        const userData = {
          firstName: signUp.firstName,
          lastName: signUp.lastName,
          fullName: (signUp.unsafeMetadata as any)?.fullName,
          emailAddress: signUp.emailAddress,
        }

        let username = generateUsername(userData)

        if (username.length < 4) {
          username = username.padEnd(4, "0")
        }

        try {
          await signUp.update({ username })
        } catch (err: any) {
          const fallbackUsername = generateFallbackUsername(userData)
          try {
            await signUp.update({ username: fallbackUsername })
          } catch (fallbackErr) {
            console.error("Error setting username:", fallbackErr)
          }
        }
      }

      if (signUp && signUp.status === "complete") {
        clearInterval(checkInterval)
        setHasProcessed(true)

        if (signUp.createdSessionId && setSignUpActive) {
          await setSignUpActive({ session: signUp.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        window.location.href = AUTH_ROUTES.HOME
        return
      }
    }, 500)

    setTimeout(() => {
      clearInterval(checkInterval)
      if (!hasProcessed) {
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
      }
    }, 10000)
  }

  useEffect(() => {
    if (!signUpLoaded && !signInLoaded && !authLoaded) return
    if (hasProcessed) return

    const processCallback = async () => {
      try {
        await handleImmediateCallback()
        pollForSession()
      } catch (error) {
        console.error("SSO callback error:", error)
        setHasProcessed(true)
        window.location.href = AUTH_ROUTES.HOME
      } finally {
        setIsProcessing(false)
      }
    }

    processCallback()
  }, [
    signUp,
    signIn,
    signUpLoaded,
    signInLoaded,
    authLoaded,
    isSignedIn,
    setSignInActive,
    setSignUpActive,
    hasProcessed,
  ])

  return {
    isProcessing,
    hasProcessed,
  }
}
