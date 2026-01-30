"use client"

import { LoginForm } from "@/features/auth/components/login-form"
import { useAuthRedirect } from "@/features/auth/hooks/use-auth-redirect"

export default function LoginPage() {
  const { isLoaded, isSignedIn } = useAuthRedirect()

  if (!isLoaded || isSignedIn) {
    return null
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-4 pb-6 md:pb-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <LoginForm />
      </div>
    </div>
  )
}
