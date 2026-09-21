"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Toasts.
 *
 * The theme is pinned to "light" rather than followed from next-themes.
 *
 * There is no ThemeProvider mounted anywhere in this app, so `useTheme()`
 * always returned undefined and the default kicked in — "system". Sonner then
 * resolved that against the operating system, so anyone whose machine is in
 * dark mode got `data-sonner-theme="dark"` and with it sonner's dark text
 * colours: descriptions at hsl(0,0%,91%). The background, meanwhile, comes from
 * this app's own `--popover`, which is white because nothing ever applies the
 * `.dark` class. White card, 91%-grey text — the description was invisible on
 * every toast that had one, not just this one.
 *
 * If dark mode is ever wired up properly, switch this back to the resolved
 * theme; the description colour below already follows the app's own tokens and
 * will flip with it.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Stated in the app's own tokens rather than left to sonner. Passing
          // classNames makes sonner mark the toast data-styled="false", which
          // drops its own colour rules — so the description needs a colour from
          // somewhere, and taking it from here means it tracks the app instead
          // of the operating system.
          title: "text-popover-foreground font-semibold",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
