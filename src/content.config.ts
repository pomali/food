import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const ingredientSchema = z.object({
  quantity: z.number().optional(),
  unit: z.string().optional(),
  item: z.string(),
  note: z.string().optional(),
  scalable: z.boolean().default(true),
});

const nutritionSchema = z.object({
  caloriesKcalPerServing: z.number().optional(),
  proteinGPerServing: z.number().optional(),
  carbsGPerServing: z.number().optional(),
  fatGPerServing: z.number().optional(),
  notes: z.string().optional(),
});

const recipes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/recipes" }),
  schema: z.object({
    name: z.string(),
    yieldServings: z.number().positive(),
    ingredients: z.array(ingredientSchema).min(1),
    prepMinutes: z.number().nonnegative(),
    cookMinutes: z.number().nonnegative(),
    bakeTempC: z.number().positive().optional(),
    bakeTimeMinutes: z.number().positive().optional(),
    equipment: z.array(z.string()).min(1),
    cookingProcedure: z.array(z.string()).min(1),
    servingProcedure: z.string(),
    nutrition: nutritionSchema,
    allergens: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    alternatives: z.array(z.string()).default([]),
    source: z.string().optional(),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/products" }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    category: z.string(),
    allergens: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    relatedRecipes: z.array(z.string()).default([]),
    nutritionPer100g: z
      .object({
        caloriesKcal: z.number().optional(),
        proteinG: z.number().optional(),
        carbsG: z.number().optional(),
        fatG: z.number().optional(),
      })
      .optional(),
  }),
});

export const collections = {
  recipes,
  products,
};
