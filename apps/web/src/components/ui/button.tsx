import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:ring-offset-2 active:translate-y-px cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-blue text-white border border-blue hover:bg-blue-deep hover:border-blue-deep shadow-[3px_3px_0_0_var(--color-blue-soft)] hover:shadow-[1px_1px_0_0_var(--color-blue-soft)]",
        outline:
          "border border-blue/40 bg-white text-blue hover:bg-blue-wash hover:border-blue",
        ghost: "text-blue hover:bg-blue-wash",
        danger:
          "bg-blue-ink text-white border border-blue-ink hover:bg-blue-deep shadow-[3px_3px_0_0_var(--color-blue-soft)] hover:shadow-[1px_1px_0_0_var(--color-blue-soft)]",
        quiet:
          "text-blue-mid underline decoration-dotted underline-offset-4 hover:text-blue",
        inverse:
          "bg-white text-blue border border-white hover:bg-blue-wash shadow-[3px_3px_0_0_rgba(255,255,255,0.35)] hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.35)]",
      },
      size: {
        default: "h-10 px-5 py-2 rounded-none",
        sm: "h-8 px-3.5 text-[12.5px] rounded-none",
        lg: "h-12 px-7 text-[15px] rounded-none",
        icon: "h-9 w-9 rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { Button, buttonVariants };
