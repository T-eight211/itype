"use client"

import { useEffect } from "react"
import { useUser, useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  const { isSignedIn, isLoaded: userLoaded } = useUser()
  const { signIn, isLoaded: signInLoaded, setActive } = useSignIn()
  const router = useRouter()

  useEffect(() => {
    if (!userLoaded || !signInLoaded) return

    if (isSignedIn) {
      router.push("/")
      return
    }


    if (signIn && signIn.status === "complete") {

      setActive({ session: signIn.createdSessionId }).then(() => {
        router.push("/")
        window.location.href = "/"
      })
      return
    }
  }, [userLoaded, signInLoaded, isSignedIn, signIn, router, setActive])

  if (!userLoaded || !signInLoaded || isSignedIn) {
    return null
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <LoginForm />
      </div>
    </div>
  )
}
