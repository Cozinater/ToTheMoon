import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

export function SignInCard() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending || password === "") return;
    setPending(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await router.navigate({ to: "/" });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "BAD_PASSWORD"
          ? "Wrong password"
          : "Couldn't sign in — try again",
      );
      setPending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="surface w-full max-w-sm rounded-3xl p-8"
    >
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-[0_0_24px_rgba(232,192,105,0.25)]">
          <Rocket className="size-6" />
        </div>
        <div>
          <div className="font-display text-2xl font-semibold tracking-tight">ToTheMoon</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Build wealth. Go further.
          </div>
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password" type="password" autoFocus autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
        <Button type="submit" disabled={pending || password === ""}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </motion.div>
  );
}
