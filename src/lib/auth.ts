import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserRole = "admin" | "reseller";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string | null;
  storeId: string | null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("portal_users")
    .select("role, store_id, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: profile.email ?? user.email ?? "",
    role: profile.role as UserRole,
    fullName: profile.full_name,
    storeId: profile.store_id,
  };
}

export async function requireAuth(role?: UserRole): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  if (role && user.role !== role) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireResellerStore(): Promise<{
  user: AuthUser;
  storeId: string;
}> {
  const user = await requireAuth("reseller");
  if (!user.storeId) {
    throw new Error("NO_STORE");
  }
  return { user, storeId: user.storeId };
}

export async function createAdminUser(
  email: string,
  password: string,
  fullName: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "admin" },
  });

  if (error) {
    if (error.message.includes("already been registered")) {
      const { data: users } = await admin.auth.admin.listUsers();
      const existing = users.users.find((u) => u.email === email);
      if (existing) {
        await admin
          .from("portal_users")
          .upsert({ id: existing.id, email, role: "admin", full_name: fullName });
        return { ok: true };
      }
    }
    return { ok: false, error: error.message };
  }

  if (data.user) {
    await admin.from("portal_users").upsert({
      id: data.user.id,
      email,
      role: "admin",
      full_name: fullName,
    });
  }

  return { ok: true };
}
