# Food Atlas

Food Atlas is an Astro website for storing recipes and products in markdown so they are easy to:

- browse as a normal website,
- parse as machine-readable content,
- index and retrieve with LLM-based tools.

## Core Goals

- Keep recipes and products in markdown files.
- Include rich, structured recipe metadata in frontmatter.
- Support allergy-aware filtering.
- Link alternative recipes together (for substitutions).
- Embed a recipe scaler in each recipe page (ingredients + prep/cook timing).
- Keep project intent and conventions documented in this README.

## Recipe Schema

Each recipe markdown file in `src/content/recipes/` includes:

- `name`
- `yieldServings`
- `ingredients` list
	- each ingredient can include: `quantity`, `unit`, `item`, `note`, `scalable`
- `prepMinutes`, `cookMinutes`
- optional `bakeTempC`, `bakeTimeMinutes`
- `equipment`
- `cookingProcedure`
- `servingProcedure`
- `nutrition`
	- calories/macros per serving (when available)
- `allergens`
- `tags`
- `alternatives` (links by recipe slug)
- optional `source`

This structure is validated with Astro content collections in `src/content.config.ts`.

## Product Schema

Each product markdown file in `src/content/products/` includes:

- `name`
- `description`
- `category`
- `allergens`
- `tags`
- `relatedRecipes`
- optional `nutritionPer100g`

## Routes

- `/` recipe listing, filtering, and product overview
	- filter by excluded allergen and recipe tag
	- text search by recipe name/slug/ingredient
- `/recipes/[slug]/` recipe detail page
	- ingredient and time scaling app
	- allergens, tags, nutrition, equipment, procedures
	- links to alternative recipes
- `/products/[slug]/` product detail page
	- nutrition, allergens, tags, linked recipes

## Storage Model

- Canonical storage is markdown in `src/content/recipes/` and `src/content/products/`.
- ODS is not used as a runtime database.
- SQLite is not required for the current version because Astro content collections already provide structured, typed access to markdown entries.

## DDKK Migration

If you want to migrate starter content from the DDKK spreadsheet once, place it in project root as `DDKK.ods`, then run:

```sh
npm run import:ddkk
```

Importer script:

- file: `scripts/import-ddkk.mjs`
- output folder: `src/content/recipes/`
- detects common column names in Slovak/English
- parses ingredient lines and generates markdown frontmatter
- is intended as a one-time import helper only

After importing, manually review generated recipes to refine parsing quality.

## Commands

```sh
npm install
npm run import:ddkk   # optional, after DDKK.ods is present
npm run dev
npm run build
npm run preview
```

## Content Notes For LLM Use

- Keep frontmatter consistent and explicit.
- Prefer normalized tags and allergens (lowercase).
- Keep procedures as ordered, concise steps.
- Add cross-links through `alternatives` and `relatedRecipes`.
