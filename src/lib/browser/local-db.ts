const LOCAL_DB_FILE = "food-atlas-user.db";

export type LocalDatabaseMode = "opfs" | "memory";

type SeedPayload = {
  schema: string[];
  tables: Record<string, Record<string, unknown>[]>;
};

type RecipeEditorPayload = {
  name: string;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: Array<{
    quantity: number | null;
    unit: string;
    item: string;
    note: string;
    scalable: boolean;
  }>;
  steps: string[];
  tags: string[];
  allergens: string[];
};

type WasmConnect = (path: string) => Promise<any>;

let mode: LocalDatabaseMode = "memory";
let wasmConnectPromise: Promise<WasmConnect> | undefined;
let wasmDbPromise: Promise<any> | undefined;
let memoryStore: SeedPayload | undefined;

const normalizeLookupName = (value: string) => value.trim().toLowerCase();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const deepCloneTables = (tables: SeedPayload["tables"]) => {
  const cloned: SeedPayload["tables"] = {};
  for (const [table, rows] of Object.entries(tables)) {
    cloned[table] = rows.map((row) => ({ ...row }));
  }
  return cloned;
};

const fetchSeedPayload = async () => {
  const response = await fetch("/db-seed.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to fetch /db-seed.json (${response.status})`);
  }
  return (await response.json()) as SeedPayload;
};

const getWasmConnect = async () => {
  if (!wasmConnectPromise) {
    wasmConnectPromise = import("@tursodatabase/database-wasm/vite").then(
      (mod) => mod.connect as WasmConnect,
    );
  }
  return wasmConnectPromise;
};

const getWasmDb = async () => {
  if (!wasmDbPromise) {
    const connect = await getWasmConnect();
    wasmDbPromise = connect(LOCAL_DB_FILE);
  }
  return wasmDbPromise;
};

const ensureWasmSeeded = async () => {
  const db = await getWasmDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const seededRow = (await db.prepare("SELECT value FROM app_meta WHERE key = 'seed_version'").get()) as
    | Record<string, unknown>
    | undefined;

  if (seededRow?.value) {
    return;
  }

  const payload = await fetchSeedPayload();

  await db.exec("PRAGMA foreign_keys = OFF;");
  for (const statement of payload.schema) {
    if (statement.trim()) {
      await db.exec(statement);
    }
  }

  for (const [table, rows] of Object.entries(payload.tables)) {
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    if (!columns.length) continue;

    const placeholders = columns.map(() => "?").join(", ");
    const statement = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);

    for (const row of rows) {
      const values = columns.map((column) => row[column]);
      await statement.run(...values);
    }
  }

  await db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('seed_version', '1')").run();
  await db.exec("PRAGMA foreign_keys = ON;");
};

const ensureMemorySeeded = async () => {
  if (memoryStore) return;
  const payload = await fetchSeedPayload();
  memoryStore = {
    schema: payload.schema.slice(),
    tables: deepCloneTables(payload.tables),
  };
};

const getMemoryRows = (table: string) => {
  if (!memoryStore) {
    throw new Error("Local memory store is not initialized.");
  }
  if (!memoryStore.tables[table]) {
    memoryStore.tables[table] = [];
  }
  return memoryStore.tables[table];
};

const nextRowId = (rows: Record<string, unknown>[]) => {
  let max = 0;
  for (const row of rows) {
    const value = Number(row.id ?? 0);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 1;
};

const getMemoryLookupNameById = (table: "tags" | "allergens", id: number) => {
  const row = getMemoryRows(table).find((candidate) => Number(candidate.id) === id);
  return row ? String(row.name ?? "") : "";
};

const getOrCreateMemoryLookupId = (table: "tags" | "allergens", rawName: string) => {
  const name = normalizeLookupName(rawName);
  if (!name) return null;

  const rows = getMemoryRows(table);
  const existing = rows.find((row) => normalizeLookupName(String(row.name ?? "")) === name);
  if (existing) {
    return Number(existing.id);
  }

  const slugSet = new Set(rows.map((row) => String(row.slug ?? "")));
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let index = 2;
  while (slugSet.has(slug)) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }

  const id = nextRowId(rows);
  rows.push({ id, slug, name });
  return id;
};

export const getLocalDatabaseMode = (): LocalDatabaseMode => mode;

export const ensureLocalEditableDatabase = async () => {
  if (typeof window === "undefined") return;

  mode = window.crossOriginIsolated ? "opfs" : "memory";
  if (mode === "opfs") {
    await ensureWasmSeeded();
    return;
  }

  await ensureMemorySeeded();
};

export const listLocalRecipes = async () => {
  if (mode === "opfs") {
    const db = await getWasmDb();
    const rows = (await db
      .prepare(`
        SELECT slug, name, prep_minutes, cook_minutes
        FROM recipes
        ORDER BY name COLLATE NOCASE
      `)
      .all()) as Record<string, unknown>[];

    return rows.map((row) => ({
      slug: String(row.slug),
      name: String(row.name),
      prepMinutes: Number(row.prep_minutes),
      cookMinutes: Number(row.cook_minutes),
    }));
  }

  await ensureMemorySeeded();
  return getMemoryRows("recipes")
    .map((row) => ({
      slug: String(row.slug),
      name: String(row.name),
      prepMinutes: Number(row.prep_minutes ?? 0),
      cookMinutes: Number(row.cook_minutes ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getLocalRecipeEditor = async (slug: string) => {
  if (mode === "opfs") {
    const db = await getWasmDb();
    const recipe = (await db
      .prepare(
        `
        SELECT id, slug, name, prep_minutes, cook_minutes
        FROM recipes
        WHERE slug = ?
      `,
      )
      .get(slug)) as Record<string, unknown> | undefined;

    if (!recipe) {
      return null;
    }

    const [ingredientRows, stepRows, tagRows, allergenRows] = await Promise.all([
      db.prepare(
        `
        SELECT quantity, unit, item, note, scalable
        FROM recipe_ingredients
        WHERE recipe_id = ?
        ORDER BY position
      `,
      ).all(recipe.id),
      db.prepare(
        `
        SELECT text
        FROM recipe_steps
        WHERE recipe_id = ?
        ORDER BY position
      `,
      ).all(recipe.id),
      db.prepare(
        `
        SELECT t.name
        FROM recipe_tags rt
        JOIN tags t ON t.id = rt.tag_id
        WHERE rt.recipe_id = ?
        ORDER BY rt.position
      `,
      ).all(recipe.id),
      db.prepare(
        `
        SELECT a.name
        FROM recipe_allergens ra
        JOIN allergens a ON a.id = ra.allergen_id
        WHERE ra.recipe_id = ?
        ORDER BY ra.position
      `,
      ).all(recipe.id),
    ]);

    return {
      slug: String(recipe.slug),
      name: String(recipe.name),
      prepMinutes: Number(recipe.prep_minutes),
      cookMinutes: Number(recipe.cook_minutes),
      ingredients: (ingredientRows as Record<string, unknown>[]).map((row) => ({
        quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
        unit: row.unit === null || row.unit === undefined ? "" : String(row.unit),
        item: String(row.item ?? ""),
        note: row.note === null || row.note === undefined ? "" : String(row.note),
        scalable: Number(row.scalable ?? 1) !== 0,
      })),
      steps: (stepRows as Record<string, unknown>[]).map((row) => String(row.text ?? "")).filter(Boolean),
      tags: (tagRows as Record<string, unknown>[]).map((row) => String(row.name ?? "")).filter(Boolean),
      allergens: (allergenRows as Record<string, unknown>[]).map((row) => String(row.name ?? "")).filter(Boolean),
    };
  }

  await ensureMemorySeeded();
  const recipes = getMemoryRows("recipes");
  const recipe = recipes.find((row) => String(row.slug) === slug);
  if (!recipe) return null;

  const recipeId = Number(recipe.id);
  const ingredients = getMemoryRows("recipe_ingredients")
    .filter((row) => Number(row.recipe_id) === recipeId)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((row) => ({
      quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
      unit: row.unit === null || row.unit === undefined ? "" : String(row.unit),
      item: String(row.item ?? ""),
      note: row.note === null || row.note === undefined ? "" : String(row.note),
      scalable: Number(row.scalable ?? 1) !== 0,
    }));

  const steps = getMemoryRows("recipe_steps")
    .filter((row) => Number(row.recipe_id) === recipeId)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((row) => String(row.text ?? ""))
    .filter(Boolean);

  const tags = getMemoryRows("recipe_tags")
    .filter((row) => Number(row.recipe_id) === recipeId)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((row) => getMemoryLookupNameById("tags", Number(row.tag_id ?? 0)))
    .filter(Boolean);

  const allergens = getMemoryRows("recipe_allergens")
    .filter((row) => Number(row.recipe_id) === recipeId)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((row) => getMemoryLookupNameById("allergens", Number(row.allergen_id ?? 0)))
    .filter(Boolean);

  return {
    slug: String(recipe.slug),
    name: String(recipe.name),
    prepMinutes: Number(recipe.prep_minutes ?? 0),
    cookMinutes: Number(recipe.cook_minutes ?? 0),
    ingredients,
    steps,
    tags,
    allergens,
  };
};

export const saveLocalRecipeEditor = async (slug: string, payload: RecipeEditorPayload) => {
  if (mode === "opfs") {
    const db = await getWasmDb();
    const recipe = (await db.prepare("SELECT id FROM recipes WHERE slug = ?").get(slug)) as
      | Record<string, unknown>
      | undefined;
    if (!recipe?.id) {
      throw new Error(`Recipe not found: ${slug}`);
    }

    const recipeId = Number(recipe.id);
    const normalizedTags = Array.from(new Set(payload.tags.map(normalizeLookupName).filter(Boolean)));
    const normalizedAllergens = Array.from(new Set(payload.allergens.map(normalizeLookupName).filter(Boolean)));

    const getOrCreateLookupId = async (table: "tags" | "allergens", rawName: string) => {
      const name = normalizeLookupName(rawName);
      if (!name) return null;

      const existing = (await db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name)) as
        | Record<string, unknown>
        | undefined;
      if (existing?.id !== undefined && existing?.id !== null) {
        return Number(existing.id);
      }

      const baseSlug = slugify(name);
      let lookupSlug = baseSlug;
      let index = 2;
      while (true) {
        try {
          await db.prepare(`INSERT INTO ${table} (slug, name) VALUES (?, ?)`).run(lookupSlug, name);
          break;
        } catch (error) {
          const message = String(error);
          if (!message.includes("UNIQUE constraint failed") || !message.includes(`${table}.slug`)) {
            throw error;
          }
          lookupSlug = `${baseSlug}-${index}`;
          index += 1;
        }
      }

      const inserted = (await db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name)) as
        | Record<string, unknown>
        | undefined;
      return inserted?.id !== undefined && inserted?.id !== null ? Number(inserted.id) : null;
    };

    await db.exec("BEGIN");
    try {
      await db
        .prepare(
          `
          UPDATE recipes
          SET name = ?, prep_minutes = ?, cook_minutes = ?
          WHERE id = ?
        `,
        )
        .run(payload.name, payload.prepMinutes, payload.cookMinutes, recipeId);

      await db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(recipeId);
      const insertIngredient = db.prepare(
        `
        INSERT INTO recipe_ingredients (recipe_id, position, quantity, unit, item, note, scalable)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      );
      for (const [index, ingredient] of payload.ingredients.entries()) {
        await insertIngredient.run(
          recipeId,
          index,
          ingredient.quantity,
          ingredient.unit.trim() || null,
          ingredient.item.trim(),
          ingredient.note.trim() || null,
          ingredient.scalable ? 1 : 0,
        );
      }

      await db.prepare("DELETE FROM recipe_steps WHERE recipe_id = ?").run(recipeId);
      const insertStep = db.prepare(
        `
        INSERT INTO recipe_steps (recipe_id, position, text)
        VALUES (?, ?, ?)
      `,
      );
      for (const [index, step] of payload.steps.entries()) {
        await insertStep.run(recipeId, index, step);
      }

      await db.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").run(recipeId);
      const insertTag = db.prepare(
        `
        INSERT INTO recipe_tags (recipe_id, tag_id, position)
        VALUES (?, ?, ?)
      `,
      );
      for (const [index, tagName] of normalizedTags.entries()) {
        const tagId = await getOrCreateLookupId("tags", tagName);
        if (tagId !== null) {
          await insertTag.run(recipeId, tagId, index);
        }
      }

      await db.prepare("DELETE FROM recipe_allergens WHERE recipe_id = ?").run(recipeId);
      const insertAllergen = db.prepare(
        `
        INSERT INTO recipe_allergens (recipe_id, allergen_id, position)
        VALUES (?, ?, ?)
      `,
      );
      for (const [index, allergenName] of normalizedAllergens.entries()) {
        const allergenId = await getOrCreateLookupId("allergens", allergenName);
        if (allergenId !== null) {
          await insertAllergen.run(recipeId, allergenId, index);
        }
      }

      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }

    return;
  }

  await ensureMemorySeeded();
  const recipes = getMemoryRows("recipes");
  const recipe = recipes.find((row) => String(row.slug) === slug);
  if (!recipe) {
    throw new Error(`Recipe not found: ${slug}`);
  }

  const recipeId = Number(recipe.id);
  recipe.name = payload.name;
  recipe.prep_minutes = payload.prepMinutes;
  recipe.cook_minutes = payload.cookMinutes;

  const ingredientsTable = getMemoryRows("recipe_ingredients");
  const stepsTable = getMemoryRows("recipe_steps");
  const recipeTagsTable = getMemoryRows("recipe_tags");
  const recipeAllergensTable = getMemoryRows("recipe_allergens");

  const remainingIngredients = ingredientsTable.filter((row) => Number(row.recipe_id) !== recipeId);
  const remainingSteps = stepsTable.filter((row) => Number(row.recipe_id) !== recipeId);
  const remainingRecipeTags = recipeTagsTable.filter((row) => Number(row.recipe_id) !== recipeId);
  const remainingRecipeAllergens = recipeAllergensTable.filter((row) => Number(row.recipe_id) !== recipeId);

  const nextIngredientId = nextRowId(ingredientsTable);
  const nextStepId = nextRowId(stepsTable);

  payload.ingredients.forEach((ingredient, index) => {
    remainingIngredients.push({
      id: nextIngredientId + index,
      recipe_id: recipeId,
      position: index,
      quantity: ingredient.quantity,
      unit: ingredient.unit.trim() || null,
      item: ingredient.item.trim(),
      note: ingredient.note.trim() || null,
      scalable: ingredient.scalable ? 1 : 0,
    });
  });

  payload.steps.forEach((step, index) => {
    remainingSteps.push({
      id: nextStepId + index,
      recipe_id: recipeId,
      position: index,
      text: step,
    });
  });

  const normalizedTags = Array.from(new Set(payload.tags.map(normalizeLookupName).filter(Boolean)));
  const normalizedAllergens = Array.from(new Set(payload.allergens.map(normalizeLookupName).filter(Boolean)));

  normalizedTags.forEach((tagName, index) => {
    const tagId = getOrCreateMemoryLookupId("tags", tagName);
    if (tagId !== null) {
      remainingRecipeTags.push({
        recipe_id: recipeId,
        tag_id: tagId,
        position: index,
      });
    }
  });

  normalizedAllergens.forEach((allergenName, index) => {
    const allergenId = getOrCreateMemoryLookupId("allergens", allergenName);
    if (allergenId !== null) {
      remainingRecipeAllergens.push({
        recipe_id: recipeId,
        allergen_id: allergenId,
        position: index,
      });
    }
  });

  memoryStore!.tables.recipe_ingredients = remainingIngredients;
  memoryStore!.tables.recipe_steps = remainingSteps;
  memoryStore!.tables.recipe_tags = remainingRecipeTags;
  memoryStore!.tables.recipe_allergens = remainingRecipeAllergens;
};

export const getLocalStats = async () => {
  if (mode === "opfs") {
    const db = await getWasmDb();
    const recipeRow = (await db.prepare("SELECT COUNT(*) AS count FROM recipes").get()) as
      | Record<string, unknown>
      | undefined;
    const productRow = (await db.prepare("SELECT COUNT(*) AS count FROM products").get()) as
      | Record<string, unknown>
      | undefined;

    return {
      recipeCount: Number(recipeRow?.count ?? 0),
      productCount: Number(productRow?.count ?? 0),
    };
  }

  await ensureMemorySeeded();
  return {
    recipeCount: getMemoryRows("recipes").length,
    productCount: getMemoryRows("products").length,
  };
};

export const downloadLocalDatabase = async () => {
  if (mode === "opfs") {
    const db = (await getWasmDb()) as {
      serialize?: () => Uint8Array | ArrayBuffer;
    };

    if (typeof db.serialize !== "function") {
      throw new Error("Database export is unavailable in the current runtime.");
    }

    const serialized = db.serialize();
    const data = serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);

    const blob = new Blob([copy.buffer], { type: "application/x-sqlite3" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "food-atlas-user.db";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return "food-atlas-user.db";
  }

  await ensureMemorySeeded();
  const blob = new Blob([JSON.stringify(memoryStore, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "food-atlas-user-memory.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return "food-atlas-user-memory.json";
};
