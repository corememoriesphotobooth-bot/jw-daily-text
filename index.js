const axios = require("axios");
const fs = require("fs");
const path = require("path");

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

// Simple RTF -> text (works well for your JW RTF files)
function rtfToText(rtf) {
  return rtf
    // convert paragraph markers to newlines
    .replace(/\\par[d]?/g, "\n")
    // remove common RTF control words (keep their content)
    .replace(/\\'[0-9a-fA-F]{2}/g, (m) => {
      // hex encoded chars like \'e1
      const hex = m.slice(2);
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/\\u(-?\d+)\??/g, (_, num) => {
      let n = parseInt(num, 10);
      if (n < 0) n = 65536 + n;
      return String.fromCharCode(n);
    })
    // strip remaining control words and groups
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/[{}]/g, "")
    // cleanup spacing
    .replace(/\n[ \t]+\n/g, "\n\n");
}

async function main(){
  if (!WEBHOOK) throw new Error("Missing DISCORD_WEBHOOK_URL secret");

  const folder = "./rtf";

  const now = new Date();
  const day = now.getDate();
  const monthName = meses[now.getMonth()];

  const heading = new RegExp(
    `\\b${weekday}\\s+${day}\\s+de\\s+${esc(monthName)}\\b`,
    "i"
  );

  if (!fs.existsSync(folder)) throw new Error("Missing /rtf folder in repo");

  const files = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith(".rtf"));
  if (files.length === 0) throw new Error("No .rtf files found in /rtf");

  let found = null;

 
