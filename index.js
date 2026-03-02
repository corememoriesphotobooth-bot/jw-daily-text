const axios = require("axios");
const cheerio = require("cheerio");

const WOL_URL = "https://wol.jw.org/es/wol/h/r4/lp-s";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK_URL secret");
}

function chunkText(text, maxLen = 1900) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // try to cut on a paragraph break first
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < 800) cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < 800) cut = maxLen;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
}

async function fetchDailyText() {
  const { data } = await axios.get(WOL_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(data);

  // Try to target the "today" content block
  // WOL pages can vary, so we use best-effort selectors:
  let mainText =
    $("#content").text() ||
    $("main").text() ||
    $("body").text();

  mainText = mainText
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Optional cleanup: remove the big WOL header noise if it appears
  mainText = mainText.replace(/BIBLIOTECA EN LÍNEA Watchtower[\s\S]*?Hoy\s*/i, "").trim();

  // If it still contains multiple days, keep only the first day block
  // We cut at the next weekday name if present.
  const weekdayRegex = /\n(?:Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)\b/gi;
  const matches = [...mainText.matchAll(weekdayRegex)];
  if (matches.length > 1) {
    // keep from first weekday occurrence to before second weekday
    const start = matches[0].index ?? 0;
    const end = matches[1].index ?? mainText.length;
    mainText = mainText.slice(start, end).trim();
  }

  const greeting = "🌅 **Buenos días, mis queridos hermanos y mis queridos pecadores espirituales.**";
  const fullMessage = `${greeting}\n\n${mainText}\n\n🔗 ${WOL_URL}`;

  return fullMessage;
}

async function postToDiscordInChunks(fullMessage) {
  const parts = chunkText(fullMessage, 1900);

  for (let i = 0; i < parts.length; i++) {
    const prefix = parts.length > 1 ? `**(Parte ${i + 1}/${parts.length})**\n` : "";
    await axios.post(DISCORD_WEBHOOK_URL, { content: prefix + parts[i] });
  }
}

(async () => {
  const msg = await fetchDailyText();
  await postToDiscordInChunks(msg);
  console.log("Posted daily text.");
})();
