import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, Loader2, MessageSquarePlus, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { PortalTabProps } from "./portal-tab-props";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchThreadEntityLabels, getThreadEntityDisplayLabel } from "@/lib/message-threads";
import { deriveThreadLifecycle, sortThreads } from "@/lib/thread-lifecycle";
import { getThreadComposerPlaceholder, getThreadSummaryLabel } from "@/lib/thread-copy";

type MessageThread = Tables<"message_threads">;
type Message = Tables<"messages">;
type ThreadType = Tables<"message_threads">["thread_type"];

type PortalThread = MessageThread & {
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  messageCount: number;
  entityLabel: string | null;
  unread: boolean;
};

const THREAD_TYPE_LABEL: Record<ThreadType, string> = {
  general: "General",
  estimate: "Estimate",
  invoice: "Invoice",
};

const SENDER_LABELS: Record<string, string> = {
  office: "Office",
  portal: "You",
  system: "System",
};

function formatWhen(value: string | null) {
  if (!value) return "No messages yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function PortalMessagesTab({ clientId, loading, errorMessage, requestedThreadId }: PortalTabProps) {
  const { toast } = useToast();
  const [threads, setThreads] = useState<PortalThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newThreadType, setNewThreadType] = useState<ThreadType>("general");
  const [creatingThread, setCreatingThread] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "closed" | "archived">("active");
  const [unreadOnly, setUnreadOnly] = useState(false);

  useEffect(() => {
    if (!clientId || loading || errorMessage) {
      setThreads([]);
      setSelectedThreadId(null);
      setMessages([]);
      return;
    }

    let active = true;
    const loadThreads = async () => {
      setLoadingThreads(true);
      const { data, error } = await supabase
        .from("message_threads")
        .select(`
          id,
          client_id,
          entity_id,
          thread_type,
          status,
          created_at,
          updated_at,
          messages (
            id,
            body,
            created_at
          )
        `)
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("updated_at", { ascending: false });

      if (!active) return;

      if (error) {
        toast({ title: "Could not load messages", description: error.message, variant: "destructive" });
        setThreads([]);
        setLoadingThreads(false);
        return;
      }

      const entityLabels = await fetchThreadEntityLabels((data ?? []) as Array<Pick<MessageThread, "id" | "thread_type" | "entity_id">>);

      const nextThreads: PortalThread[] = (data ?? []).map((row: any) => {
        const rowMessages = Array.isArray(row.messages) ? [...row.messages] : [];
        rowMessages.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        const preview = rowMessages[0] ?? null;
        const lifecycle = deriveThreadLifecycle({
          messages: rowMessages,
          selfSender: "portal",
        });

        return {
          id: row.id,
          client_id: row.client_id,
          entity_id: row.entity_id,
          thread_type: row.thread_type,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          lastMessageAt: preview?.created_at ?? null,
          lastMessageBody: preview?.body ?? null,
          messageCount: rowMessages.length,
          entityLabel: getThreadEntityDisplayLabel(row, entityLabels),
          unread: lifecycle.unread,
        };
      });

      setThreads(sortThreads(nextThreads));
      setSelectedThreadId((current) => current && nextThreads.some((t) => t.id === current) ? current : nextThreads[0]?.id ?? null);
      setLoadingThreads(false);
    };

    void loadThreads();
    return () => { active = false; };
  }, [clientId, errorMessage, loading, toast]);

  useEffect(() => {
    if (requestedThreadId) {
      setSelectedThreadId(requestedThreadId);
    }
  }, [requestedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }

    let active = true;
    const loadMessages = async () => {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id, thread_id, body, attachments, sender, created_at")
        .eq("thread_id", selectedThreadId)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (error) {
        toast({ title: "Could not load thread", description: error.message, variant: "destructive" });
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      setMessages(data ?? []);
      setLoadingMessages(false);
    };

    void loadMessages();
    return () => { active = false; };
  }, [selectedThreadId, toast]);

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (statusFilter !== "all" && thread.status !== statusFilter) return false;
      if (unreadOnly && !thread.unread) return false;
      return true;
    });
  }, [threads, statusFilter, unreadOnly]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  const refreshThread = async (threadId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, thread_id, body, attachments, sender, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    setMessages(data ?? []);
    setThreads((current) => sortThreads(current.map((thread) => {
      if (thread.id !== threadId) return thread;
      const last = (data ?? []).at(-1) ?? null;
      const lifecycle = deriveThreadLifecycle({ messages: data ?? [], selfSender: "portal" });
      return {
        ...thread,
        updated_at: last?.created_at ?? thread.updated_at,
        lastMessageAt: last?.created_at ?? thread.lastMessageAt,
        lastMessageBody: last?.body ?? thread.lastMessageBody,
        messageCount: data?.length ?? thread.messageCount,
        unread: lifecycle.unread,
      };
    })));
  };

  const handleCreateThread = async () => {
    if (!clientId) return;
    setCreatingThread(true);
    const { data, error } = await supabase
      .from("message_threads")
      .insert({
        client_id: clientId,
        thread_type: newThreadType,
        status: "active",
        entity_id: null,
      })
      .select("id, client_id, entity_id, thread_type, status, created_at, updated_at")
      .single();
    setCreatingThread(false);

    if (error || !data) {
      toast({ title: "Could not start thread", description: error?.message ?? "Unknown error", variant: "destructive" });
      return;
    }

    const nextThread: PortalThread = {
      ...data,
      lastMessageAt: null,
      lastMessageBody: null,
      messageCount: 0,
    };
    setThreads((current) => [nextThread, ...current]);
    setSelectedThreadId(data.id);
    setMessages([]);
    toast({ title: "Thread started" });
  };

  const updateThreadStatus = async (threadId: string, status: "active" | "closed" | "archived") => {
    const { error } = await supabase.from("message_threads").update({ status }).eq("id", threadId);
    if (error) {
      toast({ title: "Could not update thread", description: error.message, variant: "destructive" });
      return;
    }
    setThreads((current) => sortThreads(current.map((thread) => thread.id === threadId ? { ...thread, status } : thread)));
    toast({ title: status === "active" ? "Thread reopened" : `Thread ${status}` });
  };

  const handleSend = async () => {
    if (!selectedThreadId || !composer.trim()) return;
    setSending(true);
    const body = composer.trim();
    const { error } = await supabase.from("messages").insert({
      thread_id: selectedThreadId,
      body,
      sender: "portal",
      attachments: [],
    });
    setSending(false);

    if (error) {
      toast({ title: "Could not send message", description: error.message, variant: "destructive" });
      return;
    }

    setComposer("");
    try {
      await refreshThread(selectedThreadId);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "Unknown error";
      toast({ title: "Message sent, refresh failed", description: message, variant: "destructive" });
      return;
    }

    toast({ title: "Message sent" });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading messages…</div>;
  }

  if (errorMessage) {
    return <div className="text-sm text-destructive">{errorMessage}</div>;
  }

  if (!clientId) {
    return <div className="text-sm text-muted-foreground">No client linked to this portal account.</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Messages</CardTitle>
            <CardDescription>Ask questions about estimates, invoices, or general account issues.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>New thread type</Label>
              <Select value={newThreadType} onValueChange={(value) => setNewThreadType(value as ThreadType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="estimate">Estimate</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateThread} disabled={creatingThread} className="w-full">
              {creatingThread ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
              Start thread
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your threads</CardTitle>
            <CardDescription>All active conversations with the office team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All threads</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={unreadOnly ? "default" : "outline"} size="sm" onClick={() => setUnreadOnly((value) => !value)}>
                Unread only
              </Button>
            </div>
            {loadingThreads ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No threads match the current filters.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors",
                      selectedThreadId === thread.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/70 hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{THREAD_TYPE_LABEL[thread.thread_type]}</p>
                          {thread.unread ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Unread</span> : null}
                          {thread.status !== "active" ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">{thread.status}</span> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{thread.entityLabel ?? thread.entity_id ?? "General conversation"}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{formatWhen(thread.lastMessageAt ?? thread.updated_at)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{thread.lastMessageBody ?? "No messages yet"}</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-[520px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{selectedThread ? THREAD_TYPE_LABEL[selectedThread.thread_type] : "Conversation"}</CardTitle>
          <CardDescription>
            {selectedThread
              ? getThreadSummaryLabel({
                  threadType: selectedThread.thread_type,
                  entityLabel: selectedThread.entityLabel ?? selectedThread.entity_id,
                  perspective: "portal",
                })
              : "Choose or start a thread to chat with the office team."}
          </CardDescription>
          {selectedThread ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {selectedThread.status !== "active" ? <Button size="sm" variant="outline" onClick={() => void updateThreadStatus(selectedThread.id, "active")}><CheckCircle2 className="mr-2 h-4 w-4" />Reopen</Button> : null}
              {selectedThread.status === "active" ? <Button size="sm" variant="outline" onClick={() => void updateThreadStatus(selectedThread.id, "closed")}><CheckCircle2 className="mr-2 h-4 w-4" />Close</Button> : null}
              {selectedThread.status !== "archived" ? <Button size="sm" variant="outline" onClick={() => void updateThreadStatus(selectedThread.id, "archived")}><Archive className="mr-2 h-4 w-4" />Archive</Button> : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex h-full flex-col gap-4">
          <div className="min-h-0 flex-1 rounded-xl border bg-muted/20 p-3">
            {!selectedThread ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a thread to see messages.</div>
            ) : loadingMessages ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation…
              </div>
            ) : (
              <ScrollArea className="h-[420px] pr-3">
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No messages yet.</div>
                  ) : messages.map((message) => {
                    const senderKey = message.sender ?? "system";
                    const isPortal = senderKey === "portal";
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                          isPortal
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "border border-border/70 bg-white text-foreground",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] opacity-70">
                          <span>{SENDER_LABELS[senderKey] ?? senderKey}</span>
                          <span>{formatWhen(message.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Reply</Label>
            <Textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              rows={4}
              placeholder={selectedThread ? getThreadComposerPlaceholder({ threadType: selectedThread.thread_type, entityLabel: selectedThread.entityLabel ?? selectedThread.entity_id, perspective: "portal" }) : "Choose a thread first"}
              disabled={!selectedThread || sending}
            />
            <div className="flex justify-end">
              <Button onClick={handleSend} disabled={!selectedThread || sending || !composer.trim()}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send message
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
