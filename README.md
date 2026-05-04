# Food Atlas

Food Atlas is an Astro website that generates recipe and product pages from a normalized SQLite database.

- browse as a normal website,
- parse as machine-readable content,
- index and retrieve with LLM-based tools.

Both static generation and runtime data access use the same local SQLite database powered by the Turso engine.

## Core Goals

- Keep recipes and products in a normalized SQLite database.
- Include rich, structured recipe and product metadata.
- Support allergy-aware filtering.
- Link alternative recipes together (for substitutions).
- Embed a recipe scaler in each recipe page (ingredients + prep/cook timing).
- Keep project intent and conventions documented in this README.

## Recipe Model

Each recipe record includes:

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

## Product Model

Each product record includes:

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

- Canonical data lives in `data/food.db`.
- Astro pages read directly from SQLite during static generation.
- Runtime data access also reads from SQLite through `src/lib/db.ts`.
- Browser local editing uses a separate OPFS database copy (`food-atlas-user.db`) seeded from `/db-seed.json`.
- Users can download their edited local database from `/local-data/` as a `.db` file.
- The old markdown corpus is no longer part of the app.
- ODS is not used as a runtime database.

## Database Model

The runtime database is normalized across the main entities instead of storing one big document blob:

- `recipes`
- `recipe_ingredients`
- `recipe_steps`
- `recipe_nutrition`
- `equipment`
- `allergens`
- `tags`
- `recipe_equipment`
- `recipe_allergens`
- `recipe_tags`
- `recipe_alternatives`
- `products`
- `product_nutrition`
- `product_allergens`
- `product_tags`
- `product_related_recipes`

Recipe and product pages are built from these normalized tables instead of document files.

## Local Turso

- Local database engine: `@tursodatabase/database`
- Browser database engine: `@tursodatabase/database-wasm`
- Default local database file: `data/food.db`
- Override path with `FOOD_ATLAS_DB_PATH`

Static generation and server-side reads use the checked-in SQLite file directly.

## Offline Support

- A service worker caches visited pages for offline browsing.
- A browser-side Turso WASM database stores visited page metadata and local editable content in OPFS when cross-origin isolation is available.
- Development headers for `COOP` and `COEP` are enabled in `astro.config.mjs`.
- A static `_headers` file is included for hosts that support it.

This means the app can work offline after pages have been visited, while still using a proper normalized database at runtime.

## Static And Dynamic Data Use

- Static pages are generated from SQLite at build time.
- Dynamic page data access should also go through `src/lib/db.ts` so the same database remains authoritative.
- Client-side local editing and export are available on `/local-data/` and run fully in the browser without a backend.

## Frontend-Only Local Editing

- No backend is required for editing or export.
- `/db-seed.json` is generated at build time from `data/food.db` and shipped as static JSON.
- On first visit to `/local-data/`, the browser creates a local SQLite DB in OPFS and imports the seed snapshot.
- Edits in `/local-data/` modify only the local DB copy and do not modify `data/food.db` on the host.
- The local editor currently supports recipe name/prep/cook, ingredients, steps, tags, and allergens.
- The `Download Local DB` action exports the current local DB to a SQLite `.db` file for user backup/sharing.
- This flow requires cross-origin isolation (`COOP`/`COEP`) and browser support for OPFS + SharedArrayBuffer.

## Commands

```sh
npm install
npm run dev
npm run build
npm run preview
```

## Content Notes For LLM Use

- Query the normalized tables instead of reading markdown files.
- Prefer normalized tags and allergens (lowercase) in stored records.
- Keep procedures as ordered, concise steps.
- Add cross-links through `alternatives` and `relatedRecipes`.
