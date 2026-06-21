// Client-side email validation used before Clerk is called in the forgot
// password flow. Clerk still performs server-side validation; this improves the
// user experience by showing a local error immediately.
export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return "Please enter your email address"
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return "Please enter a valid email address"
  }

  return null
}

// Basic password validation shared by reset-password helpers. Email sign-up
// relies mainly on Clerk's configured password rules instead.
export function validatePassword(password: string): string | null {
  if (!password.trim()) {
    return "Please enter a password"
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters long"
  }

  return null
}

// Extra reset-password rule requiring at least one special character. This
// mirrors the stricter password requirement configured in Clerk.
export function validatePasswordWithSpecialChars(password: string): string | null {
  const basicError = validatePassword(password)
  if (basicError) return basicError

  const specialChars = /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/
  if (!specialChars.test(password)) {
    return 'Passwords must contain at least one of the following special characters: !"#$%&\'()*+,-./:;<=>?@[]^_`{|}~.'
  }

  return null
}

// Ensures the confirmation field matches the new password before attempting the
// Clerk reset request.
export function validatePasswordMatch(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match"
  }
  return null
}

// OTP and password-reset email codes are expected to be six digits.
export function validateCode(code: string): string | null {
  if (code.length !== 6) {
    return "Please enter a 6-digit code"
  }
  return null
}

// Detects common browser/network failures separately from Clerk validation
// errors so the UI can show a connection-specific message.
export function isNetworkError(err: any): boolean {
  return err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")
}
