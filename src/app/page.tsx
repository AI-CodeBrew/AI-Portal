import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export default async function Home() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  redirect(user.role === "admin" ? "/admin" : "/dashboard/orders");
}
