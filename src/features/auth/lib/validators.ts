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

export function validatePassword(password: string): string | null {
  if (!password.trim()) {
    return "Please enter a password"
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters long"
  }

  return null
}

export function validatePasswordWithSpecialChars(password: string): string | null {
  const basicError = validatePassword(password)
  if (basicError) return basicError

  const specialChars = /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/
  if (!specialChars.test(password)) {
    return 'Passwords must contain at least one of the following special characters: !"#$%&\'()*+,-./:;<=>?@[]^_`{|}~.'
  }

  return null
}

export function validatePasswordMatch(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match"
  }
  return null
}

export function validateCode(code: string): string | null {
  if (code.length !== 6) {
    return "Please enter a 6-digit code"
  }
  return null
}

export function isNetworkError(err: any): boolean {
  return err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")
}
