import type { Tables } from "@/integrations/supabase/types";

type ThreadType = Tables<"message_threads">["thread_type"];

export function getThreadComposerPlaceholder(params: {
  threadType: ThreadType;
  entityLabel?: string | null;
  perspective: "office" | "portal";
}) {
  const label = params.entityLabel ? ` about ${params.entityLabel}` : "";
  if (params.perspective === "office") {
    switch (params.threadType) {
      case "estimate":
        return `Write a reply${label} for the client…`;
      case "invoice":
        return `Write a billing reply${label}…`;
      default:
        return "Write a reply…";
    }
  }

  switch (params.threadType) {
    case "estimate":
      return `Ask a question${label}…`;
    case "invoice":
      return `Ask about billing${label}…`;
    default:
      return "Write a message to the office team…";
  }
}

export function getThreadSummaryLabel(params: {
  threadType: ThreadType;
  entityLabel?: string | null;
  perspective: "office" | "portal";
}) {
  const base = params.entityLabel ? `${params.threadType} · ${params.entityLabel}` : params.threadType;
  return params.perspective === "office"
    ? `Client conversation · ${base}`
    : `Messages sync with the office inbox · ${base}.`;
}
