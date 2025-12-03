"use client"

import { useState } from "react"
import { useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signUp, isLoaded } = useSignUp()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [usernameValue, setUsernameValue] = useState("")
  const [emailValue, setEmailValue] = useState("")
  const [passwordValue, setPasswordValue] = useState("")
  const [errors, setErrors] = useState<{
    username?: string
    email?: string
    password?: string
  }>({})

  const handleGoogleSignUp = async () => {
    if (!isLoaded) return

    setIsLoading(true)
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback?flow=signup",
        redirectUrlComplete: "/",
      })
    } catch (err: any) {
      console.error("Google signup error:", err)
      setErrors({
        email: "Failed to sign up with Google. Please try again.",
      })
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return

    setIsLoading(true)
    setErrors({})

    const username = usernameValue
    const email = emailValue
    const password = passwordValue

    try {
      await signUp.create({
        username,
        emailAddress: email,
        password,
      })

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })

      router.push("/otp")
    } catch (err: any) {
      console.error("Signup error:", err)
      if (err.errors && err.errors.length > 0) {
        const newErrors: typeof errors = {}
        err.errors.forEach((error: any) => {
          console.log("Processing error:", {
            code: error.code,
            message: error.message,
            paramName: error.meta?.paramName,
          })
          
          switch (error.code) {
            case "form_password_length_too_short":
              newErrors.password = "Password must be at least 8 characters long."
              break
            case "form_password_pwned":
              newErrors.password = "Password is too weak. Please choose a stronger password."
              break
            case "form_identifier_exists":
              // Check paramName to determine if it's email or username
              if (error.meta?.paramName === "username") {
                newErrors.username = "Username is already taken. Please try another."
              } else if (error.meta?.paramName === "email_address") {
                newErrors.email = "Email address is already taken. Please try another."
              } else {
                // Default to email if paramName is not specified
                newErrors.email = "Email address is already taken. Please try another."
              }
              break
            case "form_username_invalid":
            case "form_username_already_exists":
              newErrors.username = "Username is invalid or already taken."
              break
            case "form_param_format_invalid":
              if (error.meta?.paramName === "email_address") {
                newErrors.email = "Please enter a valid email address."
              } else if (error.meta?.paramName === "password") {
                newErrors.password = error.message || "Password format is invalid."
              } else if (error.meta?.paramName === "username") {
                newErrors.username = error.message || "Username format is invalid."
              }
              break
            default:
              const errorMessage = error.message || ""
              const errorCode = error.code || ""
              
              // Check paramName FIRST to accurately identify which field has the error
              if (error.meta?.paramName === "username") {
                newErrors.username = errorMessage || "Username is invalid or already taken."
              } else if (error.meta?.paramName === "email_address") {
                newErrors.email = errorMessage || "Email address is invalid or already taken."
              } else if (error.meta?.paramName === "password") {
                newErrors.password = errorMessage || "Password validation failed. Please check your password."
              }
              // Then check error codes
              else if (
                errorCode.includes("username") ||
                errorMessage.toLowerCase().includes("username")
              ) {
                newErrors.username = errorMessage || "Username is invalid or already taken."
              } else if (
                errorCode.includes("password") ||
                errorMessage.toLowerCase().includes("password")
              ) {
                newErrors.password = errorMessage || "Password validation failed. Please check your password."
              } else if (
                errorCode.includes("email") ||
                errorMessage.toLowerCase().includes("email")
              ) {
                newErrors.email = errorMessage || "An error occurred with your email. Please try again."
              } else if (errorCode.includes("identifier")) {
                // Only check identifier if it's clearly not username-related
                if (!errorMessage.toLowerCase().includes("username")) {
                  newErrors.email = errorMessage || "Email address is invalid or already taken."
                } else {
                  newErrors.username = errorMessage || "Username is invalid or already taken."
                }
              } else {
                console.warn("Unhandled error:", error)
                // Don't default to email - show generic error or log it
                newErrors.email = errorMessage || "An error occurred. Please try again."
              }
          }
        })
        setErrors(newErrors)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Create your account</h1>
                <p className="text-muted-foreground text-sm text-balance">
                  Enter your email below to create your account
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="johndoe"
                  required
                  disabled={isLoading}
                  value={usernameValue}
                  onChange={(e) => setUsernameValue(e.target.value)}
                  aria-invalid={!!errors.username}
                />
                {errors.username && (
                  <FieldDescription className="text-destructive">
                    {errors.username}
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  disabled={isLoading}
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  aria-invalid={!!errors.email}
                />
                {errors.email ? (
                  <FieldDescription className="text-destructive">
                    {errors.email}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    We&apos;ll use this to contact you. We will not share your
                    email with anyone else.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  disabled={isLoading}
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  aria-invalid={!!errors.password}
                />
                {errors.password ? (
                  <FieldDescription className="text-destructive">
                    {errors.password}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    Must be at least 8 characters long.
                  </FieldDescription>
                )}
              </Field>
              <div id="clerk-captcha"/>
              <Field>
                <Button
                  type="submit"
                  disabled={
                    isLoading ||
                    !isLoaded ||
                    !usernameValue.trim() ||
                    !emailValue.trim() ||
                    !passwordValue.trim()
                  }
                >
                  {isLoading ? "Creating Account..." : "Create Account"}
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full"
                  disabled={isLoading || !isLoaded}
                  onClick={handleGoogleSignUp}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="ml-2">
                    {isLoading ? "Signing up with Google..." : "Sign up with Google"}
                  </span>
                </Button>
              </Field>
              <FieldDescription className="text-center">
                Already have an account?{" "}
                <Link href="/log-in" className="text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/"
              alt="Image"
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our{" "}
        <Link href="#" className="underline-offset-4 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="#" className="underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
        .
      </FieldDescription>
    </div>
  )
}
