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
import { Input } from "@/components/ui/input"
import { useForgotPassword } from "../hooks/use-forgot-password"

export function ForgotPasswordForm({ className, ...props }: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const { isLoaded, isLoading, error, sendResetCode, clearError } = useForgotPassword()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await sendResetCode(email)
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
                  Enter your email address and we&apos;ll send you a code to reset your password
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email address</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  disabled={isLoading || !isLoaded}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) {
                      clearError()
                    }
                  }}
                  aria-invalid={!!error}
                />
                {error ? (
                  <FieldDescription className="text-destructive">
                    {error}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    Enter the email address associated with your account.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading || !isLoaded || !email.trim()}>
                  {isLoading ? "Sending..." : "Send code"}
                </Button>
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
