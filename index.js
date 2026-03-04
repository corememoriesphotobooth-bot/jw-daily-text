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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Remove accents so "Miércoles" == "Miercoles", "día" == "dia", etc.
function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Simple RTF -> text (works well for these JW RTF files)
function rtfToText(rtf) {
  return rtf
    // paragraph markers -> newlines
    .replace(/\\par[d]?/g, "\n")
    // hex chars like \'e1
    .replace(/\\'[0-9a-fA-F]{2}/g, (m) => {
      const hex = m.slice(2);
      return String.fromCharCode(parseInt(hex, 16));
    })
    // unicode chars like \u243?
    .replace(/\\u(-?\d+)\??/g, (_, num) => {
      let n = parseInt(num, 10);
      if (n < 0) n = 65536 + n;
      return String.fromCharCode(n);
    })
    // strip remaining control words
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    // strip braces
    .replace(/[{}]/g, "")
    // cleanup extra blank lines
    .replace(/\n[ \t]+\n/g, "\n\n");
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

  // Only match "4 de enero" (ignore weekday completely to avoid encoding issues)
  const heading = new RegExp(`\\b${day}\\s+de\\s+${esc(monthName)}\\b`, "i");

  let found = null;

  for (const file of files) {
    const rtf = fs.readFileSync(path.join(folder, file), "utf8");

    // normalize + remove accents + lowercase
    const text = removeAccents(normalize(rtfToText(rtf))).toLowerCase();

    const start = text.search(heading);
    if (start === -1) continue;

    // Find the start of the line that contains the date heading
    const lineStart = text.lastIndexOf("\n", start);
    const sliceFrom = lineStart === -1 ? 0 : lineStart + 1;

    const sliced = text.slice(sliceFrom);

    // Next day heading is another "<number> de <month>"
    const nextHeading = new RegExp(
      `\\n(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\\s+\\d+\\s+de\\s+(?:${meses.map(m => esc(removeAccents(m).toLowerCase())).join("|")})\\b`,
      "i"
    );

    const next = sliced.slice(1).search(nextHeading);

    const block = normalize(
      next === -1 ? sliced : sliced.slice(0, next + 1)
    );

    found = block;
    break;
  }

  if (!found) throw new Error(`Entry not found for: ${day} de ${monthName}`);

  // Split into paragraphs
  const parts = found
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n+/g, " ").trim())
    .filter(Boolean);

  // Expected:
  // 0: heading line (e.g., "domingo 4 de enero")
  // 1: verse line(s)
  // 2: first paragraph
  const headingLine = parts[0] || "";
  const verse = parts[1] || "";
  const paragraph = parts[2] || "";

  const intro =
    "Buenos días, mis queridos hermanos y mis queridos pecadores espirituales este es el texto del dia de hoy\n\n";

  const message =
    intro +
    `**${headingLine.charAt(0).toUpperCase() + headingLine.slice(1)}**\n` +
    `*${verse}*\n\n` +
    `${paragraph}`;

  await axios.post(WEBHOOK, { content: message });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
