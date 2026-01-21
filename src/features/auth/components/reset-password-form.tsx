"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Eye, EyeOff } from "lucide-react"
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
import { useResetPassword } from "../hooks/use-reset-password"

export function ResetPasswordForm({ className, ...props }: React.ComponentProps<"div">) {
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    isLoaded,
    isLoading,
    error,
    codeError,
    passwordError,
    secondFactor,
    resetPassword,
    handleResend,
    clearCodeError,
    clearPasswordError,
  } = useResetPassword()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await resetPassword(code, password, confirmPassword)
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
                    if (codeError) {
                      clearCodeError()
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
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your new password"
                    required
                    disabled={isLoading || !isLoaded}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (passwordError) {
                        clearPasswordError()
                      }
                    }}
                    aria-invalid={!!passwordError}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading || !isLoaded}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
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
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your new password"
                    required
                    disabled={isLoading || !isLoaded}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (passwordError && e.target.value === password) {
                        clearPasswordError()
                      }
                    }}
                    aria-invalid={!!passwordError}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading || !isLoaded}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
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
              {error && (
                <Field>
                  <FieldDescription className="text-center text-destructive">
                    {error}
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
