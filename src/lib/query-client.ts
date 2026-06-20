import { QueryClient } from "@tanstack/react-query";

// Single shared TanStack Query cache for the whole app.
// Provided at the root in main.tsx via <QueryClientProvider>.
export const queryClient = new QueryClient();
