import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-primary/25 bg-[linear-gradient(180deg,hsl(var(--primary)/0.18),hsl(217_82%_56%/0.28))] text-[hsl(221_70%_22%)] shadow-[0_18px_36px_-22px_hsl(var(--primary)/0.28)] hover:bg-[linear-gradient(180deg,hsl(var(--primary)/0.24),hsl(217_82%_56%/0.34))] dark:border-primary/30 dark:bg-[linear-gradient(180deg,hsl(var(--primary)/0.28),hsl(217_82%_56%/0.4))] dark:text-[hsl(210_40%_96%)] dark:hover:bg-[linear-gradient(180deg,hsl(var(--primary)/0.34),hsl(217_82%_56%/0.46))]",
        destructive: "border border-red-300/80 bg-[linear-gradient(180deg,rgba(254,226,226,0.98),rgba(254,202,202,0.96))] text-[hsl(0_72%_30%)] shadow-[0_18px_36px_-22px_hsl(var(--destructive)/0.2)] hover:bg-[linear-gradient(180deg,rgba(254,220,220,1),rgba(252,186,186,0.98))] dark:border-red-800/80 dark:bg-[linear-gradient(180deg,rgba(127,29,29,0.88),rgba(153,27,27,0.9))] dark:text-[hsl(0_0%_98%)] dark:hover:bg-[linear-gradient(180deg,rgba(153,27,27,0.96),rgba(185,28,28,0.96))]",
        outline: "border border-primary/20 bg-primary/10 text-[hsl(221_70%_24%)] shadow-[0_12px_28px_-22px_rgba(37,99,235,0.24)] hover:border-primary/30 hover:bg-primary/14 hover:text-[hsl(221_70%_20%)] dark:border-primary/25 dark:bg-primary/20 dark:text-[hsl(210_40%_96%)] dark:hover:bg-primary/26",
        secondary: "border border-slate-300/80 bg-slate-100 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
        ghost: "text-[hsl(221_45%_32%)] hover:bg-primary/10 hover:text-[hsl(221_70%_24%)] dark:text-slate-200 dark:hover:bg-primary/16 dark:hover:text-white",
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
