import { connect } from "@tursodatabase/database";
import path from "node:path";

export const prerender = true;

const localDbPath = process.env.FOOD_ATLAS_DB_PATH || path.resolve(process.cwd(), "data", "food.db");

export async function GET() {
  const db = await connect(localDbPath, { readonly: true, fileMustExist: true });

  const schemaRows = (await db
    .prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE sql IS NOT NULL
        AND type IN ('table', 'index')
        AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name
    `)
    .all()) as Array<{ sql: string }>;

  const tableRows = (await db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all()) as Array<{ name: string }>;

  const tables: Record<string, Record<string, unknown>[]> = {};

  for (const tableRow of tableRows) {
    const name = tableRow.name;
    const rows = (await db.prepare(`SELECT * FROM ${name}`).all()) as Record<string, unknown>[];
    tables[name] = rows;
  }

  return new Response(
    JSON.stringify(
      {
        schema: schemaRows.map((row) => row.sql),
        tables,
      },
      null,
      2,
    ),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
