"use client"

import { useState } from "react"
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { useOTPVerification } from "../hooks/use-otp-verification"

// OTP UI rendered by `/otp`. It is used only after email sign-up has created a
// pending Clerk sign-up and sent an email code.
export function OTPForm({ className, ...props }: React.ComponentProps<"div">) {
  // Controlled value for the six-digit OTP input.
  const [code, setCode] = useState("")
  // Hook verifies the code, resends codes, and redirects invalid sign-up states
  // back to `/sign-up`.
  const { isLoaded, isLoading, error, verifyCode, resendCode } = useOTPVerification()

  // Completes email verification for the pending Clerk sign-up.
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await verifyCode(code)
  }

  // Requests a fresh email code from Clerk and clears the old input.
  const handleResend = async () => {
    const success = await resendCode()
    if (success) {
      setCode("")
    }
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
                <h1 className="text-2xl font-bold">Enter verification code</h1>
                <p className="text-muted-foreground text-sm text-balance">
                  We sent a 6-digit code to your email
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="otp" className="sr-only">
                  Verification code
                </FieldLabel>
                <InputOTP
                  maxLength={6}
                  id="otp"
                  value={code}
                  onChange={setCode}
                  required
                  containerClassName="gap-4"
                  disabled={isLoading || !isLoaded}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                {error ? (
                  <FieldDescription className="text-center text-destructive">
                    {error}
                  </FieldDescription>
                ) : (
                <FieldDescription className="text-center">
                  Enter the 6-digit code sent to your email.
                </FieldDescription>
                )}
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading || !isLoaded || code.length !== 6}>
                  {isLoading ? "Verifying..." : "Verify"}
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
