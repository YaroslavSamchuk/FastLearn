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

function getDanishPosPriority(pos, word) {
  if (!pos) return 1;
  if (pos.startsWith('PM|person')) return 3;
  if (pos.startsWith('PM')) return word[0] === word[0].toLowerCase() ? 1 : 2;
  if (/^(VB|NN|AB|PN|PP|IN|DT|CS|RG|RO|IE)\b/.test(pos)) return 0;
  return 1;
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

// Modern Copenhagen DDO forms (verified against udtaleordbog.dk DDO) for core high-frequency
// Danish words whose 2003 NST entries retain older vowel symbols or formal citation endings.
const MODERN_DANISH_DDO_OVERRIDES = {
  hej: '[ˈhɑj]',
  hvordan: '[vʌˈdan]',
  'går': '[ˈgɒˀ]',
  det: '[ˈde]',
  i: '[ˈiˀ]',
  dag: '[ˈdæˀ]',
  morgen: '[ˈmɒːɒn]',
  aften: '[ˈɑfdn̩]',
  nat: '[ˈnad]',
  hvad: '[ˈva]',
  hvor: '[ˈvɒˀ]',
  hvorfor: '[vʌˈfʌ]',
  hvem: '[ˈvɛmˀ]',
  'hvornår': '[vʌˈnɒˀ]',
  hvilken: '[ˈvelgŋ̩]',
  jeg: '[ˈjɑj]',
  du: '[ˈdu]',
  han: '[ˈhan]',
  hun: '[ˈhun]',
  den: '[dn̩]',
  vi: '[ˈviˀ]',
  jer: '[ˈjæɐ̯]',
  de: '[ˈdi]',
  mig: '[ˈmɑj]',
  dig: '[ˈdɑj]',
  sig: '[ˈsɑj]',
  os: '[ˈoˀs]',
  dem: '[ˈdɛm]',
  er: '[a]',
  var: '[ˈvɑˀ]',
  'være': '[ˈvɛːɐ]',
  har: '[ˈhɒˀ]',
  havde: '[ˈhæːð̩]',
  have: '[ˈhæːʊ]',
  kan: '[ˈka]',
  kunne: '[ˈku]',
  skal: '[ˈsgalˀ]',
  skulle: '[ˈsgu]',
  vil: '[ve]',
  ville: '[ˈvill̩]',
  'må': '[ˈmɔˀ]',
  'måtte': '[ˈmʌɾə]',
  'gør': '[ˈgøɐ̯ˀ]',
  gjorde: '[ˈgjoɐ̯ɾə]',
  siger: '[ˈsiɐ̯]',
  sagde: '[ˈsæːæ]',
  ved: '[ˈveð]',
  vidste: '[ˈvesdə]',
  vide: '[ˈviːð̩]',
  bliver: '[bliɐ̯]',
  blev: '[ˈblewˀ]',
  blive: '[ˈbliːi]',
  med: '[ˈmɛð]',
  til: '[ˈte]',
  'på': '[pɔ]',
  af: '[a]',
  fra: '[fʁɑ]',
  for: '[ˈfoɐ̯ˀ]',
  om: '[ˈʌmˀ]',
  over: '[ˈɒwɐ]',
  under: '[ˈɔnɐ]',
  ikke: '[ˈeg]',
  'også': '[ˈʌs]',
  godt: '[ˈgʌd]',
  god: '[ˈgoˀ]',
  meget: '[ˈmɑːð̩]',
  mange: '[ˈmɑŋŋ̩]',
  noget: '[ˈnɔːð̩]',
  nogen: '[ˈnoːon]',
  her: '[ˈheɐ̯ˀ]',
  der: '[dɐ]',
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
