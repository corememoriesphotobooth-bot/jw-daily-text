import axios from "axios";
import cheerio from "cheerio";

const WOL_URL = "https://wol.jw.org/es/wol/h/r4/lp-s";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function fetchDailyText() {
  const { data } = await axios.get(WOL_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(data);

  const title = $("h1").first().text().trim();
  const content = $("#content").text().trim();

  const cleaned = content
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1500);

 return `🌅 **Buenos días, mis queridos hermanos y mis queridos pecadores espirituales.**\n\n**${title}**\n\n${cleaned}\n\n🔗 ${WOL_URL}`;
}

async function postToDiscord(message) {
  await axios.post(DISCORD_WEBHOOK_URL, { content: message });
}

(async () => {
  const msg = await fetchDailyText();
  await postToDiscord(msg);
})();
