"use client"

import { useEffect, useState, Suspense } from "react"
import { useSignUp, useSignIn, useAuth, AuthenticateWithRedirectCallback } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"

function SSOCallbackContent() {
  const searchParams = useSearchParams()
  const flow = searchParams.get("flow")
  const { signUp, isLoaded: signUpLoaded, setActive: setSignUpActive } = useSignUp()
  const { signIn, isLoaded: signInLoaded, setActive: setSignInActive } = useSignIn()
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const router = useRouter()
  const [hasProcessed, setHasProcessed] = useState(false)

  useEffect(() => {
    if (!signUpLoaded && !signInLoaded && !authLoaded) return
    if (hasProcessed) return

    const handleCallback = async () => {
      try {
        
        if (isSignedIn) {
          setHasProcessed(true)
          window.location.href = "/"
          return
        }

        if (signIn && signIn.status === "complete" && signIn.createdSessionId) {
          setHasProcessed(true)
          await setSignInActive({ session: signIn.createdSessionId })
          await new Promise((resolve) => setTimeout(resolve, 500))
          window.location.href = "/"
          return
        }

        if (signUp) {
          if (signUp.status === "missing_requirements") {
            const generateUsername = () => {
              let firstName = signUp.firstName || ""
              let lastName = signUp.lastName || ""
              
              const unsafeMetadata = signUp.unsafeMetadata as any
              
              const fullName = unsafeMetadata?.fullName || 
                             (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || "")
              
              let username = fullName
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/[^a-z0-9]/g, "")
                .substring(0, 30)
              
              if (!username || username.length === 0) {
                const email = signUp.emailAddress || ""
                username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 30)
              }
              
              const hasLetter = /[a-z]/.test(username)
              if (!hasLetter) {
                username = `user${username}`
              }

              if (username.length < 4) {
                username = username.padEnd(4, "0")
              }

              username = username.substring(0, 64)

              username = username.substring(0, 64)
              
              return username
            }
            
            const setUsername = async (retryCount = 0): Promise<boolean> => {
              try {
                const username = generateUsername()
                
                if ((!username || username.length < 4) && retryCount < 3) {
                  await new Promise((resolve) => setTimeout(resolve, 500))
                  return setUsername(retryCount + 1)
                }
                
                await signUp.update({ username })
                
                if (signUp.status === "complete") {
                  setHasProcessed(true)
                  if (signUp.createdSessionId && setSignUpActive) {
                    await setSignUpActive({ session: signUp.createdSessionId })
                    await new Promise((resolve) => setTimeout(resolve, 500))
                  }
                  window.location.href = "/"
                  return true
                }
                return false
              } catch (err: any) {
                console.error("Error setting username:", err)
                const username = generateUsername()
                const fallbackUsername = username + Math.floor(Math.random() * 10000).toString()
                try {
                  await signUp.update({ username: fallbackUsername })
                  if (signUp.status === "complete" && signUp.createdSessionId && setSignUpActive) {
                    setHasProcessed(true)
                    await setSignUpActive({ session: signUp.createdSessionId })
                    await new Promise((resolve) => setTimeout(resolve, 500))
                    window.location.href = "/"
                    return true
                  }
                } catch (fallbackErr) {
                  console.error("Error with fallback username:", fallbackErr)
                }
                return false
              }
            }
            
            await setUsername()
            return
          }
          
          if (signUp.status === "complete") {
            setHasProcessed(true)
            
            if (signUp.createdSessionId) {
              await setSignUpActive({ session: signUp.createdSessionId })
              await new Promise((resolve) => setTimeout(resolve, 500))
              window.location.href = "/"
              return
            }
            
            await new Promise((resolve) => setTimeout(resolve, 1000))
            
            if (isSignedIn) {
              window.location.href = "/"
              return
            }
            
            window.location.href = "/"
            return
          }
        }

        const checkInterval = setInterval(async () => {
          if (isSignedIn) {
            clearInterval(checkInterval)
            setHasProcessed(true)
            window.location.href = "/"
            return
          }

          if (signIn?.status === "complete" && signIn.createdSessionId && setSignInActive) {
            clearInterval(checkInterval)
            setHasProcessed(true)
            await setSignInActive({ session: signIn.createdSessionId })
            await new Promise((resolve) => setTimeout(resolve, 500))
            window.location.href = "/"
            return
          }

          if (signUp) {
            if (signUp.status === "missing_requirements") {
              const firstName = signUp.firstName || ""
              const lastName = signUp.lastName || ""
              const fullName = signUp.unsafeMetadata?.fullName as string || 
                             (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || "")
              
              let username = fullName
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/[^a-z0-9]/g, "")
                .substring(0, 30)
              
              if (!username || username.length === 0) {
                const email = signUp.emailAddress || signUp.unsafeMetadata?.email as string || ""
                username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 30)
              }
              
              if (username.length < 4) {
                username = username.padEnd(4, "0")
              }
              
              try {
                await signUp.update({ username })
              } catch (err: any) {
                const fallbackUsername = username + Math.floor(Math.random() * 10000).toString()
                try {
                  await signUp.update({ username: fallbackUsername })
                } catch (fallbackErr) {
                  console.error("Error setting username:", fallbackErr)
                }
              }
            }
            
            if (signUp.status === "complete") {
              clearInterval(checkInterval)
              setHasProcessed(true)
              
              if (signUp.createdSessionId && setSignUpActive) {
                await setSignUpActive({ session: signUp.createdSessionId })
                await new Promise((resolve) => setTimeout(resolve, 500))
              } else {
                await new Promise((resolve) => setTimeout(resolve, 1000))
              }
              
              window.location.href = "/"
              return
            }
          }
        }, 500)

        setTimeout(() => {
          clearInterval(checkInterval)
          if (!hasProcessed) {
            setHasProcessed(true)
            window.location.href = "/"
          }
        }, 10000)
      } catch (error) {
        console.error("SSO callback error:", error)
        setHasProcessed(true)
        window.location.href = "/"
      }
    }

    handleCallback()
  }, [signUp, signIn, signUpLoaded, signInLoaded, authLoaded, isSignedIn, setSignInActive, setSignUpActive, hasProcessed])

  if (flow === "signup") {
    console.log("📝 SSO Callback - Using AuthenticateWithRedirectCallback for sign-up flow with transferable=false")
    return (
      <AuthenticateWithRedirectCallback 
        transferable={false}
        signInUrl="/log-in"
        signUpUrl="/sign-up"
        continueSignUpUrl="/sso-callback?flow=signup"
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
      />
    )
  }

  const continueSignUp = searchParams.get("continue")
  
  if (flow === "login" && !continueSignUp) {
    console.log("🔐 SSO Callback - Using AuthenticateWithRedirectCallback for login flow with transferable=true")
    return (
      <AuthenticateWithRedirectCallback 
        transferable={true}
        signInUrl="/log-in"
        signUpUrl="/sign-up"
        continueSignUpUrl="/sso-callback?flow=login&continue=true"
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
      />
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-lg">Completing authentication...</p>
        <p className="text-sm text-muted-foreground mt-2">Please wait...</p>
        <div id="clerk-captcha" />
      </div>
    </div>
  )
}

export default function SSOCallback() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    }>
      <SSOCallbackContent />
    </Suspense>
  )
}
