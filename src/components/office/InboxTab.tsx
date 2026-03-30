import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useClients } from "@/hooks/useClients";
import { useToast } from "@/hooks/use-toast";
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

export function InboxTab() {
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
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
        .order("updated_at", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("Failed to load inbox threads", error);
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
        };
      });

      setThreads(nextThreads);
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
        console.error("Failed to load thread messages", error);
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

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

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
      current.map((thread) => {
        if (thread.id !== threadId) return thread;
        const last = (data ?? []).at(-1) ?? null;
        return {
          ...thread,
          updated_at: last?.created_at ?? thread.updated_at,
          lastMessageAt: last?.created_at ?? thread.lastMessageAt,
          lastMessageBody: last?.body ?? thread.lastMessageBody,
          messageCount: data?.length ?? thread.messageCount,
        };
      }),
    );
  };

  const handleCreateThread = async () => {
    if (!newClientId) {
      toast({ title: "Choose a client first", variant: "destructive" });
      return;
    }

    setCreatingThread(true);
    const payload = {
      client_id: newClientId,
      thread_type: newThreadType,
      entity_id: newEntityId.trim() || null,
      status: "active" as const,
    };

    const { data, error } = await supabase
      .from("message_threads")
      .insert(payload)
      .select("id, client_id, entity_id, thread_type, status, created_at, updated_at")
      .single();

    setCreatingThread(false);

    if (error || !data) {
      toast({
        title: "Could not create thread",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
      return;
    }

    const client = selectableClients.find((entry) => entry.id === data.client_id) ?? null;
    const nextThread: ThreadWithPreview = {
      ...data,
      client,
      lastMessageAt: null,
      lastMessageBody: null,
      messageCount: 0,
    };

    setThreads((current) => [nextThread, ...current]);
    setSelectedThreadId(data.id);
    setMessages([]);
    setNewClientId("");
    setNewThreadType("general");
    setNewEntityId("");
    toast({ title: "Thread created" });
  };

  const handleSend = async () => {
    if (!selectedThreadId || !composer.trim()) return;

    setSending(true);
    const body = composer.trim();
    const { error } = await supabase.from("messages").insert({
      thread_id: selectedThreadId,
      body,
      sender: "office",
      attachments: [],
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
    <div className="grid h-full min-h-0 gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
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
            <CardTitle className="text-base">Threads</CardTitle>
            <CardDescription>
              Recent client conversations grouped by thread.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0">
            {loadingThreads ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading inbox…
              </div>
            ) : threads.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No message threads yet.
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-24rem)] pr-3">
                <div className="space-y-2">
                  {threads.map((thread) => (
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
                          <p className="truncate text-sm font-semibold text-foreground">
                            {thread.client?.name ?? "Unknown client"}
                          </p>
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
              ? `${THREAD_TYPE_LABEL[selectedThread.thread_type]} conversation${selectedThread.entityLabel ? ` · ${selectedThread.entityLabel}` : selectedThread.entity_id ? ` · ${selectedThread.entity_id}` : ""}`
              : "Pick a thread to review and reply."}
          </CardDescription>
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
              <ScrollArea className="h-[calc(100vh-18rem)] pr-3">
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      No messages in this thread yet.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const senderKey = message.sender ?? "system";
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
                            <span>{SENDER_LABELS[senderKey] ?? senderKey}</span>
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
            <Label>Reply</Label>
            <Textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder={selectedThread ? "Write a reply…" : "Choose a thread first"}
              rows={4}
              disabled={!selectedThread || sending}
            />
            <div className="flex justify-end">
              <Button onClick={handleSend} disabled={!selectedThread || sending || !composer.trim()}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send reply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
