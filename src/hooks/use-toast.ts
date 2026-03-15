import { toast as sonnerToast } from "sonner";

interface ToastParams {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

/**
 * Compatibility shim: translates the old Radix toast API
 * (`toast({ title, description, variant })`) to sonner calls.
 */
function toast(params: ToastParams) {
  const message = params.title ?? "";
  const options = params.description ? { description: params.description } : undefined;

  if (params.variant === "destructive") {
    sonnerToast.error(message, options);
  } else {
    sonnerToast(message, options);
  }
}

function useToast() {
  return { toast };
}

export { useToast, toast };
