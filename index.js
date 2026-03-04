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

function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Convert RTF to readable text
function rtfToText(rtf) {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, (m) => {
      const hex = m.slice(2);
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/\\u(-?\d+)\??/g, (_, num) => {
      let n = parseInt(num, 10);
      if (n < 0) n = 65536 + n;
      return String.fromCharCode(n);
    })
    .replace(/\\\*hyperlink\s+"[^"]*"\s*/gi, "")
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/[{}]/g, "")
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
  const files = fs.readdirSync(folder).filter(f => f.endsWith(".rtf"));

  const now = new Date();
  const day = now.getDate();
  const monthName = removeAccents(meses[now.getMonth()]).toLowerCase();

  const dateRegex = new RegExp(`\\b${day}\\s+de\\s+${esc(monthName)}\\b`);

  let found = null;

  for (const file of files) {

    const rtf = fs.readFileSync(path.join(folder, file), "utf8");

    const rawText = normalize(rtfToText(rtf));
    const matchText = removeAccents(rawText).toLowerCase();

    const start = matchText.search(dateRegex);

    if (start === -1) continue;

    const lineStart = matchText.lastIndexOf("\n", start);
    const sliceFrom = lineStart === -1 ? 0 : lineStart + 1;

    const slicedRaw = rawText.slice(sliceFrom);

    const nextHeading = new RegExp(
      `\\n(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\\s+\\d+\\s+de\\s+(?:${meses.map(m => esc(removeAccents(m))).join("|")})`,
      "i"
    );

    const next = slicedRaw.slice(1).search(nextHeading);

    const block = normalize(
      next === -1 ? slicedRaw : slicedRaw.slice(0, next + 1)
    );

    found = block;
    break;
  }

  if (!found) throw new Error("Entry not found");

  const parts = found
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n+/g, " ").trim())
    .filter(Boolean);

  const heading = cleanForDiscord(parts[0] || "");
  const verse = cleanForDiscord(parts[1] || "");
  const paragraph = cleanForDiscord(parts[2] || "");

  const formattedHeading =
    heading.charAt(0).toUpperCase() + heading.slice(1);

  const intro =
    "Buenos días, mis queridos hermanos y mis queridos pecadores espirituales este es el texto del dia de hoy\n";

  const message =
`${intro}

📖 **TEXTO DEL DÍA**

**${formattedHeading}**
────────────

📜 **Versículo**
"${verse}"

💭 **Comentario**
${paragraph}
`;

  await axios.post(WEBHOOK, { content: message });

}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
