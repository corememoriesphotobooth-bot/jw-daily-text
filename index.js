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

// Simple RTF -> text (good for these JW RTF files)
function rtfToText(rtf) {
  return rtf
    // paragraph markers -> newlines
    .replace(/\\par[d]?/g, "\n")
    // RTF hyperlink control words sometimes appear as: {\*\hyperlink "url"} or \*hyperlink "url"
    .replace(/\{\\\*\\hyperlink\s+"[^"]*"\}/gi, "")
    .replace(/\\\*hyperlink\s+"[^"]*"\s*/gi, "")
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

// Final cleanup before sending to Discord
function cleanForDiscord(s) {
  return s
    // remove any leftover hyperlink tokens
    .replace(/\\\*hyperlink\s+"[^"]*"\s*/gi, "")
    // remove any leftover RTF control words
    .replace(/\\[a-zA-Z]+\d*\s?/g, "")
    // normalize spaces
    .replace(/[ \t]{2,}/g, " ")
    // keep paragraph breaks clean
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

  // Match by "4 de enero" (ignore weekday completely to avoid encoding variations)
  const dateRe = new RegExp(`\\b${day}\\s+de\\s+${esc(monthName)}\\b`, "i");

  let found = null;

  // Build month list (accent-free, lowercase) for next-heading detection
  const mesesNoAcc = meses.map(m => esc(removeAccents(m).toLowerCase())).join("|");
  const nextHeadingRe = new RegExp(
    `\\n(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\\s+\\d+\\s+de\\s+(?:${mesesNoAcc})\\b`,
    "i"
  );

  for (const file of files) {
    const rtf = fs.readFileSync(path.join(folder, file), "utf8");

    // Convert and normalize, then remove accents for robust matching
    const rawText = normalize(rtfToText(rtf));
    const textMatch = removeAccents(rawText).toLowerCase();

    const start = textMatch.search(dateRe);
    if (start === -1) continue;

    // Find start of the line containing the heading
    const lineStart = textMatch.lastIndexOf("\n", start);
    const sliceFrom = lineStart === -1 ? 0 : lineStart + 1;

    const slicedMatch = textMatch.slice(sliceFrom);

    const next = slicedMatch.slice(1).search(nextHeadingRe);

    // IMPORTANT: slice the ORIGINAL (rawText) in the same region for best output text quality
    // We approximate by slicing rawText using the same indices from textMatch.
    const slicedRaw = rawText.slice(sliceFrom);
    const blockRaw = normalize(next === -1 ? slicedRaw : slicedRaw.slice(0, next + 1));

    found = blockRaw;
    break;
  }

  if (!found) throw new Error(`Entry not found for: ${day} de ${monthName}`);

  // Split into paragraphs
  const parts = found
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n+/g, " ").trim())
    .filter(Boolean);

  const headingLine = cleanForDiscord(parts[0] || "");
  const verse = cleanForDiscord(parts[1] || "");
  const paragraph = cleanForDiscord(parts[2] || "");

  const intro =
    "Buenos días, mis queridos hermanos y mis queridos pecadores espirituales este es el texto del dia de hoy\n\n";

  const formattedHeading =
    headingLine ? headingLine.charAt(0).toUpperCase() + headingLine.slice(1) : "";

  const message = cleanForDiscord(
    intro +
    `**${formattedHeading}**\n` +
    `*${verse}*\n\n` +
    `${paragraph}`
  );

  await axios.post(WEBHOOK, { content: message });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
