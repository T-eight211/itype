"use client"

import { useState, useEffect } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export function ResetPasswordForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter()
  const { isLoaded, signIn, setActive } = useSignIn()
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [codeError, setCodeError] = useState<string>("")
  const [passwordError, setPasswordError] = useState<string>("")
  const [secondFactor, setSecondFactor] = useState(false)

  useEffect(() => {
    if (isLoaded && signIn) {
      // If signIn doesn't have the right status, redirect to forgot password
      if (signIn.status !== "needs_first_factor") {
        router.push("/forgot-password")
      }
    }
  }, [isLoaded, signIn, router])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (!isLoaded || !signIn) {
      setError("Please wait while we initialize...")
      return
    }

    if (signIn.status !== "needs_first_factor") {
      setError("Please start the password reset process first.")
      router.push("/forgot-password")
      return
    }

    // Clear previous errors
    setCodeError("")
    setPasswordError("")
    setError("")

    if (code.length !== 6) {
      setCodeError("Please enter a 6-digit code")
      return
    }

    if (!password.trim()) {
      setPasswordError("Please enter a password")
      return
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long")
      return
    }

    // Check for special characters
    const specialChars = /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/
    if (!specialChars.test(password)) {
      setPasswordError('Passwords must contain at least one of the following special characters: !"#$%&\'()*+,-./:;<=>?@[]^_`{|}~.')
      return
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match")
      return
    }

    setIsLoading(true)
    setError("")
    setCodeError("")
    setPasswordError("")

    try {
      // Reset the user's password using the code
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      })

      // Check if 2FA is required
      if (result.status === "needs_second_factor") {
        setSecondFactor(true)
        setError("Two-factor authentication is required. This UI does not handle 2FA.")
        return
      }

      if (result.status === "complete") {
        // Set the active session to the newly created session (user is now signed in)
        if (result.createdSessionId) {
          await setActive({
            session: result.createdSessionId,
            navigate: async ({ session }) => {
              if (session?.currentTask) {
                // Check for tasks and navigate to custom UI to help users resolve them
                console.log(session?.currentTask)
                return
              }
              router.push("/")
            },
          })
        } else {
          router.push("/")
        }
        setError("")
      } else {
        setError("Password reset incomplete. Please try again.")
      }
    } catch (err: any) {
      console.error("Password reset error:", err)
      
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setError("Network error. Please check your connection and try again.")
        return
      }

      // Handle expired session
      if (err.errors && err.errors.some((e: any) => e.code === "session_expired" || e.code === "form_identifier_not_found")) {
        setError("Your session has expired. Please start over.")
        setTimeout(() => {
          router.push("/forgot-password")
        }, 2000)
        return
      }

      if (err.errors && err.errors.length > 0) {
        const error = err.errors[0]
        const errorMessage = error?.longMessage || error?.message || "Invalid code or password. Please try again."
        
        // Check if it's a code-related error
        if (error?.code === "form_code_incorrect" || errorMessage.toLowerCase().includes("code") || errorMessage.toLowerCase().includes("verification")) {
          setCodeError(errorMessage)
        } 
        // Check if it's a password-related error
        else if (error?.code?.includes("password") || errorMessage.toLowerCase().includes("password") || errorMessage.toLowerCase().includes("special")) {
          setPasswordError(errorMessage)
        } else {
          setError(errorMessage)
        }
      } else {
        setError("An error occurred. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = () => {
    // Redirect to forgot password page to start over
    router.push("/forgot-password")
  }

  return (
    <div
      className={cn("flex flex-col gap-6 md:min-h-[450px]", className)}
      {...props}
    >
      <Card className="flex-1 overflow-hidden p-0">
        <CardContent className="grid flex-1 p-0 md:grid-cols-2">
          <form
            className="flex flex-col items-center justify-center p-6 md:p-8"
            onSubmit={handleSubmit}
          >
            <FieldGroup>
              <Field className="items-center text-center">
                <h1 className="text-2xl font-bold">Reset your password</h1>
                <p className="text-muted-foreground text-sm text-balance">
                  Enter the code sent to your email and your new password
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="code" className="sr-only">
                  Verification code
                </FieldLabel>
                <InputOTP
                  maxLength={6}
                  id="code"
                  value={code}
                  onChange={(value) => {
                    setCode(value)
                    // Clear code error when user starts typing
                    if (codeError) {
                      setCodeError("")
                    }
                  }}
                  required
                  containerClassName="gap-4"
                  disabled={isLoading || !isLoaded}
                  aria-invalid={!!codeError}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} aria-invalid={!!codeError} />
                    <InputOTPSlot index={1} aria-invalid={!!codeError} />
                    <InputOTPSlot index={2} aria-invalid={!!codeError} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} aria-invalid={!!codeError} />
                    <InputOTPSlot index={4} aria-invalid={!!codeError} />
                    <InputOTPSlot index={5} aria-invalid={!!codeError} />
                  </InputOTPGroup>
                </InputOTP>
                {codeError ? (
                  <FieldDescription className="text-center text-destructive">
                    {codeError}
                  </FieldDescription>
                ) : (
                  <FieldDescription className="text-center">
                    Enter the 6-digit code sent to your email.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="password">New password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your new password"
                  required
                  disabled={isLoading || !isLoaded}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    // Clear password error when user starts typing
                    if (passwordError) {
                      setPasswordError("")
                    }
                  }}
                  aria-invalid={!!passwordError}
                />
                {passwordError ? (
                  <FieldDescription className="text-destructive">
                    {passwordError}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    Password must be at least 8 characters long and contain at least one special character.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm your new password"
                  required
                  disabled={isLoading || !isLoaded}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    // Clear password error when user starts typing if passwords match
                    if (passwordError && e.target.value === password) {
                      setPasswordError("")
                    }
                  }}
                  aria-invalid={!!passwordError}
                />
                {passwordError && password !== confirmPassword ? (
                  <FieldDescription className="text-destructive">
                    {passwordError}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    Re-enter your password to confirm.
                  </FieldDescription>
                )}
              </Field>
              {secondFactor && (
                <Field>
                  <FieldDescription className="text-center text-destructive">
                    Two-factor authentication is required, but this UI does not handle that.
                  </FieldDescription>
                </Field>
              )}
              <Field>
                <Button 
                  type="submit" 
                  disabled={isLoading || !isLoaded || code.length !== 6 || !password.trim() || !confirmPassword.trim()}
                >
                  {isLoading ? "Resetting..." : "Reset password"}
                </Button>
                <FieldDescription className="text-center">
                  Didn&apos;t receive the code?{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading || !isLoaded}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Resend
                  </button>
                </FieldDescription>
                <FieldDescription className="text-center">
                  Remember your password?{" "}
                  <Link
                    href="/log-in"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Back to login
                  </Link>
                </FieldDescription>
              </Field>
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
      <FieldDescription className="text-center">
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

