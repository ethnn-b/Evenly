import { redirect } from "next/navigation";

// The app has no public landing page in v1. Middleware sends signed-out users
// to /login; signed-in users land on the dashboard.
export default function Home() {
  redirect("/dashboard");
}
