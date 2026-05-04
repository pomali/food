import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";

const sourcePath = process.argv[2] ?? "./DDKK.ods";
const targetDir = path.resolve("src/content/recipes");

const COLUMNS = {
  name: "Nazov",
  ingredients: "📃Ingrediencie",
  category: "🗄Kategória",
  freezer: "❄️Mrazničkovateľné?",
  procedure: "👨‍🍳Postup",
  links: "🔗Linky",
};

const categoryDefaults = {
  male: { yieldServings: 2, prepMinutes: 10, cookMinutes: 10, tags: ["small bites"] },
  velke: { yieldServings: 4, prepMinutes: 20, cookMinutes: 30, tags: ["lunch", "dinner", "main"] },
  polievka: { yieldServings: 4, prepMinutes: 15, cookMinutes: 30, tags: ["soup", "lunch"] },
  kolac: { yieldServings: 8, prepMinutes: 20, cookMinutes: 35, tags: ["cake", "sweet", "dessert"] },
  priloha: { yieldServings: 4, prepMinutes: 10, cookMinutes: 20, tags: ["side dish"] },
};

const allergenMatchers = [
  ["milk", /mlieko|bryndza|syr|smotana|jogurt|tvaroh|maslo|mozzarella|parmezan/i],
  ["eggs", /vajcia?|vajicka/i],
  ["gluten", /muka|múka|chlieb|rohlik|rožok|cestovin|keks|struhanka|pizza cesto/i],
  ["fish", /losos|tunak|tuniak|ryb/i],
  ["nuts", /orechy|mandle|lieskovce|arasidy|arašidy/i],
  ["soy", /soja|s[óo]jov|tofu|tempeh/i],
  ["beef", /hovadzie|hov[aä]dzie/i],
  ["veal", /telacie|te[lľ]acie/i],
  ["mustard", /horcica|horčica/i],
];

const normalize = (value) =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const splitList = (value) =>
  String(value || "")
    .split(/\n|,|;|\|/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const splitLines = (value) =>
  String(value || "")
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseIngredients = (raw) => {
  const lines = String(raw || "")
    .split(/\n|;/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);

  return lines.map((line) => {
    const match = line.match(/^(\d+(?:[\.,]\d+)?)\s*([\p{L}%]+)?\s*(.*)$/u);
    if (!match) {
      return { item: line, scalable: true };
    }

    const quantity = Number.parseFloat(match[1].replace(",", "."));
    const unit = (match[2] || "").trim();
    const item = (match[3] || "").trim() || line;

    return {
      quantity: Number.isFinite(quantity) ? quantity : undefined,
      unit: unit || undefined,
      item,
      scalable: true,
    };
  });
};

const toYamlArray = (arr, indent = "  ") =>
  arr.length ? arr.map((item) => `${indent}- ${JSON.stringify(String(item))}`).join("\n") : `${indent}[]`;

const toYamlIngredients = (ingredients) => {
  if (!ingredients.length) {
    return "  - item: unknown ingredient\n    scalable: true";
  }

  return ingredients
    .map((ing) => {
      const parts = ["  -"];
      if (typeof ing.quantity === "number") parts.push(` quantity: ${ing.quantity}`);
      if (ing.unit) parts.push(` unit: ${JSON.stringify(ing.unit)}`);
      parts.push(` item: ${JSON.stringify(ing.item)}`);
      parts.push(` scalable: ${ing.scalable ? "true" : "false"}`);
      return parts.join("\n    ");
    })
    .join("\n");
};

const inferEquipment = (procedureText, categoryKey) => {
  const text = `${procedureText} ${categoryKey}`.toLowerCase();
  const equipment = new Set();

  if (/panvici|panvica|opek|sma[zž]/i.test(text)) equipment.add("frying pan");
  if (/pec|rur|zapek|kolac|koláč/i.test(text)) {
    equipment.add("oven");
    equipment.add("baking dish");
  }
  if (/var|poliev|hrniec/i.test(text)) equipment.add("pot");
  if (/mix|zmies|zmie[sš]/i.test(text)) equipment.add("mixing bowl");

  if (!equipment.size) {
    equipment.add("pot");
  }

  return Array.from(equipment);
};

const inferServingProcedure = (categoryKey) => {
  if (categoryKey === "kolac") {
    return "Serve cooled or at room temperature.";
  }
  return "Serve warm unless the recipe is intended cold.";
};

const inferAllergens = (name, ingredientsText) => {
  const text = `${name}\n${ingredientsText}`;
  return allergenMatchers
    .filter(([, matcher]) => matcher.test(text))
    .map(([label]) => label);
};

const inferTags = (categoryKey, freezerValue, name) => {
  const tags = new Set(categoryDefaults[categoryKey]?.tags ?? []);
  const freezerNormalized = normalize(freezerValue);
  const nameNormalized = normalize(name);

  if (freezerNormalized.startsWith("ano") || freezerNormalized === "mozno") {
    tags.add("freezer-friendly");
  }

  if (nameNormalized.includes("palacink")) tags.add("breakfast");
  if (nameNormalized.includes("prazenic") || nameNormalized.includes("prazenica")) tags.add("breakfast");
  if (nameNormalized.includes("salat") || nameNormalized.includes("salát")) tags.add("cold");

  return Array.from(tags);
};

const compactLinks = (linksText) =>
  splitLines(linksText).filter((value) => /^https?:\/\//i.test(value));

const toRecipeMarkdown = (row) => {
  const name = String(row[COLUMNS.name] || "Untitled Recipe").trim();
  const slug = slugify(name) || `recipe-${Date.now()}`;

  const categoryText = String(row[COLUMNS.category] || "").trim();
  const categoryKey = normalize(categoryText);
  const freezerValue = String(row[COLUMNS.freezer] || "").trim();
  const ingredientsText = String(row[COLUMNS.ingredients] || "").trim();
  const procedureText = String(row[COLUMNS.procedure] || "").trim();
  const links = compactLinks(String(row[COLUMNS.links] || ""));

  const defaults = categoryDefaults[categoryKey] ?? {
    yieldServings: 4,
    prepMinutes: 15,
    cookMinutes: 20,
    tags: [],
  };

  const ingredients = parseIngredients(ingredientsText);
  const equipment = inferEquipment(procedureText, categoryKey);
  const procedure = splitLines(procedureText);
  const tags = inferTags(categoryKey, freezerValue, name);
  const allergens = inferAllergens(name, ingredientsText);
  const servingProcedure = inferServingProcedure(categoryKey);

  const nutritionNotes = "Nutrition value not provided in DDKK source. Add calories/macros during review.";
  const bodySections = [
    "Imported from DDKK spreadsheet. Review and enrich this recipe manually.",
    categoryText ? `Original category: ${categoryText}` : "",
    freezerValue ? `Freezer note: ${freezerValue}` : "",
    links.length ? `Source links:\n${links.map((link) => `- ${link}`).join("\n")}` : "",
  ].filter(Boolean);

  const markdown = `---
name: ${JSON.stringify(name)}
yieldServings: ${defaults.yieldServings}
ingredients:
${toYamlIngredients(ingredients)}
prepMinutes: ${defaults.prepMinutes}
cookMinutes: ${defaults.cookMinutes}
equipment:
${toYamlArray(equipment)}
cookingProcedure:
${toYamlArray(procedure.length ? procedure : ["Procedure not provided in source. Review required."])}
servingProcedure: ${JSON.stringify(servingProcedure)}
nutrition:
  notes: ${JSON.stringify(nutritionNotes)}
allergens:
${toYamlArray(allergens)}
tags:
${toYamlArray(tags)}
alternatives:
  []
source: DDKK import (${path.basename(sourcePath)})
---
${bodySections.join("\n\n")}
`;

  return { slug, markdown };
};

const run = async () => {
  const absoluteSource = path.resolve(sourcePath);

  const buffer = await fs.readFile(absoluteSource);
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets.Recepty;
  if (!sheet) {
    throw new Error('Worksheet "Recepty" not found in source file.');
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) {
    throw new Error("Worksheet is empty.");
  }

  await fs.mkdir(targetDir, { recursive: true });

  let created = 0;
  for (const row of rows) {
    const name = String(row[COLUMNS.name] || "").trim();
    if (!name) continue;

    const { slug, markdown } = toRecipeMarkdown(row);
    const filePath = path.join(targetDir, `${slug}.md`);
    await fs.writeFile(filePath, markdown, "utf8");
    created += 1;
  }

  console.log(`Imported ${created} recipes from ${absoluteSource} into ${targetDir}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
