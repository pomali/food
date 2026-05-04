import { connect } from "@tursodatabase/database";
import { marked } from "marked";
import path from "node:path";

type DbRow = Record<string, unknown>;
type GroupedValues = Map<string, string[]>;

export interface Ingredient {
  quantity: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  scalable: boolean;
}

export interface RecipeSummary {
  slug: string;
  name: string;
  yieldServings: number;
  prepMinutes: number;
  cookMinutes: number;
  tags: string[];
  allergens: string[];
}

export interface ProductSummary {
  slug: string;
  name: string;
  description: string;
  category: string;
}

export interface LinkedRecipe {
  slug: string;
  name: string;
}

export interface RecipeDetail extends RecipeSummary {
  bakeTempC: number | null;
  bakeTimeMinutes: number | null;
  equipment: string[];
  cookingProcedure: string[];
  servingProcedure: string;
  nutrition: {
    caloriesKcalPerServing: number | null;
    proteinGPerServing: number | null;
    carbsGPerServing: number | null;
    fatGPerServing: number | null;
    notes: string | null;
  };
  ingredients: Ingredient[];
  alternatives: LinkedRecipe[];
  notesHtml: string;
  source: string | null;
}

export interface ProductDetail extends ProductSummary {
  allergens: string[];
  tags: string[];
  relatedRecipes: LinkedRecipe[];
  nutritionPer100g: {
    caloriesKcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  } | null;
  notesHtml: string;
}

const defaultDbPath = path.resolve(process.cwd(), "data", "food.db");

let dbPromise: ReturnType<typeof connect> | undefined;

const getDb = async () => {
  if (!dbPromise) {
    dbPromise = connect(process.env.FOOD_ATLAS_DB_PATH || defaultDbPath, {
      readonly: true,
      fileMustExist: true,
    });
  }
  return dbPromise;
};

const numberOrNull = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const textOrNull = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
};

const pushGroupedValue = (map: GroupedValues, key: string, value: string) => {
  if (!key || !value) return;
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
};

const readGroupedValues = async (sql: string): Promise<GroupedValues> => {
  const db = await getDb();
  const rows = (await db.prepare(sql).all()) as DbRow[];
  const grouped: GroupedValues = new Map();
  for (const row of rows) {
    pushGroupedValue(grouped, String(row.slug), String(row.name));
  }
  return grouped;
};

export const getRecipeSlugs = async () => {
  const db = await getDb();
  const rows = (await db.prepare("SELECT slug FROM recipes ORDER BY slug").all()) as DbRow[];
  return rows.map((row: DbRow) => String(row.slug));
};

export const getProductSlugs = async () => {
  const db = await getDb();
  const rows = (await db.prepare("SELECT slug FROM products ORDER BY slug").all()) as DbRow[];
  return rows.map((row: DbRow) => String(row.slug));
};

export const getRecipeSummaries = async () => {
  const db = await getDb();
  const [rows, tagMap, allergenMap] = await Promise.all([
    db.prepare(`
      SELECT slug, name, yield_servings, prep_minutes, cook_minutes
      FROM recipes
      ORDER BY name COLLATE NOCASE
    `).all() as Promise<DbRow[]>,
    readGroupedValues(`
      SELECT r.slug AS slug, t.name AS name
      FROM recipe_tags rt
      JOIN recipes r ON r.id = rt.recipe_id
      JOIN tags t ON t.id = rt.tag_id
      ORDER BY rt.position
    `),
    readGroupedValues(`
      SELECT r.slug AS slug, a.name AS name
      FROM recipe_allergens ra
      JOIN recipes r ON r.id = ra.recipe_id
      JOIN allergens a ON a.id = ra.allergen_id
      ORDER BY ra.position
    `),
  ]);

  return rows.map((row: DbRow) => ({
    slug: String(row.slug),
    name: String(row.name),
    yieldServings: Number(row.yield_servings),
    prepMinutes: Number(row.prep_minutes),
    cookMinutes: Number(row.cook_minutes),
    tags: tagMap.get(String(row.slug)) || [],
    allergens: allergenMap.get(String(row.slug)) || [],
  }));
};

export const getProductSummaries = async () => {
  const db = await getDb();
  const rows = (await db.prepare(`
    SELECT slug, name, description, category
    FROM products
    ORDER BY name COLLATE NOCASE
  `).all()) as DbRow[];

  return rows.map((row: DbRow) => ({
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description),
    category: String(row.category),
  }));
};

export const getRecipeFilters = async () => {
  const db = await getDb();
  const [tagRows, allergenRows] = await Promise.all([
    db.prepare(`
      SELECT DISTINCT t.name AS name
      FROM recipe_tags rt
      JOIN tags t ON t.id = rt.tag_id
      ORDER BY t.name COLLATE NOCASE
    `).all() as Promise<DbRow[]>,
    db.prepare(`
      SELECT DISTINCT a.name AS name
      FROM recipe_allergens ra
      JOIN allergens a ON a.id = ra.allergen_id
      ORDER BY a.name COLLATE NOCASE
    `).all() as Promise<DbRow[]>,
  ]);

  return {
    tags: tagRows.map((row: DbRow) => String(row.name)),
    allergens: allergenRows.map((row: DbRow) => String(row.name)),
  };
};

export const getRecipeBySlug = async (slug: string): Promise<RecipeDetail | null> => {
  const db = await getDb();
  const recipe = (await db.prepare(`
    SELECT
      r.id,
      r.slug,
      r.name,
      r.yield_servings,
      r.prep_minutes,
      r.cook_minutes,
      r.bake_temp_c,
      r.bake_time_minutes,
      r.serving_procedure,
      r.notes_markdown,
      r.source,
      rn.calories_kcal_per_serving,
      rn.protein_g_per_serving,
      rn.carbs_g_per_serving,
      rn.fat_g_per_serving,
      rn.notes AS nutrition_notes
    FROM recipes r
    LEFT JOIN recipe_nutrition rn ON rn.recipe_id = r.id
    WHERE r.slug = ?
  `).get(slug)) as DbRow | null;

  if (!recipe) {
    return null;
  }

  const [ingredients, equipmentRows, stepRows, tagRows, allergenRows, alternativeRows, notesHtml] = await Promise.all([
    db.prepare(`
      SELECT quantity, unit, item, note, scalable
      FROM recipe_ingredients
      WHERE recipe_id = ?
      ORDER BY position
    `).all(recipe.id) as Promise<DbRow[]>,
    db.prepare(`
      SELECT e.name AS name
      FROM recipe_equipment re
      JOIN equipment e ON e.id = re.equipment_id
      WHERE re.recipe_id = ?
      ORDER BY re.position
    `).all(recipe.id) as Promise<DbRow[]>,
    db.prepare(`
      SELECT text
      FROM recipe_steps
      WHERE recipe_id = ?
      ORDER BY position
    `).all(recipe.id) as Promise<DbRow[]>,
    db.prepare(`
      SELECT t.name AS name
      FROM recipe_tags rt
      JOIN tags t ON t.id = rt.tag_id
      WHERE rt.recipe_id = ?
      ORDER BY rt.position
    `).all(recipe.id) as Promise<DbRow[]>,
    db.prepare(`
      SELECT a.name AS name
      FROM recipe_allergens ra
      JOIN allergens a ON a.id = ra.allergen_id
      WHERE ra.recipe_id = ?
      ORDER BY ra.position
    `).all(recipe.id) as Promise<DbRow[]>,
    db.prepare(`
      SELECT alt.slug AS slug, alt.name AS name
      FROM recipe_alternatives ra
      JOIN recipes alt ON alt.id = ra.alternative_recipe_id
      WHERE ra.recipe_id = ?
      ORDER BY ra.position
    `).all(recipe.id) as Promise<DbRow[]>,
    marked.parse(String(recipe.notes_markdown || "")),
  ]);

  return {
    slug: String(recipe.slug),
    name: String(recipe.name),
    yieldServings: Number(recipe.yield_servings),
    prepMinutes: Number(recipe.prep_minutes),
    cookMinutes: Number(recipe.cook_minutes),
    bakeTempC: numberOrNull(recipe.bake_temp_c),
    bakeTimeMinutes: numberOrNull(recipe.bake_time_minutes),
    servingProcedure: String(recipe.serving_procedure),
    ingredients: ingredients.map((ingredient: DbRow) => ({
      quantity: numberOrNull(ingredient.quantity),
      unit: textOrNull(ingredient.unit),
      item: String(ingredient.item),
      note: textOrNull(ingredient.note),
      scalable: Boolean(ingredient.scalable),
    })),
    equipment: equipmentRows.map((row: DbRow) => String(row.name)),
    cookingProcedure: stepRows.map((row: DbRow) => String(row.text)),
    nutrition: {
      caloriesKcalPerServing: numberOrNull(recipe.calories_kcal_per_serving),
      proteinGPerServing: numberOrNull(recipe.protein_g_per_serving),
      carbsGPerServing: numberOrNull(recipe.carbs_g_per_serving),
      fatGPerServing: numberOrNull(recipe.fat_g_per_serving),
      notes: textOrNull(recipe.nutrition_notes),
    },
    tags: tagRows.map((row: DbRow) => String(row.name)),
    allergens: allergenRows.map((row: DbRow) => String(row.name)),
    alternatives: alternativeRows.map((row: DbRow) => ({ slug: String(row.slug), name: String(row.name) })),
    notesHtml: String(notesHtml),
    source: textOrNull(recipe.source),
  };
};

export const getProductBySlug = async (slug: string): Promise<ProductDetail | null> => {
  const db = await getDb();
  const product = (await db.prepare(`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.category,
      p.notes_markdown,
      pn.calories_kcal,
      pn.protein_g,
      pn.carbs_g,
      pn.fat_g
    FROM products p
    LEFT JOIN product_nutrition pn ON pn.product_id = p.id
    WHERE p.slug = ?
  `).get(slug)) as DbRow | null;

  if (!product) {
    return null;
  }

  const [allergenRows, tagRows, relatedRecipeRows, notesHtml] = await Promise.all([
    db.prepare(`
      SELECT a.name AS name
      FROM product_allergens pa
      JOIN allergens a ON a.id = pa.allergen_id
      WHERE pa.product_id = ?
      ORDER BY pa.position
    `).all(product.id) as Promise<DbRow[]>,
    db.prepare(`
      SELECT t.name AS name
      FROM product_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.product_id = ?
      ORDER BY pt.position
    `).all(product.id) as Promise<DbRow[]>,
    db.prepare(`
      SELECT r.slug AS slug, r.name AS name
      FROM product_related_recipes prr
      JOIN recipes r ON r.id = prr.recipe_id
      WHERE prr.product_id = ?
      ORDER BY prr.position
    `).all(product.id) as Promise<DbRow[]>,
    marked.parse(String(product.notes_markdown || "")),
  ]);

  return {
    slug: String(product.slug),
    name: String(product.name),
    description: String(product.description),
    category: String(product.category),
    allergens: allergenRows.map((row: DbRow) => String(row.name)),
    tags: tagRows.map((row: DbRow) => String(row.name)),
    relatedRecipes: relatedRecipeRows.map((row: DbRow) => ({ slug: String(row.slug), name: String(row.name) })),
    nutritionPer100g:
      numberOrNull(product.calories_kcal) === null &&
      numberOrNull(product.protein_g) === null &&
      numberOrNull(product.carbs_g) === null &&
      numberOrNull(product.fat_g) === null
        ? null
        : {
            caloriesKcal: numberOrNull(product.calories_kcal),
            proteinG: numberOrNull(product.protein_g),
            carbsG: numberOrNull(product.carbs_g),
            fatG: numberOrNull(product.fat_g),
          },
    notesHtml: String(notesHtml),
  };
};