// language: JavaScript, file: scripts/build-ipa-shards.mjs, target: Node.js CLI
// Builds 256 deterministic TSV shards per language under public/ipa/{da,en}/00..ff.txt
// Sources:
//   - Danish: NST Pronunciation Lexicon for Danish (CC0, nb.no) -> DDO notation
//   - English: open-dict-data/ipa-dict en_US.txt (MIT) -> US English IPA

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipaShardHash, nstSampaToDdo } from '../server/ipa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_IPA_DIR = path.join(ROOT_DIR, 'public', 'ipa');
const CACHE_DIR = path.join(os.tmpdir(), 'ipa_probe');

const NST_ARCHIVE_URL =
  'https://www.nb.no/sbfil/leksikalske_databaser/leksikon/da_leksikon.tar.gz';
const IPA_DICT_EN_US_URL =
  'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt';

function ensureSources() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const nstLexiconPath = path.join(CACHE_DIR, 'dan030224NST.pron', 'dan030224NST.pron');
  if (!fs.existsSync(nstLexiconPath)) {
    const tarPath = path.join(CACHE_DIR, 'da_leksikon.tar.gz');
    if (!fs.existsSync(tarPath)) {
      console.log('Downloading NST Danish Pronunciation Lexicon...');
      execFileSync('curl.exe', ['-sL', NST_ARCHIVE_URL, '-o', tarPath], { stdio: 'inherit' });
    }
    execFileSync('tar', ['-xzf', tarPath, '-C', CACHE_DIR], { stdio: 'inherit' });
  }

  const enUsPath = path.join(CACHE_DIR, 'en_US.txt');
  if (!fs.existsSync(enUsPath)) {
    console.log('Downloading ipa-dict en_US.txt...');
    execFileSync('curl.exe', ['-sL', IPA_DICT_EN_US_URL, '-o', enUsPath], { stdio: 'inherit' });
  }

  return { nstLexiconPath, enUsPath };
}

function getDanishPosPriority(pos, rawWord) {
  const isLowercase = rawWord === rawWord.toLowerCase();
  const casePenalty = isLowercase ? 0 : 10;

  if (!pos) return casePenalty + 3;
  if (pos.startsWith('PM|person')) return casePenalty + 5;
  if (pos.startsWith('PM')) return casePenalty + 4;
  if (/^(PN|PP|KN|DT|AB|IN|IE|CS)\b/.test(pos)) return casePenalty + 0;
  if (/^(VB|NN)\b/.test(pos)) return casePenalty + 1;
  return casePenalty + 2;
}

function writeLanguageShards(language, entriesMap) {
  const outDir = path.join(PUBLIC_IPA_DIR, language);
  fs.mkdirSync(outDir, { recursive: true });

  const buckets = Array.from({ length: 256 }, () => []);
  for (const [word, ipa] of entriesMap.entries()) {
    const hex = ipaShardHash(word);
    buckets[Number.parseInt(hex, 16)].push(`${word}\t${ipa}`);
  }

  let totalBytes = 0;
  let maxBytes = 0;
  for (let i = 0; i < 256; i++) {
    const hex = i.toString(16).padStart(2, '0');
    buckets[i].sort();
    const content = buckets[i].length > 0 ? `\n${buckets[i].join('\n')}\n` : '\n';
    const bytes = Buffer.byteLength(content, 'utf8');
    totalBytes += bytes;
    if (bytes > maxBytes) maxBytes = bytes;
    fs.writeFileSync(path.join(outDir, `${hex}.txt`), content, 'utf8');
  }

  return {
    entries: entriesMap.size,
    totalMB: (totalBytes / 1048576).toFixed(2),
    avgShardKB: (totalBytes / 256 / 1024).toFixed(1),
    maxShardKB: (maxBytes / 1024).toFixed(1)
  };
}

// Standard Den Danske Ordbog (ordnet.dk) citation forms for high-frequency Danish words
// where 2003 NST entries retain older vowel notation or ambiguous POS homographs.
// Contextual reductions (e.g. infinitive at -> [ʌ], unstressed tryktab) are handled per phrase in server/ipa.js.
const MODERN_DANISH_DDO_OVERRIDES = {
  hej: '[ˈhɑj]',
  hvordan: '[vʌˈdan]',
  'går': '[ˈgɒˀ]',
  det: '[ˈde]',
  i: '[ˈiˀ]',
  dag: '[ˈdæˀ]',
  morgen: '[ˈmɒːɒn]',
  aften: '[ˈɑfdən]',
  nat: '[ˈnad]',
  hvad: '[ˈva]',
  hvor: '[ˈvɒˀ]',
  hvorfor: '[vʌˈfʌ]',
  hvem: '[ˈvɛmˀ]',
  'hvornår': '[vʌˈnɒˀ]',
  hvilken: '[ˈvelɡən]',
  jeg: '[ˈjɑj]',
  du: '[ˈdu]',
  han: '[ˈhan]',
  hun: '[ˈhun]',
  den: '[ˈdɛnˀ]',
  vi: '[ˈviˀ]',
  jer: '[ˈjæɐ̯]',
  de: '[ˈdi]',
  mig: '[ˈmɑj]',
  dig: '[ˈdɑj]',
  sig: '[ˈsɑj]',
  os: '[ˈoˀs]',
  dem: '[ˈdɛm]',
  at: '[ad]',
  er: '[ˈɛɐ̯]',
  var: '[ˈvɑˀ]',
  'være': '[ˈvɛːɐ]',
  har: '[ˈhɑːˀ]',
  havde: '[ˈhæːðə]',
  have: '[ˈhæːvə]',
  kan: '[ˈkænˀ]',
  kunne: '[ˈkunə]',
  skal: '[ˈsgalˀ]',
  skulle: '[ˈsgulə]',
  vil: '[ˈvel]',
  ville: '[ˈvilə]',
  'må': '[ˈmɔˀ]',
  'måtte': '[ˈmʌdə]',
  'gør': '[ˈgøɐ̯ˀ]',
  gjorde: '[ˈgjoɐ̯]',
  siger: '[ˈsiːɐ]',
  sagde: '[ˈsaːə]',
  ved: '[ˈveðˀ]',
  vidste: '[ˈvesdə]',
  vide: '[ˈviːðə]',
  bliver: '[ˈbliɐ̯]',
  blev: '[ˈblewˀ]',
  blive: '[ˈbliːə]',
  med: '[ˈmɛð]',
  til: '[ˈtel]',
  'på': '[ˈpɔːˀ]',
  af: '[ˈaːˀ]',
  fra: '[ˈfʁɑːˀ]',
  for: '[ˈfɒ]',
  om: '[ˈʌmˀ]',
  over: '[ˈɒwɐ]',
  under: '[ˈɔnɐ]',
  ikke: '[ˈegə]',
  'også': '[ˈʌs]',
  godt: '[ˈgʌd]',
  god: '[ˈgoˀ]',
  meget: '[ˈmɑjəð]',
  mange: '[ˈmɑŋə]',
  noget: '[ˈnɔːəð]',
  nogen: '[ˈnoːən]',
  her: '[ˈheɐ̯ˀ]',
  der: '[ˈdeɐ̯ˀ]',
  nu: '[ˈnu]',
  ja: '[ˈja]',
  nej: '[ˈnɑjˀ]',
  tak: '[ˈtɑg]',
  undskyld: '[ˈɔnsgylˀ]',
  'tøj': '[ˈtʌj]',
  op: '[ˈʌb]'
};

function buildDanishMap(nstLexiconPath) {
  const raw = fs.readFileSync(nstLexiconPath, 'latin1');
  const best = new Map();

  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split(';');
    const rawWord = (cols[0] || '').trim();
    const pos = (cols[1] || '').trim();
    const sampa = (cols[11] || '').trim();

    if (!rawWord || !sampa || rawWord.includes('_') || /\d/.test(rawWord)) continue;
    const word = rawWord.toLowerCase();
    const ddo = nstSampaToDdo(sampa);
    if (!ddo) continue;

    const priority = getDanishPosPriority(pos, rawWord);
    const prev = best.get(word);
    if (!prev || priority < prev.priority) {
      best.set(word, { priority, ddo });
    }
  }

  const out = new Map();
  for (const [word, entry] of best.entries()) out.set(word, entry.ddo);
  for (const [word, ddo] of Object.entries(MODERN_DANISH_DDO_OVERRIDES)) {
    out.set(word, ddo);
  }
  return out;
}

function buildEnglishMap(enUsPath) {
  const raw = fs.readFileSync(enUsPath, 'utf8');
  const out = new Map();

  for (const line of raw.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const word = line.slice(0, tab).trim().toLowerCase();
    const ipa = line.slice(tab + 1).split(',')[0].trim();
    if (!word || !ipa || out.has(word)) continue;
    out.set(word, ipa);
  }

  return out;
}

const { nstLexiconPath, enUsPath } = ensureSources();
const daMap = buildDanishMap(nstLexiconPath);
const enMap = buildEnglishMap(enUsPath);

const daStats = writeLanguageShards('da', daMap);
const enStats = writeLanguageShards('en', enMap);

console.log('IPA TSV shards built:', { da: daStats, en: enStats });
