import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

const supabaseMocks = vi.hoisted(() => {
  const listeners: AuthCallback[] = [];
  const unsubscribe = vi.fn();
  const signOut = vi.fn(async () => ({ error: null }));
  const getSession = vi.fn(async () => ({ data: { session: null } }));
  const from = vi.fn((table: string) => {
    if (table === "user_roles") {
      return {
        select: () => ({
          eq: vi.fn(async () => ({ data: [{ role: "office" }], error: null })),
        }),
      };
    }

    if (table === "portal_users") {
      const chain = {
        ilike: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };

      return {
        select: () => chain,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { listeners, unsubscribe, signOut, getSession, from };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        supabaseMocks.listeners.push(callback);
        return { data: { subscription: { unsubscribe: supabaseMocks.unsubscribe } } };
      }),
      signOut: supabaseMocks.signOut,
      getSession: supabaseMocks.getSession,
    },
    from: supabaseMocks.from,
  },
}));

function AuthProbe() {
  const { roles, loading, user } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user?.id ?? "none"}</div>
      <div data-testid="roles">{roles.join(",")}</div>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    supabaseMocks.listeners.length = 0;
    supabaseMocks.unsubscribe.mockClear();
    supabaseMocks.signOut.mockClear();
    supabaseMocks.getSession.mockClear();
    supabaseMocks.from.mockClear();
  });

  it("does not resubscribe to auth events after login state sync", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(supabaseMocks.listeners).toHaveLength(1);

    const session = {
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: "user-1",
        email: "worker@example.com",
        user_metadata: {},
        app_metadata: {},
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    } as Session;

    await act(async () => {
      supabaseMocks.listeners[0]("SIGNED_IN", session);
    });

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("user")).toHaveTextContent("user-1");
      expect(screen.getByTestId("roles")).toHaveTextContent("office");
    });

    expect(supabaseMocks.listeners).toHaveLength(1);
    expect(supabaseMocks.unsubscribe).not.toHaveBeenCalled();
    expect(supabaseMocks.from).toHaveBeenCalledTimes(2);
  });
});
