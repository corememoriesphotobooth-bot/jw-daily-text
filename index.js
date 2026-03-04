const axios = require("axios");
const fs = require("fs");
const path = require("path");

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

const meses = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre"
];

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(t) {
  return t
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n") // keep paragraph breaks
    .trim();
}

function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Convert RTF to readable text
function rtfToText(rtf) {
  return rtf
    // Paragraphs -> newlines
    .replace(/\\par[d]?/g, "\n")
    // Hex chars like \'e1
    .replace(/\\'[0-9a-fA-F]{2}/g, (m) => {
      const hex = m.slice(2);
      return String.fromCharCode(parseInt(hex, 16));
    })
    // Unicode chars like \u243?
    .replace(/\\u(-?\d+)\??/g, (_, num) => {
      let n = parseInt(num, 10);
      if (n < 0) n = 65536 + n;
      return String.fromCharCode(n);
    })
    // Remove hyperlink tokens (Discord hates these)
    .replace(/\\\*hyperlink\s+"[^"]*"\s*/gi, "")
    // Strip remaining control words
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    // Strip braces
    .replace(/[{}]/g, "")
    // Clean extra blank lines
    .replace(/\n[ \t]+\n/g, "\n\n");
}

function cleanForDiscord(s) {
  return s
    .replace(/\\\*hyperlink\s+"[^"]*"\s*/gi, "")
    .replace(/\\[a-zA-Z]+\d*\s?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main() {
  if (!WEBHOOK) throw new Error("Missing DISCORD_WEBHOOK_URL secret");

  const folder = "./rtf";
  if (!fs.existsSync(folder)) throw new Error("Missing /rtf folder in repo");

  const files = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith(".rtf"));
  if (files.length === 0) throw new Error("No .rtf files found in /rtf");

  const now = new Date();
  const day = now.getDate();
  const monthName = removeAccents(meses[now.getMonth()]).toLowerCase();

  // Match by "4 de marzo" (ignoring weekday for robustness)
  const dateRegex = new RegExp(`\\b${day}\\s+de\\s+${esc(monthName)}\\b`, "i");

  // Build month list for next-heading detection
  const mesesNoAcc = meses.map(m => esc(removeAccents(m).toLowerCase())).join("|");
  const nextHeadingRe = new RegExp(
    `\\n(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\\s+\\d+\\s+de\\s+(?:${mesesNoAcc})\\b`,
    "i"
  );

  let found = null;

  for (const file of files) {
    const rtf = fs.readFileSync(path.join(folder, file), "utf8");
    const rawText = normalize(rtfToText(rtf));

    const matchText = removeAccents(rawText).toLowerCase();
    const start = matchText.search(dateRegex);
    if (start === -1) continue;

    // Start at the beginning of the line that contains the heading
    const lineStart = matchText.lastIndexOf("\n", start);
    const sliceFrom = lineStart === -1 ? 0 : lineStart + 1;

    const slicedRaw = rawText.slice(sliceFrom);
    const next = slicedRaw.slice(1).search(nextHeadingRe);

    const block = normalize(next === -1 ? slicedRaw : slicedRaw.slice(0, next + 1));
    found = block;
    break;
  }

  if (!found) throw new Error("Entry not found");

  // ✅ NEW PARSING LOGIC:
  // Line 1 = heading
  // Line 2 = verse
  // Rest = commentary
  const lines = found
    .split("\n")
    .map(l => cleanForDiscord(l).trim())
    .filter(Boolean);

  const heading = lines[0] || "";
  const verse = lines[1] || "";
  const commentary = lines.slice(2).join(" ").trim();

  const formattedHeading = heading
    ? heading.charAt(0).toUpperCase() + heading.slice(1)
    : "";

  const intro =
    "Buenos días, mis queridos hermanos y mis queridos pecadores espirituales este es el texto del dia de hoy";

  const line = "────────────";

  const message = cleanForDiscord(
`${intro}

📖 **TEXTO DEL DÍA**

**${formattedHeading}**
${line}

📜 **Versículo**
"${verse}"

💭 **Comentario**
${commentary}
`
  );

  await axios.post(WEBHOOK, { content: message });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
