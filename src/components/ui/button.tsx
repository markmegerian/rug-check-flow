import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(180deg,hsl(var(--primary)),hsl(217 78% 48%))] text-primary-foreground shadow-[0_18px_36px_-22px_hsl(var(--primary)/0.55)] hover:brightness-[1.03] hover:shadow-[0_22px_42px_-22px_hsl(var(--primary)/0.6)]",
        destructive: "bg-[linear-gradient(180deg,hsl(var(--destructive)),hsl(4 76% 48%))] text-destructive-foreground shadow-[0_18px_36px_-22px_hsl(var(--destructive)/0.45)] hover:brightness-[1.03]",
        outline: "border border-border/80 bg-white/85 text-foreground shadow-[0_12px_28px_-22px_rgba(15,23,42,0.22)] hover:border-primary/25 hover:bg-accent/70 hover:text-accent-foreground",
        secondary: "bg-secondary/90 text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:bg-secondary",
        ghost: "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3.5 text-[13px]",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
