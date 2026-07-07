import { NextRequest, NextResponse } from "next/server";
import { createAdminUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-setup-secret");
  if (secret !== process.env.ADMIN_SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    return NextResponse.json(
      { error: "ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local" },
      { status: 400 }
    );
  }

  const result = await createAdminUser(email, password, fullName);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}
