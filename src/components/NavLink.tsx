import { NavLink as RouterNavLink, type NavLinkProps as RouterNavLinkProps } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NavLinkProps extends Omit<RouterNavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
}

export function NavLink({ className, activeClassName, ...props }: NavLinkProps) {
  return (
    <RouterNavLink
      {...props}
      className={({ isActive }) => cn(className, isActive && activeClassName)}
    />
  );
}
