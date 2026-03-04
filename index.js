const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { stripRtf } = require("striprtf");

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

const meses = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre"
];

const weekday = "(?:Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)";

function esc(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function normalize(t){
  return t
  .replace(/\r/g,"")
  .replace(/[ \t]+\n/g,"\n")
  .replace(/\n{3,}/g,"\n\n")
  .trim();
}

async function rtfToText(rtf){
  const out = stripRtf(rtf);
  return typeof out === "string" ? out : out.result;
}

async function main(){

  const folder = "./rtf";

  const now = new Date();
  const day = now.getDate();
  const monthName = meses[now.getMonth()];

  const heading = new RegExp(
    `\\b${weekday}\\s+${day}\\s+de\\s+${esc(monthName)}\\b`,
    "i"
  );

  const files = fs.readdirSync(folder).filter(f => f.endsWith(".rtf"));

  let found = null;

  for (const file of files){

    const rtf = fs.readFileSync(path.join(folder,file),"utf8");

    const text = normalize(await rtfToText(rtf));

    const start = text.search(heading);

    if(start === -1) continue;

    const sliced = text.slice(start);

    const nextHeading = new RegExp(
      `\\n${weekday}\\s+\\d+\\s+de\\s+(?:${meses.map(esc).join("|")})`
    );

    const next = sliced.slice(1).search(nextHeading);

    const block = normalize(
      next === -1 ? sliced : sliced.slice(0,next+1)
    );

    found = block;

    break;

  }

  if(!found) throw new Error("Entry not found");

  const parts = found
  .split(/\n\s*\n/)
  .map(p => p.replace(/\n+/g," ").trim())
  .filter(Boolean);

  const headingLine = parts[0];
  const verse = parts[1];
  const paragraph = parts[2];

  const intro =
  "Buenos días, mis queridos hermanos y mis queridos pecadores espirituales este es el texto del dia de hoy\n\n";

  const message =
  intro +
  `**${headingLine}**\n` +
  `*${verse}*\n\n` +
  `${paragraph}`;

  await axios.post(WEBHOOK,{content:message});

}

main();
