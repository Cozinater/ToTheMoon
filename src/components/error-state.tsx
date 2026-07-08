import { Button } from "@/components/ui/button";

export function ErrorState(props: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-destructive/40 bg-destructive/10 px-6 py-10 text-center">
      <p className="text-sm text-negative">{props.message}</p>
      <Button variant="outline" onClick={props.onRetry}>Retry</Button>
    </div>
  );
}
