import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, Loader2, MessageSquarePlus, RefreshCw, Send, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";
import { useClientNames } from "@/hooks/useClients";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchThreadEntityLabels, getThreadEntityDisplayLabel } from "@/lib/message-threads";
import { deriveThreadLifecycle, sortThreads } from "@/lib/thread-lifecycle";
import { openOrCreateThread } from "@/lib/thread-navigation";
import { getThreadComposerPlaceholder, getThreadSummaryLabel } from "@/lib/thread-copy";
import { OFFICE_CANNED_REPLIES } from "@/lib/canned-replies";
import { buildMessageMetadata, isInternalMessage } from "@/lib/message-metadata";

type Client = Tables<"clients">;
type MessageThread = Tables<"message_threads">;
type Message = Tables<"messages">;
type ThreadType = Tables<"message_threads">["thread_type"];

type ThreadWithPreview = MessageThread & {
  client: Pick<Client, "id" | "name" | "contact_name" | "email"> | null;
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
  portal: "Client",
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

export function InboxTab({ requestedThreadId }: { requestedThreadId?: string | null }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: clients = [] } = useClientNames();
  const [threads, setThreads] = useState<ThreadWithPreview[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [composer, setComposer] = useState("");
  const [newClientId, setNewClientId] = useState<string>("");
  const [newThreadType, setNewThreadType] = useState<ThreadType>("general");
  const [newEntityId, setNewEntityId] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "closed" | "archived">("active");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [sendAsInternalNote, setSendAsInternalNote] = useState(false);

  useEffect(() => {
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
          clients (
            id,
            name,
            contact_name,
            email
          ),
          messages (
            id,
            body,
            created_at
          )
        `)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (!active) return;

      if (error) {
        logger.error("inbox_threads_load_failed", error);
        toast({
          title: "Could not load inbox",
          description: error.message,
          variant: "destructive",
        });
        setThreads([]);
        setLoadingThreads(false);
        return;
      }

      const entityLabels = await fetchThreadEntityLabels((data ?? []) as Array<Pick<MessageThread, "id" | "thread_type" | "entity_id">>);

      const nextThreads: ThreadWithPreview[] = (data ?? []).map((row: any) => {
        const rowMessages = Array.isArray(row.messages) ? [...row.messages] : [];
        rowMessages.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        const preview = rowMessages[0] ?? null;
        const client = Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients ?? null;

        const lifecycle = deriveThreadLifecycle({
          messages: rowMessages,
          selfSenderId: user?.id ?? null,
        });

        return {
          id: row.id,
          client_id: row.client_id,
          entity_id: row.entity_id,
          thread_type: row.thread_type,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          client,
          lastMessageAt: preview?.created_at ?? null,
          lastMessageBody: preview?.body ?? null,
          messageCount: rowMessages.length,
          entityLabel: getThreadEntityDisplayLabel(row, entityLabels),
          unread: lifecycle.unread,
        };
      });

      setThreads(sortThreads(nextThreads));
      setSelectedThreadId((current) => {
        if (current && nextThreads.some((thread) => thread.id === current)) return current;
        return nextThreads[0]?.id ?? null;
      });
      setLoadingThreads(false);
    };

    void loadThreads();
    return () => {
      active = false;
    };
  }, [toast]);

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
        logger.error("inbox_thread_messages_load_failed", error);
        toast({
          title: "Could not load thread",
          description: error.message,
          variant: "destructive",
        });
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      setMessages(data ?? []);
      setLoadingMessages(false);
    };

    void loadMessages();
    return () => {
      active = false;
    };
  }, [selectedThreadId, toast]);

  const filteredThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    return threads.filter((thread) => {
      if (statusFilter !== "all" && thread.status !== statusFilter) return false;
      if (unreadOnly && !thread.unread) return false;
      if (query) {
        const haystack = [thread.client?.name, thread.entityLabel, thread.lastMessageBody, thread.thread_type].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [threads, statusFilter, unreadOnly, threadSearch]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  useEffect(() => {
    if (!selectedThreadId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshSelectedThread(selectedThreadId).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [selectedThreadId]);

  const selectableClients = useMemo(
    () => clients.filter((client) => Boolean(client.id && client.name)),
    [clients],
  );

  const refreshSelectedThread = async (threadId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, thread_id, body, attachments, sender, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    setMessages(data ?? []);
    setThreads((current) =>
      sortThreads(current.map((thread) => {
        if (thread.id !== threadId) return thread;
        const last = (data ?? []).at(-1) ?? null;
        const lifecycle = deriveThreadLifecycle({ messages: data ?? [], selfSenderId: user?.id ?? null });
        return {
          ...thread,
          updated_at: last?.created_at ?? thread.updated_at,
          lastMessageAt: last?.created_at ?? thread.lastMessageAt,
          lastMessageBody: last?.body ?? thread.lastMessageBody,
          messageCount: data?.length ?? thread.messageCount,
          unread: lifecycle.unread,
        };
      })),
    );
  };

  const handleCreateThread = async () => {
    if (!newClientId) {
      toast({ title: "Choose a client first", variant: "destructive" });
      return;
    }

    setCreatingThread(true);
    try {
      const threadId = await openOrCreateThread({
        clientId: newClientId,
        threadType: newThreadType,
        entityId: newEntityId.trim() || null,
      });

      const client = selectableClients.find((entry) => entry.id === newClientId) ?? null;
      const existing = threads.find((thread) => thread.id === threadId);
      if (!existing) {
        const nextThread: ThreadWithPreview = {
          id: threadId,
          client_id: newClientId,
          entity_id: newEntityId.trim() || null,
          thread_type: newThreadType,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          client,
          lastMessageAt: null,
          lastMessageBody: null,
          messageCount: 0,
          entityLabel: newEntityId.trim() || null,
          unread: false,
        };
        setThreads((current) => sortThreads([nextThread, ...current]));
      }
      setSelectedThreadId(threadId);
      setMessages([]);
      setNewClientId("");
      setNewThreadType("general");
      setNewEntityId("");
      toast({ title: existing ? "Opened existing thread" : "Thread created" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Could not create thread",
        description: message,
        variant: "destructive",
      });
    } finally {
      setCreatingThread(false);
    }
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
      sender: user?.id ?? null,
      attachments: buildMessageMetadata(sendAsInternalNote ? "internal" : "shared"),
    });
    setSending(false);

    if (error) {
      toast({
        title: "Could not send message",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setComposer("");
    setSendAsInternalNote(false);
    try {
      await refreshSelectedThread(selectedThreadId);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "Unknown error";
      toast({
        title: "Message sent, refresh failed",
        description: message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Message sent" });
  };

  return (
    <div className="grid min-h-0 gap-4 p-3 md:p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Office Inbox</CardTitle>
            <CardDescription>
              Start client threads for general questions, estimates, or invoices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={newClientId} onValueChange={setNewClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose client" />
                </SelectTrigger>
                <SelectContent>
                  {selectableClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
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
              <div className="space-y-2">
                <Label>Entity ID</Label>
                <Input
                  value={newEntityId}
                  onChange={(event) => setNewEntityId(event.target.value)}
                  placeholder="Optional estimate/invoice id"
                />
              </div>
            </div>
            <Button onClick={handleCreateThread} disabled={creatingThread || !newClientId} className="w-full">
              {creatingThread ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
              New thread
            </Button>
          </CardContent>
        </Card>

        <Card className="min-h-0 flex-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Threads</CardTitle>
                <CardDescription>
                  Recent client conversations grouped by thread.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => selectedThreadId ? void refreshSelectedThread(selectedThreadId) : undefined}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                placeholder="Search threads"
                className="min-w-[180px] flex-1"
              />
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
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading inbox…
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No message threads match the current filters.
              </div>
            ) : (
              <ScrollArea className="max-h-[50vh] lg:max-h-[calc(100vh-24rem)] pr-3">
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
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {thread.client?.name ?? "Unknown client"}
                            </p>
                            {thread.unread ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Unread</span> : null}
                            {thread.status !== "active" ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">{thread.status}</span> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {THREAD_TYPE_LABEL[thread.thread_type]}
                            {thread.entityLabel ? ` · ${thread.entityLabel}` : thread.entity_id ? ` · ${thread.entity_id}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatWhen(thread.lastMessageAt ?? thread.updated_at)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {thread.lastMessageBody ?? "No messages yet"}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-0 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {selectedThread ? selectedThread.client?.name ?? "Thread" : "Select a thread"}
          </CardTitle>
          <CardDescription>
            {selectedThread
              ? getThreadSummaryLabel({
                  threadType: selectedThread.thread_type,
                  entityLabel: selectedThread.entityLabel ?? selectedThread.entity_id,
                  perspective: "office",
                })
              : "Pick a thread to review and reply."}
          </CardDescription>
          {selectedThread ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {selectedThread.status !== "active" ? <Button size="sm" variant="outline" onClick={() => void updateThreadStatus(selectedThread.id, "active")}><CheckCircle2 className="mr-2 h-4 w-4" />Reopen</Button> : null}
              {selectedThread.status === "active" ? <Button size="sm" variant="outline" onClick={() => void updateThreadStatus(selectedThread.id, "closed")}><CheckCircle2 className="mr-2 h-4 w-4" />Close</Button> : null}
              {selectedThread.status !== "archived" ? <Button size="sm" variant="outline" onClick={() => void updateThreadStatus(selectedThread.id, "archived")}><Archive className="mr-2 h-4 w-4" />Archive</Button> : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="min-h-0 flex-1 rounded-xl border bg-muted/20 p-3">
            {!selectedThread ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Choose a thread on the left.
              </div>
            ) : loadingMessages ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading messages…
              </div>
            ) : (
              <ScrollArea className="max-h-[52vh] lg:max-h-[calc(100vh-18rem)] pr-3">
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      No messages in this thread yet.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const visibility = isInternalMessage(message.attachments) ? "internal" : "shared";
                      const senderKey = message.sender === user?.id ? "office" : message.sender ? "portal" : "system";
                      const isOffice = senderKey === "office";
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                            isOffice
                              ? "ml-auto bg-primary text-primary-foreground"
                              : "bg-white text-foreground border border-border/70",
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] opacity-70">
                            <span>{SENDER_LABELS[senderKey] ?? senderKey}{visibility === "internal" ? " · Internal" : ""}</span>
                            <span>{formatWhen(message.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Reply</Label>
              <div className="flex flex-wrap gap-2">
                <Select onValueChange={(value) => setComposer((current) => current ? `${current}\n\n${OFFICE_CANNED_REPLIES.find((reply) => reply.id === value)?.text ?? ""}`.trim() : OFFICE_CANNED_REPLIES.find((reply) => reply.id === value)?.text ?? "") }>
                  <SelectTrigger className="w-[190px]"><SelectValue placeholder="Canned replies" /></SelectTrigger>
                  <SelectContent>
                    {OFFICE_CANNED_REPLIES.map((reply) => (
                      <SelectItem key={reply.id} value={reply.id}>{reply.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant={sendAsInternalNote ? "default" : "outline"} size="sm" onClick={() => setSendAsInternalNote((value) => !value)}>
                  <StickyNote className="mr-2 h-4 w-4" />
                  {sendAsInternalNote ? "Internal note" : "Shared reply"}
                </Button>
              </div>
            </div>
            <Textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder={selectedThread ? getThreadComposerPlaceholder({ threadType: selectedThread.thread_type, entityLabel: selectedThread.entityLabel ?? selectedThread.entity_id, perspective: "office" }) : "Choose a thread first"}
              rows={4}
              disabled={!selectedThread || sending}
            />
            {sendAsInternalNote ? <p className="text-xs text-muted-foreground">Internal notes stay in Office Inbox and are hidden from portal clients.</p> : null}
            <div className="flex justify-end">
              <Button onClick={handleSend} disabled={!selectedThread || sending || !composer.trim()}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {sendAsInternalNote ? "Save internal note" : "Send reply"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
