// Minimal profile data Clerk may provide after OAuth. Google accounts may have
// names, but the code also supports email-only data.
export interface UserData {
  firstName?: string | null
  lastName?: string | null
  fullName?: string
  emailAddress?: string | null
}

// Generates the required game username for OAuth sign-up. Clerk can return a
// Google sign-up that is missing a username, so the SSO callback fills it in
// automatically before completing the account.
export function generateUsername(userData: UserData): string {
  const { firstName, lastName, fullName, emailAddress } = userData

  // Prefer a real display name when available because it creates a readable
  // username, then fall back to one name field, then to email below.
  const nameToUse = fullName || 
    (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || "")

  // Clerk usernames must be safe identifiers. This normalises to lowercase,
  // removes spaces and non-alphanumeric characters, and caps the initial length.
  let username = nameToUse
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 30)

  // If the OAuth provider did not provide a usable name, derive a username from
  // the email prefix.
  if (!username || username.length === 0) {
    const email = emailAddress || ""
    username = email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 30)
  }

  // Ensure there is at least one letter so the generated username is not only a
  // number.
  const hasLetter = /[a-z]/.test(username)
  if (!hasLetter) {
    username = `user${username}`
  }

  // Clerk requires usernames to meet a minimum length. Padding keeps the
  // generated value deterministic where possible.
  if (username.length < 4) {
    username = username.padEnd(4, "0")
  }

  // Clerk usernames are capped to 64 characters.
  username = username.substring(0, 64)

  return username
}

// Adds a random suffix if the first generated username is unavailable or fails
// Clerk validation. Used as a retry/fallback inside the SSO callback.
export function generateFallbackUsername(userData: UserData): string {
  const baseUsername = generateUsername(userData)
  const randomSuffix = Math.floor(Math.random() * 10000).toString()
  return `${baseUsername}${randomSuffix}`.substring(0, 64)
}

// Local validator for generated usernames. The final source of truth is still
// Clerk, but this captures the format expected by the generator.
export function isValidUsername(username: string): boolean {
  if (!username) return false
  if (username.length < 4 || username.length > 64) return false
  if (!/[a-z]/.test(username)) return false
  if (!/^[a-z0-9]+$/.test(username)) return false
  return true
}
