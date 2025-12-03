"use client"

import { useState, useEffect } from "react"
import { useSignUp } from "@clerk/nextjs"
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export function OTPForm({ className, ...props }: React.ComponentProps<"div">) {
  const { signUp, isLoaded } = useSignUp()
  const router = useRouter()
  const [code, setCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    if (isLoaded) {
      if (!signUp || signUp.status === null || signUp.status !== "missing_requirements") {
        router.push("/sign-up")
      }
    }
  }, [isLoaded, signUp, router])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isLoaded || !signUp) {
      setError("Please start the signup process first.")
      router.push("/sign-up")
      return
    }

    if (code.length !== 6) {
      setError("Please enter a 6-digit code")
      return
    }

    if (signUp.status !== "missing_requirements") {
      setError("Please start the signup process first.")
      router.push("/sign-up")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === "complete") {
        await new Promise((resolve) => setTimeout(resolve, 500))
        window.location.href = "/"
      } else {
        setError("Verification incomplete. Please try again.")
      }
    } catch (err: any) {
      console.error("OTP verification error:", err)
      
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setError("Network error. Please check your connection and try again.")
        return
      }

      // Handle expired session
      if (err.errors && err.errors.some((e: any) => e.code === "session_expired" || e.code === "form_identifier_not_found")) {
        setError("Your session has expired. Please start over.")
        setTimeout(() => {
          router.push("/sign-up")
        }, 2000)
        return
      }

      if (err.errors && err.errors.length > 0) {
        const errorMessage = err.errors[0]?.message || "Invalid code. Please try again."
        setError(errorMessage)
      } else {
        setError("An error occurred. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!isLoaded || !signUp) {
      setError("Please start the signup process first.")
      router.push("/sign-up")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })
      setCode("")
      setError("")
    } catch (err: any) {
      console.error("Resend error:", err)
      
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setError("Network error. Please check your connection and try again.")
        return
      }

      if (err.errors && err.errors.some((e: any) => e.code === "session_expired" || e.code === "form_identifier_not_found")) {
        setError("Your session has expired. Please start over.")
        setTimeout(() => {
          router.push("/sign-up")
        }, 2000)
        return
      }

      setError("Failed to resend code. Please try again.")
    } finally {
      setIsLoading(false)
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
