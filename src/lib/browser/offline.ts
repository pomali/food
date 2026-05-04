import { connect } from "@tursodatabase/database-wasm/vite";

let readyPromise;

const getOfflineDb = async () => {
  if (!readyPromise) {
    readyPromise = (async () => {
      const db = await connect("food-atlas-offline.db");
      await db.exec(`
        CREATE TABLE IF NOT EXISTS visited_pages (
          path TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          visited_at TEXT NOT NULL
        )
      `);
      return db;
    })();
  }
  return readyPromise;
};

export const initOfflineDatabase = async (payload) => {
  if (typeof window === "undefined" || !window.crossOriginIsolated) {
    return;
  }

  try {
    const db = await getOfflineDb();
    const statement = db.prepare(`
      INSERT OR REPLACE INTO visited_pages (path, title, kind, content, visited_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    await statement.run(
      payload.path,
      payload.title,
      payload.kind,
      payload.content.slice(0, 4000),
      new Date().toISOString(),
    );
  } catch (error) {
    console.warn("Offline database initialization failed", error);
  }
};