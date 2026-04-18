"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" disabled>
        <Sun className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  const setThemeWithTransition = (
    theme: "light" | "dark",
    event?: React.MouseEvent<HTMLElement>
  ) => {
    const root = document.documentElement
    const supportsViewTransition =
      "startViewTransition" in document &&
      typeof document.startViewTransition === "function"
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    if (event) {
      root.style.setProperty("--x", `${event.clientX}px`)
      root.style.setProperty("--y", `${event.clientY}px`)
    } else {
      root.style.removeProperty("--x")
      root.style.removeProperty("--y")
    }

    if (!supportsViewTransition || prefersReducedMotion) {
      setTheme(theme)
      return
    }

    document.startViewTransition(() => {
      setTheme(theme)
    })
  }

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark"
    setThemeWithTransition(nextTheme, event)
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative rounded-full"
      onClick={handleToggle}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
