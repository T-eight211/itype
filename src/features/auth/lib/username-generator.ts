/**
 * Username generation utilities for SSO flows
 */

export interface UserData {
  firstName?: string | null
  lastName?: string | null
  fullName?: string
  emailAddress?: string | null
}

/**
 * Generates a valid username from user data
 * Rules:
 * - Lowercase alphanumeric only
 * - 4-64 characters
 * - Must contain at least one letter
 * - Derived from name or email
 */
export function generateUsername(userData: UserData): string {
  const { firstName, lastName, fullName, emailAddress } = userData

  // Try to use full name first
  const nameToUse = fullName || 
    (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || "")

  let username = nameToUse
    .toLowerCase()
    .replace(/\s+/g, "")           // Remove spaces
    .replace(/[^a-z0-9]/g, "")     // Remove special chars
    .substring(0, 30)               // Limit length

  // Fallback to email if name is empty
  if (!username || username.length === 0) {
    const email = emailAddress || ""
    username = email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 30)
  }

  // Ensure username has at least one letter
  const hasLetter = /[a-z]/.test(username)
  if (!hasLetter) {
    username = `user${username}`
  }

  // Ensure minimum length (4 characters)
  if (username.length < 4) {
    username = username.padEnd(4, "0")
  }

  // Ensure maximum length (64 characters)
  username = username.substring(0, 64)

  return username
}

/**
 * Generates a fallback username with random suffix
 * Used when the primary username is already taken
 */
export function generateFallbackUsername(userData: UserData): string {
  const baseUsername = generateUsername(userData)
  const randomSuffix = Math.floor(Math.random() * 10000).toString()
  return `${baseUsername}${randomSuffix}`.substring(0, 64)
}

/**
 * Validates if a username meets Clerk requirements
 */
export function isValidUsername(username: string): boolean {
  if (!username) return false
  if (username.length < 4 || username.length > 64) return false
  if (!/[a-z]/.test(username)) return false
  if (!/^[a-z0-9]+$/.test(username)) return false
  return true
}
