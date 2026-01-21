/**
 * Maps Clerk API errors to user-friendly error messages
 */

import { isNetworkError as checkNetworkError } from "./validators"

export type FieldErrors = {
  [key: string]: string
}

export const isNetworkError = checkNetworkError

export function mapLoginErrors(errors: any[]): {
  fieldErrors: FieldErrors
  formError: string | null
} {
  const fieldErrors: FieldErrors = {}
  let formError: string | null = null

  errors.forEach((error: any) => {
    switch (error.code) {
      case "form_identifier_not_found":
      case "form_password_incorrect":
        fieldErrors.identifier = "Invalid email/username or password."
        fieldErrors.password = "Invalid email/username or password."
        break
      case "form_password_length_too_short":
        fieldErrors.password = "Password is too short."
        break
      case "form_param_format_invalid":
        if (error.meta?.paramName === "identifier") {
          fieldErrors.identifier = "Please enter a valid email or username."
        }
        break
      default:
        formError = error.message || "An error occurred. Please try again."
    }
  })

  return { fieldErrors, formError }
}

export function mapSignupErrors(errors: any[]): {
  fieldErrors: FieldErrors
  formError: string | null
} {
  const fieldErrors: FieldErrors = {}
  let formError: string | null = null

  errors.forEach((error: any) => {
    const errorMessage = error.message || ""
    const errorCode = error.code || ""

    switch (error.code) {
      case "form_password_length_too_short":
        fieldErrors.password = "Password must be at least 8 characters long."
        break
      case "form_password_pwned":
        fieldErrors.password = "Password is too weak. Please choose a stronger password."
        break
      case "form_identifier_exists":
        // Check paramName to determine if it's email or username
        if (error.meta?.paramName === "username") {
          fieldErrors.username = "Username is already taken. Please try another."
        } else if (error.meta?.paramName === "email_address") {
          fieldErrors.email = "Email address is already taken. Please try another."
        } else {
          fieldErrors.email = "Email address is already taken. Please try another."
        }
        break
      case "form_username_invalid":
      case "form_username_already_exists":
        fieldErrors.username = "Username is invalid or already taken."
        break
      case "form_param_format_invalid":
        if (error.meta?.paramName === "email_address") {
          fieldErrors.email = "Please enter a valid email address."
        } else if (error.meta?.paramName === "password") {
          fieldErrors.password = errorMessage || "Password format is invalid."
        } else if (error.meta?.paramName === "username") {
          fieldErrors.username = errorMessage || "Username format is invalid."
        }
        break
      default:
        // Check paramName FIRST to accurately identify which field has the error
        if (error.meta?.paramName === "username") {
          fieldErrors.username = errorMessage || "Username is invalid or already taken."
        } else if (error.meta?.paramName === "email_address") {
          fieldErrors.email = errorMessage || "Email address is invalid or already taken."
        } else if (error.meta?.paramName === "password") {
          fieldErrors.password = errorMessage || "Password validation failed. Please check your password."
        }
        // Then check error codes
        else if (
          errorCode.includes("username") ||
          errorMessage.toLowerCase().includes("username")
        ) {
          fieldErrors.username = errorMessage || "Username is invalid or already taken."
        } else if (
          errorCode.includes("password") ||
          errorMessage.toLowerCase().includes("password")
        ) {
          fieldErrors.password = errorMessage || "Password validation failed. Please check your password."
        } else if (
          errorCode.includes("email") ||
          errorMessage.toLowerCase().includes("email")
        ) {
          fieldErrors.email = errorMessage || "An error occurred with your email. Please try again."
        } else if (errorCode.includes("identifier")) {
          // Only check identifier if it's clearly not username-related
          if (!errorMessage.toLowerCase().includes("username")) {
            fieldErrors.email = errorMessage || "Email address is invalid or already taken."
          } else {
            fieldErrors.username = errorMessage || "Username is invalid or already taken."
          }
        } else {
          console.warn("Unhandled error:", error)
          formError = errorMessage || "An error occurred. Please try again."
        }
    }
  })

  return { fieldErrors, formError }
}

export function mapPasswordResetErrors(errors: any[]): {
  codeError: string | null
  passwordError: string | null
  formError: string | null
} {
  const error = errors[0]
  const errorMessage = error?.longMessage || error?.message || "Invalid code or password. Please try again."

  // Check if it's a code-related error
  if (error?.code === "form_code_incorrect" || errorMessage.toLowerCase().includes("code") || errorMessage.toLowerCase().includes("verification")) {
    return { codeError: errorMessage, passwordError: null, formError: null }
  }

  // Check if it's a password-related error
  if (error?.code?.includes("password") || errorMessage.toLowerCase().includes("password") || errorMessage.toLowerCase().includes("special")) {
    return { codeError: null, passwordError: errorMessage, formError: null }
  }

  return { codeError: null, passwordError: null, formError: errorMessage }
}

export function isSessionExpired(errors: any[]): boolean {
  return errors.some((e: any) => 
    e.code === "session_expired" || e.code === "form_identifier_not_found"
  )
}

export function mapGenericError(err: any): string {
  if (err.errors && err.errors.length > 0) {
    const errorMessage = err.errors[0]?.longMessage || err.errors[0]?.message
    return errorMessage || "An error occurred. Please try again."
  }
  return "An error occurred. Please try again."
}
