export type MessageVisibility = "shared" | "internal";

export type MessageAttachmentMetadata = {
  kind: "meta";
  visibility: MessageVisibility;
  label?: string;
};

export function buildMessageMetadata(visibility: MessageVisibility, label?: string) {
  return [{ kind: "meta", visibility, label }] as const;
}

export function getMessageVisibility(attachments: unknown): MessageVisibility {
  if (!Array.isArray(attachments)) return "shared";
  const meta = attachments.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).kind === "meta") as Record<string, unknown> | undefined;
  return meta?.visibility === "internal" ? "internal" : "shared";
}

export function isInternalMessage(attachments: unknown) {
  return getMessageVisibility(attachments) === "internal";
}
