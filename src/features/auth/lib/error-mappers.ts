export type FieldErrors = {
  [key: string]: string
}

// Converts Clerk login API errors into field-level errors for the custom login
// form. This keeps Clerk's raw error codes out of the UI and lets the component
// show messages next to the identifier/password fields.
export function mapLoginErrors(errors: any[]): {
  fieldErrors: FieldErrors
  formError: string | null
} {
  const fieldErrors: FieldErrors = {}
  let formError: string | null = null

  errors.forEach((error: any) => {
    // Clerk sends stable error codes. The switch groups codes that should be
    // shown to the user in the same way.
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

// Converts Clerk sign-up errors into username, email and password messages. The
// app requires a game username, so username-specific Clerk errors are mapped
// separately from email errors.
export function mapSignupErrors(errors: any[]): {
  fieldErrors: FieldErrors
  formError: string | null
} {
  const fieldErrors: FieldErrors = {}
  let formError: string | null = null

  errors.forEach((error: any) => {
    const errorMessage = error.message || ""
    const errorCode = error.code || ""

    // Some Clerk errors are field-specific through `meta.paramName`; the mapper
    // uses that metadata when available and falls back to code/message checks.
    switch (error.code) {
      case "form_password_length_too_short":
        fieldErrors.password = "Password must be at least 8 characters long."
        break
      case "form_password_pwned":
        fieldErrors.password = "Password is too weak. Please choose a stronger password."
        break
      case "form_identifier_exists":
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
        if (error.meta?.paramName === "username") {
          fieldErrors.username = errorMessage || "Username is invalid or already taken."
        } else if (error.meta?.paramName === "email_address") {
          fieldErrors.email = errorMessage || "Email address is invalid or already taken."
        } else if (error.meta?.paramName === "password") {
          fieldErrors.password = errorMessage || "Password validation failed. Please check your password."
        } else if (
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

// Password reset returns both code and password validation errors through the
// sign-in resource. This mapper separates them so the reset form can display
// the error beside the correct input.
export function mapPasswordResetErrors(errors: any[]): {
  codeError: string | null
  passwordError: string | null
  formError: string | null
} {
  const error = errors[0]
  const errorMessage = error?.longMessage || error?.message || "Invalid code or password. Please try again."

  if (error?.code === "form_code_incorrect" || errorMessage.toLowerCase().includes("code") || errorMessage.toLowerCase().includes("verification")) {
    return { codeError: errorMessage, passwordError: null, formError: null }
  }

  if (error?.code?.includes("password") || errorMessage.toLowerCase().includes("password") || errorMessage.toLowerCase().includes("special")) {
    return { codeError: null, passwordError: errorMessage, formError: null }
  }

  return { codeError: null, passwordError: null, formError: errorMessage }
}

// Used by OTP and password reset flows. If Clerk says the temporary auth flow
// has expired, the app redirects the user to restart the flow.
export function isSessionExpired(errors: any[]): boolean {
  return errors.some((e: any) => 
    e.code === "session_expired" || e.code === "form_identifier_not_found"
  )
}

// Shared fallback mapper for errors that are not tied to one specific field.
export function mapGenericError(err: any): string {
  if (err.errors && err.errors.length > 0) {
    const errorMessage = err.errors[0]?.longMessage || err.errors[0]?.message
    return errorMessage || "An error occurred. Please try again."
  }
  return "An error occurred. Please try again."
}
