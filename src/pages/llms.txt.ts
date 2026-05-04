import {
  getProductBySlug,
  getProductSlugs,
  getRecipeBySlug,
  getRecipeSlugs,
  type Ingredient,
} from "../lib/db";

export const prerender = true;

const compact = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim();

const orNone = (values: string[]) => (values.length ? values.join(", ") : "none");

const formatIngredient = (ingredient: Ingredient) => {
  const quantity = ingredient.quantity === null ? "" : `${ingredient.quantity}`;
  const unit = ingredient.unit ? ` ${ingredient.unit}` : "";
  const note = ingredient.note ? ` (${compact(ingredient.note)})` : "";
  const fixed = ingredient.scalable ? "" : " [fixed]";
  return `${quantity}${unit} ${compact(ingredient.item)}${note}${fixed}`.trim();
};

const markdownEscape = (value: string) => value.replace(/[\[\]]/g, "\\$&");

export async function GET() {

  const [recipeSlugs, productSlugs] = await Promise.all([getRecipeSlugs(), getProductSlugs()]);

  const [recipes, products] = await Promise.all([
    Promise.all(recipeSlugs.map((slug: string) => getRecipeBySlug(slug))),
    Promise.all(productSlugs.map((slug: string) => getProductBySlug(slug))),
  ]);

  const recipeDetails = recipes.filter((recipe) => recipe !== null);
  const productDetails = products.filter((product) => product !== null);

  const lines: string[] = [];

  lines.push("# Food Atlas");
  lines.push("");
  lines.push(
    "> Food Atlas is a normalized SQLite-backed recipe and product catalog. This file is an LLM-friendly full-content index with direct links and compact structured content for every item.",
  );
  lines.push("");
  lines.push(
    "Use `/db-seed.json` for the complete canonical machine-readable snapshot (schema + table rows). Use the recipe and product pages below for human-readable detail views.",
  );
  lines.push("");

  lines.push("## Core Data");
  lines.push("");
  lines.push("- [Full database snapshot](/db-seed.json): Canonical full content export from SQLite, including schema and all table rows.");
  lines.push("- [Homepage](/): Recipes and products overview with filters.");
  lines.push("- [Local data editor](/local-data/): Browser-local editable SQLite copy and download flow.");
  lines.push("");

  lines.push("## Recipes");
  lines.push("");

  for (const recipe of recipeDetails) {
    const recipeUrl = `/recipes/${recipe.slug}/`;
    const ingredientList = recipe.ingredients.map(formatIngredient).join("; ");
    const steps = recipe.cookingProcedure.map((step: string) => compact(step)).join(" | ");
    const alternatives = recipe.alternatives.map((item) => item.name).join(", ");
    const nutrition = [
      recipe.nutrition.caloriesKcalPerServing === null ? null : `${recipe.nutrition.caloriesKcalPerServing} kcal/serving`,
      recipe.nutrition.proteinGPerServing === null ? null : `${recipe.nutrition.proteinGPerServing} g protein/serving`,
      recipe.nutrition.carbsGPerServing === null ? null : `${recipe.nutrition.carbsGPerServing} g carbs/serving`,
      recipe.nutrition.fatGPerServing === null ? null : `${recipe.nutrition.fatGPerServing} g fat/serving`,
    ]
      .filter(Boolean)
      .join(", ");

    lines.push(
      `- [${markdownEscape(recipe.name)}](${recipeUrl}): slug=${recipe.slug}; yield=${recipe.yieldServings}; prep=${recipe.prepMinutes} min; cook=${recipe.cookMinutes} min; bakeTempC=${recipe.bakeTempC ?? "n/a"}; bakeTimeMinutes=${recipe.bakeTimeMinutes ?? "n/a"}; source=${recipe.source ?? "n/a"}.`,
    );
    lines.push(`  allergens: ${orNone(recipe.allergens)}.`);
    lines.push(`  tags: ${orNone(recipe.tags)}.`);
    lines.push(`  equipment: ${orNone(recipe.equipment)}.`);
    lines.push(`  ingredients: ${ingredientList || "none"}.`);
    lines.push(`  cookingProcedure: ${steps || "none"}.`);
    lines.push(`  servingProcedure: ${compact(recipe.servingProcedure) || "none"}.`);
    lines.push(`  nutrition: ${nutrition || "none"}.`);
    lines.push(`  nutritionNotes: ${compact(recipe.nutrition.notes) || "none"}.`);
    lines.push(`  alternatives: ${alternatives || "none"}.`);
    // lines.push(`  notesHtml: ${compact(recipe.notesHtml) || "none"}.`);
    lines.push("");
  }

//   lines.push("## Products");
//   lines.push("");

//   for (const product of productDetails) {
//     const productUrl = `/products/${product.slug}/`;
//     const nutrition = product.nutritionPer100g
//       ? [
//           product.nutritionPer100g.caloriesKcal === null ? null : `${product.nutritionPer100g.caloriesKcal} kcal/100g`,
//           product.nutritionPer100g.proteinG === null ? null : `${product.nutritionPer100g.proteinG} g protein/100g`,
//           product.nutritionPer100g.carbsG === null ? null : `${product.nutritionPer100g.carbsG} g carbs/100g`,
//           product.nutritionPer100g.fatG === null ? null : `${product.nutritionPer100g.fatG} g fat/100g`,
//         ]
//           .filter(Boolean)
//           .join(", ")
//       : "none";

//     const relatedRecipes = product.relatedRecipes.map((item) => `${item.name} (/recipes/${item.slug}/)`).join(", ");

//     lines.push(
//       `- [${markdownEscape(product.name)}](${productUrl}): slug=${product.slug}; category=${compact(product.category)}; description=${compact(product.description)}.`,
//     );
//     lines.push(`  allergens: ${orNone(product.allergens)}.`);
//     lines.push(`  tags: ${orNone(product.tags)}.`);
//     lines.push(`  relatedRecipes: ${relatedRecipes || "none"}.`);
//     lines.push(`  nutritionPer100g: ${nutrition}.`);
//     lines.push(`  notesHtml: ${compact(product.notesHtml) || "none"}.`);
//     lines.push("");
//   }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}