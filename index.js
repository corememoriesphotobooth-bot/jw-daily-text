const axios = require("axios");
const cheerio = require("cheerio");

const WOL_URL = "https://wol.jw.org/es/wol/h/r4/lp-s"; // WOL "Hoy"
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK_URL secret");
}

// Split long messages so Discord webhook doesn't reject (2000 char limit)
function chunkText(text, maxLen = 1900) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < 800) cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < 800) cut = maxLen;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function fetchDailyText() {
  const { data } = await axios.get(WOL_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(data);

  // Today's date in YOUR timezone (Pacific)
  // Example output: "lunes, 2 de marzo"
  const today = new Intl.DateTimeFormat("es-ES", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const todayKey = normalize(today);

  // Get readable text
  let text =
    $("#content").text() ||
    $("main").text() ||
    $("body").text();

  text = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Split into blocks starting at weekday headings
  const blocks = text.split(
    /\n(?=Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo)\b/
  );

  // Find the block that contains today's date
  const todaysBlock = blocks.find((b) => normalize(b).includes(todayKey));

  const greeting =
    "🌅 **Buenos días, mis queridos hermanos y mis queridos pecadores espirituales.**";

  if (!todaysBlock) {
    // fallback (so it never fails silently)
    return `${greeting}\n\n⚠️ No pude encontrar el texto exacto de hoy (**${today}**). Publicando el más cercano disponible.\n\n${
      blocks[0] || text
    }\n\n🔗 ${WOL_URL}`;
  }

  return `${greeting}\n\n${todaysBlock.trim()}\n\n🔗 ${WOL_URL}`;
}

async function postToDiscordInChunks(fullMessage) {
  const parts = chunkText(fullMessage, 1900);

  for (let i = 0; i < parts.length; i++) {
    const prefix =
      parts.length > 1 ? `**(Parte ${i + 1}/${parts.length})**\n` : "";
    await axios.post(DISCORD_WEBHOOK_URL, { content: prefix + parts[i] });
  }
}

(async () => {
  const msg = await fetchDailyText();
  await postToDiscordInChunks(msg);
  console.log("Posted daily text.");
})();
