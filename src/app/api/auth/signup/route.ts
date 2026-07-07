import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { email, password, fullName } = (await request.json()) as {
    email?: string;
    password?: string;
    fullName?: string;
  };

  if (!email || !password || !fullName) {
    return NextResponse.json(
      { error: "Email, password, and full name are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "reseller" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Trigger on auth.users should create portal_users + store; ensure profile exists
  if (data.user) {
    const { data: profile } = await admin
      .from("portal_users")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile) {
      const { data: store } = await admin
        .from("stores")
        .insert({ owner_email: email, owner_id: data.user.id })
        .select("id")
        .single();

      await admin.from("portal_users").insert({
        id: data.user.id,
        email,
        role: "reseller",
        full_name: fullName,
        store_id: store?.id ?? null,
      });

      if (store?.id) {
        await admin
          .from("stores")
          .update({ owner_id: data.user.id })
          .eq("id", store.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
