import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

const LeadSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  service: z.enum(["plumbing", "electrical", "hvac", "other"]),
  message: z.string().max(1000).optional().default(""),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const lead = parsed.data;

  const client = await pool.connect();
  let leadId: string;
  let createdAt: string;
  try {
    const result = await client.query(
      `INSERT INTO leads (name, email, phone, service, message, status)
       VALUES ($1, $2, $3, $4, $5, 'new')
       RETURNING id, created_at`,
      [lead.name, lead.email, lead.phone, lead.service, lead.message]
    );
    leadId = result.rows[0].id;
    createdAt = result.rows[0].created_at;
  } catch (err) {
    console.error("Failed to insert lead", err);
    return NextResponse.json({ error: "Could not save lead" }, { status: 500 });
  } finally {
    client.release();
  }

  // Notify n8n so the automation (GHL upsert + tagging) can run.
  // This is fire-and-forget on purpose: a slow or briefly-down n8n instance
  // should never make the website visitor's submission fail. The lead is
  // already safely in Postgres above.
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        service: lead.service,
        message: lead.message,
        source: "website",
        submittedAt: createdAt,
      }),
    }).catch((err) => {
      console.error("Failed to notify n8n webhook", err);
    });
  }

  return NextResponse.json({ ok: true, leadId }, { status: 201 });
}
