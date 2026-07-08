import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { confirmPortalOrder } from "@/lib/orders/confirm";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "reseller") {
      return NextResponse.json(
        { error: "Only resellers can confirm orders" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const result = await confirmPortalOrder(id, user);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
