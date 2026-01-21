import { useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { AUTH_ROUTES } from "../lib/constants"

/**
 * Redirect authenticated users away from auth pages
 */
export function useAuthRedirect() {
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push(AUTH_ROUTES.HOME)
    }
  }, [isLoaded, isSignedIn, router])

  return { isLoaded, isSignedIn }
}
