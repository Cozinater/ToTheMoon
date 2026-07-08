import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

export function SessionCard() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await api<{ ok: boolean }>("/api/logout", { method: "POST" });
    } finally {
      queryClient.clear(); // drop cached financial data from memory
      window.location.assign("/login");
    }
  }

  return (
    <section className="surface rounded-3xl p-6">
      <div className="mb-5 flex items-center gap-3.5">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
          <LogOut className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Session</h2>
          <p className="text-sm text-muted-foreground">
            Signs this browser out. Other devices stay signed in.
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={signOut} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </section>
  );
}
