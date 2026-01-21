/**
 * Auth-related constants
 */

export const AUTH_REDIRECT_URLS = {
  GOOGLE_SIGNUP: "/sso-callback?flow=signup",
  GOOGLE_LOGIN: "/sso-callback?flow=login",
  COMPLETE: "/",
} as const

export const AUTH_ROUTES = {
  HOME: "/",
  LOGIN: "/log-in",
  SIGNUP: "/sign-up",
  OTP: "/otp",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
} as const
