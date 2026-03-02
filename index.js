const axios = require("axios");
const cheerio = require("cheerio");

const WOL_URL = "https://wol.jw.org/es/wol/h/r4/lp-s";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK_URL secret");
}

async function fetchDailyText() {
  const { data } = await axios.get(WOL_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(data);

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "Texto diario";

  // Pull main readable text
  const content =
    $("#content").text().trim() ||
    $("main").text().trim() ||
    $("body").text().trim();

  const cleaned = content
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return `🌅 **Buenos días, mis queridos hermanos y mis queridos pecadores espirituales.**\n\n**${title}**\n\n${cleaned}\n\n🔗 ${WOL_URL}`;
}

async function postToDiscord(message) {
  await axios.post(DISCORD_WEBHOOK_URL, { content: message });
}

(async () => {
  const msg = await fetchDailyText();
  await postToDiscord(msg);
  console.log("Posted daily text.");
})();
