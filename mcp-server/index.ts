import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const server = new Server(
  { name: "leadpipeline-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_recent_leads",
      description: "List the most recently submitted leads, newest first.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max number of leads to return (default 10, max 50)",
          },
        },
      },
    },
    {
      name: "get_lead_status",
      description: "Look up a single lead by email and return its current pipeline status.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "The lead email address to look up" },
        },
        required: ["email"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_recent_leads") {
    const limit = Math.min(Number((args as any)?.limit) || 10, 50);
    const { rows } = await pool.query(
      `SELECT id, name, email, service, status, created_at
       FROM leads ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  }

  if (name === "get_lead_status") {
    const email = String((args as any)?.email || "").toLowerCase().trim();
    const { rows } = await pool.query(
      `SELECT id, name, email, service, status, note, created_at, updated_at
       FROM leads WHERE email = $1`,
      [email]
    );
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No lead found for ${email}` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(rows[0], null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
