import { useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { AUTH_ROUTES } from "../lib/constants"

// Shared guard for auth pages. It is used by login, sign-up, OTP, forgot
// password and reset-password pages so an already signed-in user is not shown
// authentication screens again.
export function useAuthRedirect() {
  // `useUser()` exposes Clerk's browser-side session state. `isLoaded` prevents
  // redirect decisions before Clerk has finished initialising.
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Authenticated users are returned to the game route.
      router.push(AUTH_ROUTES.HOME)
    }
  }, [isLoaded, isSignedIn, router])

  // Pages use this return value to render nothing while redirecting.
  return { isLoaded, isSignedIn }
}
