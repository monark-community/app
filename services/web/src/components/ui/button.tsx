import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `cursor-pointer` is opinionated against the Tailwind v4 / native-button
  // default of `cursor: default`. Buttons are clearly clickable in a web
  // context and reading "this is interactive" off the cursor matches user
  // expectations across the rest of the web. `disabled:pointer-events-none`
  // already nukes hover, so the disabled state doesn't need its own cursor.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // `min-h-11` (and `min-w-11` for icon buttons) enforces a ~44px touch
      // target on the mobile viewport (`max-md`) AND on touch/pen pointers
      // (`pointer-coarse`) — so a narrow window / devtools mobile view matches a
      // real phone, while a desktop mouse keeps the compact 36px density. `min-*`
      // (not `h-*`) so an explicit `className` height (e.g. a `h-7` row-action
      // button) still shrinks the *visual* size on desktop but the tap area
      // floors at 44px on mobile/touch.
      size: {
        default: "h-9 px-4 py-2 max-md:min-h-11 pointer-coarse:min-h-11",
        sm: "h-8 rounded-md px-3 text-xs max-md:min-h-11 pointer-coarse:min-h-11",
        lg: "h-10 rounded-md px-8 max-md:min-h-11 pointer-coarse:min-h-11",
        icon: "h-9 w-9 max-md:min-h-11 max-md:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
