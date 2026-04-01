import type { Tables } from "@/integrations/supabase/types";

type ThreadStatus = Tables<"message_threads">["status"];
type Sender = Tables<"messages">["sender"];

export type ThreadLifecycleView = {
  unread: boolean;
  latestInboundAt: string | null;
  latestMessageAt: string | null;
};

export function deriveThreadLifecycle(params: {
  messages: Array<{ created_at: string; sender: Sender | null }>;
  selfSender: Sender;
}) : ThreadLifecycleView {
  const sorted = [...params.messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const latestMessageAt = sorted.at(-1)?.created_at ?? null;
  const latestInbound = [...sorted].reverse().find((message) => (message.sender ?? "system") !== params.selfSender);
  const latestOutbound = [...sorted].reverse().find((message) => message.sender === params.selfSender);
  const latestInboundAt = latestInbound?.created_at ?? null;
  const latestOutboundAt = latestOutbound?.created_at ?? null;

  return {
    unread: Boolean(latestInboundAt && (!latestOutboundAt || +new Date(latestInboundAt) > +new Date(latestOutboundAt))),
    latestInboundAt,
    latestMessageAt,
  };
}

export function sortThreads<T extends { unread: boolean; status: ThreadStatus; latestMessageAt: string | null; updated_at: string }>(threads: T[]) {
  return [...threads].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    if (a.status !== b.status) {
      const order: ThreadStatus[] = ["active", "closed", "archived"];
      return order.indexOf(a.status) - order.indexOf(b.status);
    }
    const aTime = +(a.latestMessageAt ? new Date(a.latestMessageAt) : new Date(a.updated_at));
    const bTime = +(b.latestMessageAt ? new Date(b.latestMessageAt) : new Date(b.updated_at));
    return bTime - aTime;
  });
}
