"use client"

import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
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
import Link from "next/link"
export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signIn, isLoaded, setActive } = useSignIn()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [identifierValue, setIdentifierValue] = useState("")
  const [passwordValue, setPasswordValue] = useState("")
  const [errors, setErrors] = useState<{
    identifier?: string
    password?: string
  }>({})
  const [formError, setFormError] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    if (!isLoaded) return

    setIsLoading(true)
    setFormError(null)
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback?flow=login",
        redirectUrlComplete: "/",
      })
    } catch (err: any) {
      console.error("Google signin error:", err)
      setFormError("Failed to sign in with Google. Please try again.")
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded) return

    setIsLoading(true)
    setErrors({})
    setFormError(null)

    const identifier = identifierValue
    const password = passwordValue

    try {
      const result = await signIn.create({
        identifier,
        password,
      })

      if (result.status === "needs_second_factor") {
        setFormError("Two-factor authentication is required. Please complete the verification.")
        return
      }

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        
        router.push("/")
        window.location.href = "/"
      } else {
        setFormError("Sign in incomplete. Please try again.")
      }
    } catch (err: any) {
      console.error("Login error:", err)
      
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setFormError("Network error. Please check your connection and try again.")
        setIsLoading(false)
        return
      }

      if (err.errors && err.errors.length > 0) {
        const newErrors: typeof errors = {}
        err.errors.forEach((error: any) => {
          switch (error.code) {
            case "form_identifier_not_found":
            case "form_password_incorrect":
              newErrors.identifier = "Invalid email/username or password."
              newErrors.password = "Invalid email/username or password."
              break
            case "form_password_length_too_short":
              newErrors.password = "Password is too short."
              break
            case "form_param_format_invalid":
              if (error.meta?.paramName === "identifier") {
                newErrors.identifier = "Please enter a valid email or username."
              }
              break
            default:
              // Set as form-level error for unhandled errors
              setFormError(error.message || "An error occurred. Please try again.")
          }
        })
        setErrors(newErrors)
      } else {
        // No specific errors, show general form error
        setFormError("An error occurred. Please try again.")
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
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-muted-foreground text-balance">
                  Login to your Acme Inc account
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="identifier">Email or Username</FieldLabel>
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  placeholder="m@example.com or johndoe"
                  required
                  disabled={isLoading}
                  value={identifierValue}
                  onChange={(e) => setIdentifierValue(e.target.value)}
                  aria-invalid={!!errors.identifier}
                />
                {errors.identifier && (
                  <FieldDescription className="text-destructive">
                    {errors.identifier}
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    href="/forgot-password"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
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
                {errors.password && (
                  <FieldDescription className="text-destructive">
                    {errors.password}
                  </FieldDescription>
                )}
              </Field>
              <div id="clerk-captcha" />
              <Field>
                <Button
                  type="submit"
                  disabled={
                    isLoading || !isLoaded || !identifierValue.trim() || !passwordValue.trim()
                  }
                >
                  {isLoading ? "Logging in..." : "Login"}
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
                  onClick={handleGoogleSignIn}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="ml-2">
                    {isLoading ? "Logging in with Google..." : "Login with Google"}
                  </span>
                </Button>
              </Field>
              {formError && (
                <Field>
                  <FieldDescription className="text-destructive text-center">
                    {formError}
                  </FieldDescription>
                </Field>
              )}
              <FieldDescription className="text-center">
                Don&apos;t have an account?{" "}
                <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
                  Sign up
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
