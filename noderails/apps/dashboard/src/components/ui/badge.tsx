import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[6px] border border-transparent px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary border-primary/20",
        secondary:
          "bg-secondary text-secondary-foreground border-border",
        destructive:
          "bg-destructive-muted text-destructive border-destructive/20",
        success:
          "bg-success-muted text-success border-success/20",
        warning:
          "bg-warning-muted text-warning border-warning/20",
        info:
          "bg-info-muted text-info border-info/20",
        outline:
          "border-border text-foreground",
        ghost: "text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
