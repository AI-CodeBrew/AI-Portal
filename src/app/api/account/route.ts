import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let storeName: string | null = null;
    let shopDomain: string | null = null;

    if (user.storeId) {
      const supabase = createAdminClient();
      const { data: store } = await supabase
        .from("stores")
        .select("store_name, shop_domain")
        .eq("id", user.storeId)
        .maybeSingle();
      storeName = store?.store_name ?? null;
      shopDomain = store?.shop_domain ?? null;
    }

    return NextResponse.json({
      account: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        storeName,
        shopDomain,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
