// Central route constants for the auth feature. Keeping URLs in one file avoids
// hard-coded route strings being repeated across hooks and components.
export const AUTH_REDIRECT_URLS = {
  // Google OAuth returns to the SSO callback first so the app can process the
  // Clerk sign-in/sign-up result before sending the user to the game.
  GOOGLE_SIGNUP: "/sso-callback?flow=signup",
  GOOGLE_LOGIN: "/sso-callback?flow=login",
  // Final destination after Clerk completes authentication.
  COMPLETE: "/game",
} as const

// Internal app routes used by form hooks after successful or invalid auth
// states. These are consumed by router.push() and window.location redirects.
export const AUTH_ROUTES = {
  HOME: "/game",
  LOGIN: "/log-in",
  SIGNUP: "/sign-up",
  OTP: "/otp",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
} as const
