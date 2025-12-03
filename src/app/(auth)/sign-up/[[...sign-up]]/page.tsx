"use client"

import { useEffect } from "react"
import { useUser, useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { SignupForm } from "@/components/signup-form"

export default function SignupPage() {
  const { isSignedIn, isLoaded: userLoaded } = useUser()
  const { signUp, isLoaded: signUpLoaded } = useSignUp()
  const router = useRouter()

  useEffect(() => {
    if (!userLoaded || !signUpLoaded) return

    if (isSignedIn) {
      router.push("/")
      return
    }

    if (signUp && signUp.status === "complete") {
      router.push("/")
      window.location.href = "/"
      return
    }
    
  }, [userLoaded, signUpLoaded, isSignedIn, signUp, router])

  if (!userLoaded || !signUpLoaded || isSignedIn) {
    return null
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <SignupForm />
      </div>
    </div>
  )
}
