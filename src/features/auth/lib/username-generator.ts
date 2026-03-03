export interface UserData {
  firstName?: string | null
  lastName?: string | null
  fullName?: string
  emailAddress?: string | null
}

export function generateUsername(userData: UserData): string {
  const { firstName, lastName, fullName, emailAddress } = userData

  const nameToUse = fullName || 
    (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || "")

  let username = nameToUse
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 30)

  if (!username || username.length === 0) {
    const email = emailAddress || ""
    username = email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 30)
  }

  const hasLetter = /[a-z]/.test(username)
  if (!hasLetter) {
    username = `user${username}`
  }

  if (username.length < 4) {
    username = username.padEnd(4, "0")
  }

  username = username.substring(0, 64)

  return username
}

export function generateFallbackUsername(userData: UserData): string {
  const baseUsername = generateUsername(userData)
  const randomSuffix = Math.floor(Math.random() * 10000).toString()
  return `${baseUsername}${randomSuffix}`.substring(0, 64)
}

export function isValidUsername(username: string): boolean {
  if (!username) return false
  if (username.length < 4 || username.length > 64) return false
  if (!/[a-z]/.test(username)) return false
  if (!/^[a-z0-9]+$/.test(username)) return false
  return true
}
