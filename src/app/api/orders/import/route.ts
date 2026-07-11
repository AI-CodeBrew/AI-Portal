import { NextRequest, NextResponse } from "next/server";
import { requireResellerStore } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function headerIndex(headers: string[], ...names: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireResellerStore();
    const contentType = request.headers.get("content-type") ?? "";

    let csvText = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (file instanceof File) {
        csvText = await file.text();
      } else if (typeof form.get("csv") === "string") {
        csvText = form.get("csv") as string;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      csvText =
        typeof body.csv === "string"
          ? body.csv
          : typeof body.text === "string"
            ? body.text
            : "";
    }

    if (!csvText.trim()) {
      return NextResponse.json(
        { error: "Provide CSV via multipart file or JSON { csv }" },
        { status: 400 }
      );
    }

    const rows = parseCsv(csvText.trim());
    if (rows.length < 2) {
      return NextResponse.json(
        { error: "CSV must include a header row and at least one data row" },
        { status: 400 }
      );
    }

    const headers = rows[0];
    const iOrder = headerIndex(headers, "order_number", "order");
    const iTotal = headerIndex(headers, "total", "amount");
    const iCurrency = headerIndex(headers, "currency");
    const iStatus = headerIndex(headers, "status");
    const iSource = headerIndex(headers, "source");
    const iPhone = headerIndex(headers, "customer_phone", "phone");
    const iName = headerIndex(headers, "customer_name", "name");
    const iAddress = headerIndex(headers, "shipping_address", "address");
    const iCity = headerIndex(headers, "city");
    const iCountry = headerIndex(headers, "country");

    const supabase = createAdminClient();
    let created = 0;
    const errors: string[] = [];

    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      const orderNumber =
        (iOrder >= 0 ? cols[iOrder]?.trim() : "") || `IMP-${Date.now()}-${r}`;
      const totalRaw = iTotal >= 0 ? cols[iTotal]?.trim() : "";
      const total = totalRaw ? parseFloat(totalRaw) : 0;
      const currency =
        (iCurrency >= 0 ? cols[iCurrency]?.trim() : "") || "AED";
      const statusRaw = (iStatus >= 0 ? cols[iStatus]?.trim() : "") || "pending";
      const status = ["pending", "confirmed", "cancelled"].includes(statusRaw)
        ? statusRaw
        : "pending";
      const sourceRaw = (iSource >= 0 ? cols[iSource]?.trim() : "") || "whatsapp_ai";
      const source =
        sourceRaw === "shopify" ? "shopify" : "whatsapp_ai";
      const phone = iPhone >= 0 ? cols[iPhone]?.trim() : "";
      const name = iName >= 0 ? cols[iName]?.trim() : "";
      const address1 = iAddress >= 0 ? cols[iAddress]?.trim() : "";
      const city = iCity >= 0 ? cols[iCity]?.trim() : "";
      const country = iCountry >= 0 ? cols[iCountry]?.trim() : "";

      let customerId: string | null = null;
      if (phone) {
        const { data: customer, error: custErr } = await supabase
          .from("customers")
          .upsert(
            {
              store_id: storeId,
              phone,
              name: name || null,
            },
            { onConflict: "store_id,phone" }
          )
          .select("id")
          .single();
        if (custErr) {
          errors.push(`Row ${r + 1}: ${custErr.message}`);
          continue;
        }
        customerId = customer?.id ?? null;
      }

      const shipping_address =
        address1 || city || country
          ? {
              name: name || null,
              phone: phone || null,
              address1: address1 || null,
              city: city || null,
              country: country || null,
            }
          : null;

      const { error } = await supabase.from("orders").insert({
        store_id: storeId,
        customer_id: customerId,
        order_number: orderNumber,
        items: [],
        total: Number.isFinite(total) ? total : 0,
        currency,
        status,
        source,
        shipping_address,
        shopify_sync_status: "not_applicable",
      });

      if (error) {
        errors.push(`Row ${r + 1}: ${error.message}`);
      } else {
        created += 1;
      }
    }

    return NextResponse.json({
      created,
      failed: errors.length,
      errors: errors.slice(0, 20),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
