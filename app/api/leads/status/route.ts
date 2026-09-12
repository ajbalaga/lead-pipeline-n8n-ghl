import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

const StatusSchema = z.object({
  email: z.string().email(),
  status: z.enum(["new", "contacted", "booked", "lost"]),
  note: z.string().max(500).optional(),
});

// This endpoint is called by the "GHL Status Callback -> App" n8n workflow,
// not by the browser. It's protected by a shared-secret header rather than
// user auth, since the only caller is n8n itself.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-internal-token");
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { email, status, note } = parsed.data;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE leads
       SET status = $1, note = COALESCE($2, note), updated_at = now()
       WHERE email = $3
       RETURNING id`,
      [status, note ?? null, email]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
  } catch (err) {
    console.error("Failed to update lead status", err);
    return NextResponse.json({ error: "Could not update lead" }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
