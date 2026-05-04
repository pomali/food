---
name: edit-recipe-sqlite
description: |
   Edit recipes directly in the SQLite database using command-line tools.
   Includes viewing, adding, updating recipes, ingredients, steps, tags, allergens, and nutritional data.
   Changes persist immediately to the database file.
---

# Direct SQLite Database Editing Skill

## Overview
This skill guides you through editing recipes directly in the SQLite database using command-line tools (sqlite3).
All changes are immediately persisted to `data/food.db` and will be reflected when the site rebuilds.

## Setup & Prerequisites

1. **Ensure sqlite3 is installed:**
   ```bash
    which sqlite3
   ```
    If not available, install via: `brew install sqlite` (macOS)

2. **Database location:** `/Users/pom/work/mine/food/data/food.db`

3. **Backup before major changes:**
    ```bash
    cp data/food.db data/food.db.backup
    ```

## Database Schema Overview

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `recipes` | Main recipe data | id, slug, name, yield_servings, prep_minutes, cook_minutes, bake_temp_c, bake_time_minutes |
| `recipe_ingredients` | Ingredients per recipe | recipe_id, position, quantity, unit, item, note, scalable |
| `recipe_steps` | Cooking instructions | recipe_id, position, text |
| `recipe_nutrition` | Nutrition facts | recipe_id, calories_kcal_per_serving, protein_g, carbs_g, fat_g |
| `tags` | Recipe categories | id, slug, name |
| `recipe_tags` | Tag assignments | recipe_id, tag_id, position |
| `allergens` | Allergen types | id, slug, name |
| `recipe_allergens` | Allergen warnings | recipe_id, allergen_id, position |
| `equipment` | Kitchen equipment | id, slug, name |
| `recipe_equipment` | Equipment per recipe | recipe_id, equipment_id, position |

## Querying Recipes

### View a single recipe with all details

```bash
sqlite3 data/food.db <<EOF
-- Basic recipe info
SELECT id, slug, name, yield_servings, prep_minutes, cook_minutes FROM recipes WHERE slug = 'chocolate-chip-cookies';

-- Ingredients
SELECT position, quantity, unit, item, note, scalable FROM recipe_ingredients 
WHERE recipe_id = (SELECT id FROM recipes WHERE slug = 'chocolate-chip-cookies')
ORDER BY position;

-- Steps
SELECT position, text FROM recipe_steps 
WHERE recipe_id = (SELECT id FROM recipes WHERE slug = 'chocolate-chip-cookies')
ORDER BY position;

-- Tags
SELECT t.name FROM tags t
JOIN recipe_tags rt ON t.id = rt.tag_id
WHERE rt.recipe_id = (SELECT id FROM recipes WHERE slug = 'chocolate-chip-cookies')
ORDER BY rt.position;

-- Allergens
SELECT a.name FROM allergens a
JOIN recipe_allergens ra ON a.id = ra.allergen_id
WHERE ra.recipe_id = (SELECT id FROM recipes WHERE slug = 'chocolate-chip-cookies')
ORDER BY ra.position;

-- Nutrition
SELECT * FROM recipe_nutrition 
WHERE recipe_id = (SELECT id FROM recipes WHERE slug = 'chocolate-chip-cookies');
EOF
```

### List all recipes

```bash
sqlite3 data/food.db "SELECT id, slug, name, yield_servings, prep_minutes, cook_minutes FROM recipes ORDER BY name;" -header
```

### Search recipes by name

```bash
sqlite3 data/food.db "SELECT id, slug, name FROM recipes WHERE name LIKE '%chocolate%' ORDER BY name;" -header
```

## Editing a Recipe

### Step 1: Find the Recipe ID

```bash
sqlite3 data/food.db "SELECT id, slug, name FROM recipes WHERE slug = 'chocolate-chip-cookies';"
```

Note the `id` (e.g., `42`) for use in other queries.

### Step 2: Update Recipe Metadata

Update name, servings, and timing:

```bash
sqlite3 data/food.db <<EOF
UPDATE recipes 
SET 
   name = 'Classic Chocolate Chip Cookies',
   yield_servings = 24,
   prep_minutes = 15,
   cook_minutes = 12
WHERE slug = 'chocolate-chip-cookies';
EOF
```

**Key fields:**
- `name` — Recipe display name
- `yield_servings` — How many servings (integer)
- `prep_minutes` — Prep time in minutes
- `cook_minutes` — Cook time in minutes
- `bake_temp_c` — Optional baking temperature in Celsius
- `bake_time_minutes` — Optional baking time
- `serving_procedure` — Text describing how to serve
- `notes_markdown` — Markdown-formatted notes
- `source` — Recipe source/attribution
- `source_path` — Path or URL of original source

### Step 3: Edit Ingredients

**Field definitions:**
- `quantity` — Numeric amount (can be decimal, NULL for items without amount)
- `unit` — Measurement unit (cups, tsp, tbsp, g, oz, ml, etc.) or NULL
- `item` — Ingredient name (required)
- `note` — Optional prep notes (chopped, melted, etc.)
- `scalable` — 1 (scales with servings) or 0 (fixed amount)
- `position` — Order of ingredient (start at 1, must be sequential)

**View current ingredients:**
```
sqlite3 data/food.db "SELECT position, quantity, unit, item, note, scalable FROM recipe_ingredients WHERE recipe_id = 42 ORDER BY position;" -header
```

**Add an ingredient:**
```
sqlite3 data/food.db <<EOF
INSERT INTO recipe_ingredients (recipe_id, position, quantity, unit, item, note, scalable)
VALUES (42, 1, 2, 'cups', 'flour', 'all-purpose', 1);
EOF
```

**Update an ingredient:**
```bash
sqlite3 data/food.db <<EOF
UPDATE recipe_ingredients 
SET quantity = 3, unit = 'cups', note = 'all-purpose flour'
WHERE recipe_id = 42 AND position = 1;
EOF
```

**Delete an ingredient:**
```bash
sqlite3 data/food.db "DELETE FROM recipe_ingredients WHERE recipe_id = 42 AND position = 5;"
```

**Re-number positions after deletion** (to maintain sequential order):
```bash
sqlite3 data/food.db <<EOF
WITH numbered AS (
   SELECT id, ROW_NUMBER() OVER (ORDER BY position) as new_pos
   FROM recipe_ingredients
   WHERE recipe_id = 42
)
UPDATE recipe_ingredients
SET position = (SELECT new_pos FROM numbered WHERE numbered.id = recipe_ingredients.id)
WHERE recipe_id = 42;
EOF
```

### Step 4: Edit Steps

**View current steps:**
```bash
sqlite3 data/food.db "SELECT position, text FROM recipe_steps WHERE recipe_id = 42 ORDER BY position;" -header
```

**Add a step:**
```bash
sqlite3 data/food.db <<EOF
INSERT INTO recipe_steps (recipe_id, position, text)
VALUES (42, 1, 'Preheat oven to 375°F (190°C)');
EOF
```

**Update a step:**
```bash
sqlite3 data/food.db <<EOF
UPDATE recipe_steps 
SET text = 'Preheat oven to 375°F (190°C) for 15 minutes'
WHERE recipe_id = 42 AND position = 1;
EOF
```

**Delete a step:**
```bash
sqlite3 data/food.db "DELETE FROM recipe_steps WHERE recipe_id = 42 AND position = 3;"
```

**Re-number positions:**
```bash
sqlite3 data/food.db <<EOF
WITH numbered AS (
   SELECT id, ROW_NUMBER() OVER (ORDER BY position) as new_pos
   FROM recipe_steps
   WHERE recipe_id = 42
)
UPDATE recipe_steps
SET position = (SELECT new_pos FROM numbered WHERE numbered.id = recipe_steps.id)
WHERE recipe_id = 42;
EOF
```

## Managing Tags and Allergens

### View all tags and allergens

```
sqlite3 data/food.db "SELECT id, slug, name FROM tags ORDER BY name;" -header
sqlite3 data/food.db "SELECT id, slug, name FROM allergens ORDER BY name;" -header
```

### Add a tag to a recipe

```bash
sqlite3 data/food.db <<EOF
-- First, ensure the tag exists (or find its ID)
INSERT OR IGNORE INTO tags (slug, name) VALUES ('quick', 'Quick');

-- Find the highest position for this recipe
SELECT MAX(position) FROM recipe_tags WHERE recipe_id = 42;

-- Add the tag (position should be MAX + 1, starting at 1)
INSERT INTO recipe_tags (recipe_id, tag_id, position)
SELECT 42, id, 1 FROM tags WHERE slug = 'quick'
WHERE NOT EXISTS (SELECT 1 FROM recipe_tags WHERE recipe_id = 42 AND tag_id = (SELECT id FROM tags WHERE slug = 'quick'));
EOF
```

### Add an allergen to a recipe

```bash
sqlite3 data/food.db <<EOF
-- Ensure allergen exists
INSERT OR IGNORE INTO allergens (slug, name) VALUES ('peanuts', 'Peanuts');

-- Add the allergen
INSERT INTO recipe_allergens (recipe_id, allergen_id, position)
SELECT 42, id, 1 FROM allergens WHERE slug = 'peanuts'
WHERE NOT EXISTS (SELECT 1 FROM recipe_allergens WHERE recipe_id = 42 AND allergen_id = (SELECT id FROM allergens WHERE slug = 'peanuts'));
EOF
```

### Remove a tag or allergen

```bash
sqlite3 data/food.db "DELETE FROM recipe_tags WHERE recipe_id = 42 AND tag_id = (SELECT id FROM tags WHERE slug = 'quick');"
sqlite3 data/food.db "DELETE FROM recipe_allergens WHERE recipe_id = 42 AND allergen_id = (SELECT id FROM allergens WHERE slug = 'peanuts');"
```

## Adding Nutrition Data

### View current nutrition

```bash
sqlite3 data/food.db "SELECT * FROM recipe_nutrition WHERE recipe_id = 42;" -header
```

### Add or update nutrition facts

```bash
sqlite3 data/food.db <<EOF
INSERT INTO recipe_nutrition (recipe_id, calories_kcal_per_serving, protein_g_per_serving, carbs_g_per_serving, fat_g_per_serving, notes)
VALUES (42, 245, 3.5, 32, 12, 'Per cookie')
ON CONFLICT(recipe_id) DO UPDATE SET
   calories_kcal_per_serving = 245,
   protein_g_per_serving = 3.5,
   carbs_g_per_serving = 32,
   fat_g_per_serving = 12,
   notes = 'Per cookie';
EOF
```

## Adding a New Recipe

### Create the recipe

```bash
sqlite3 data/food.db <<EOF
INSERT INTO recipes (slug, name, yield_servings, prep_minutes, cook_minutes, serving_procedure, notes_markdown, source_path)
VALUES (
   'my-new-recipe',
   'My New Recipe',
   4,
   15,
   30,
   'Serve warm',
   'This is a test recipe',
   'docs/my-new-recipe.md'
);
EOF
```

### Get the new recipe ID

```bash
sqlite3 data/food.db "SELECT id FROM recipes WHERE slug = 'my-new-recipe';"
```

### Add ingredients, steps, tags, allergens to the new recipe using the IDs above

Use the commands in sections above.

## Data Integrity & Best Practices

### Slug Generation
- Use lowercase, hyphen-separated format
- Examples: `chocolate-chip-cookies`, `slow-cooker-beef-stew`, `quick-pasta-primavera`
- Slugs must be unique across all recipes

### Position Ordering
- `position` field determines display order in UI
- Must be sequential integers starting at 1
- After deleting items, re-number positions to maintain sequence

### Foreign Key Constraints
- Always reference valid recipe IDs when adding ingredients/steps/tags/allergens
- Check if referenced IDs exist before inserting
- Deleting a recipe cascades deletions to all related data

### Validation Queries

**Check recipe integrity:**
```bash
sqlite3 data/food.db <<EOF
-- Find recipes without ingredients
SELECT r.id, r.name FROM recipes r
LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
WHERE ri.id IS NULL;

-- Find recipes without steps
SELECT r.id, r.name FROM recipes r
LEFT JOIN recipe_steps rs ON r.id = rs.recipe_id
WHERE rs.id IS NULL;

-- Find recipes with non-sequential positions
SELECT recipe_id, COUNT(*) as count, MAX(position) as max_pos
FROM recipe_ingredients
GROUP BY recipe_id
HAVING count != max_pos;
EOF
```

### Transaction Safety

For complex multi-step edits, wrap in a transaction:

```bash
sqlite3 data/food.db <<EOF
BEGIN TRANSACTION;

UPDATE recipes SET name = 'New Name' WHERE id = 42;
DELETE FROM recipe_ingredients WHERE recipe_id = 42;
INSERT INTO recipe_ingredients (recipe_id, position, quantity, unit, item, scalable)
VALUES (42, 1, 2, 'cups', 'flour', 1);

COMMIT;
EOF
```

If something goes wrong, use `ROLLBACK;` instead of `COMMIT;`

## Backup & Recovery


### Create a backup before major changes
```bash
cp data/food.db data/food.db.$(date +%Y-%m-%d-%H%M%S).backup
```

### Restore from backup
```bash
cp data/food.db.2024-05-15-143022.backup data/food.db
```

### Export database to JSON for version control
```bash
sqlite3 data/food.db --json > data/food-export.json
```

### Compare changes between backups
```bash
sqlite3 data/food.db.backup "SELECT * FROM recipes;" > before.txt
sqlite3 data/food.db "SELECT * FROM recipes;" > after.txt
diff before.txt after.txt
```

## Common Tasks

### Copy a recipe

```bash
sqlite3 data/food.db <<EOF
-- Get max recipe ID to find next available
SELECT MAX(id) FROM recipes;

-- Create new recipe based on existing one
INSERT INTO recipes (slug, name, yield_servings, prep_minutes, cook_minutes, serving_procedure, notes_markdown, source)
SELECT slug || '-copy', name || ' (Copy)', yield_servings, prep_minutes, cook_minutes, serving_procedure, notes_markdown, source
FROM recipes
WHERE id = 42;

-- Get the new recipe ID
SELECT id FROM recipes WHERE slug LIKE '%copy' ORDER BY id DESC LIMIT 1;

-- Copy ingredients to new recipe
INSERT INTO recipe_ingredients (recipe_id, position, quantity, unit, item, note, scalable)
SELECT [NEW_ID], position, quantity, unit, item, note, scalable
FROM recipe_ingredients
WHERE recipe_id = 42;

-- Repeat for steps, tags, allergens, nutrition, etc.
EOF
```

### Merge allergens from one recipe to another

```bash
sqlite3 data/food.db <<EOF
INSERT INTO recipe_allergens (recipe_id, allergen_id, position)
SELECT 99, allergen_id, (SELECT COALESCE(MAX(position), 0) + 1 FROM recipe_allergens WHERE recipe_id = 99)
FROM recipe_allergens
WHERE recipe_id = 42;
EOF
```

### Find all recipes with a specific allergen

```bash
sqlite3 data/food.db "SELECT r.name FROM recipes r JOIN recipe_allergens ra ON r.id = ra.recipe_id JOIN allergens a ON ra.allergen_id = a.id WHERE a.slug = 'peanuts';" -header
```

### Rebuild positions after deletion

```bash
sqlite3 data/food.db <<EOF
-- For recipe_ingredients
WITH numbered AS (
   SELECT id, recipe_id, ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY position) as new_pos
   FROM recipe_ingredients
)
UPDATE recipe_ingredients
SET position = (SELECT new_pos FROM numbered WHERE numbered.id = recipe_ingredients.id);

-- For recipe_steps
WITH numbered AS (
   SELECT id, recipe_id, ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY position) as new_pos
   FROM recipe_steps
)
UPDATE recipe_steps
SET position = (SELECT new_pos FROM numbered WHERE numbered.id = recipe_steps.id);
EOF
```

## Rebuilding the Site After Changes

After editing `data/food.db`, rebuild the site for changes to take effect:

```bash
npm run build
```

Or in development:

```bash
npm run dev
```

The dev server auto-reloads when `data/food.db` changes.

## Quick Reference

| Task | Command |
|------|---------|
| List recipes | `sqlite3 data/food.db "SELECT id, slug, name FROM recipes ORDER BY name;" -header` |
| List tags | `sqlite3 data/food.db "SELECT id, slug, name FROM tags;" -header` |
| List allergens | `sqlite3 data/food.db "SELECT id, slug, name FROM allergens;" -header` |
| View recipe details | `sqlite3 data/food.db "SELECT * FROM recipes WHERE slug = 'recipe-name';"` |
| Backup database | `cp data/food.db data/food.db.backup` |
| Export to JSON | `sqlite3 data/food.db --json > export.json` |
| Interactive mode | `sqlite3 data/food.db` (then use SQL commands) |
| Exit interactive mode | `.quit` or `Ctrl+D` |

## Interactive SQLite Mode

For complex queries or multiple operations, use interactive mode:

```bash
sqlite3 data/food.db

SQLite version 3.x.x ...
sqlite> .mode column
sqlite> .headers on
sqlite> SELECT * FROM recipes LIMIT 5;
sqlite> .quit
```

**Useful interactive commands:**
- `.tables` — List all tables
- `.schema [TABLE]` — Show table structure
- `.mode column` — Column-aligned output
- `.headers on` — Show column headers
- `.import [FILE]` — Import CSV
- `.output [FILE]` — Redirect output to file
- `.quit` — Exit

---

**Last Updated:** May 5, 2026
**Version:** 2.0 - Direct SQLite Editing



