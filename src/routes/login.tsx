import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { SignInCard } from "@/features/auth/components/sign-in-card";

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <SignInCard />
    </main>
  );
}
