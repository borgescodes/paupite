import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/matches")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
});
