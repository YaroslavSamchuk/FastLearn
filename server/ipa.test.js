import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  extractDictionaryApiPhonetic,
  extractOrdnetDdo,
  extractUdtaleordbogDdo,
  extractWiktionaryDanishDdo,
  ipaShardHash,
  lookupWordInTsvShard,
  nstSampaToDdo,
  resolveWordListPronunciation
} from './ipa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_IPA_DIR = path.resolve(__dirname, '..', 'public', 'ipa');

test('converts NST Danish X-SAMPA into DDO notation with stress and stød', () => {
  assert.equal(nstSampaToDdo('"sbi:$sd@'), '[ˈsbiːsdə]');
  assert.equal(nstSampaToDdo('vQ$"dan'), '[vɒˈdan]');
  assert.equal(nstSampaToDdo('"bR2D?'), '[ˈbʁøðˀ]');
  assert.equal(nstSampaToDdo('en$fQ$ma$"s\'o:?n'), '[enfɒmaˈɕoːˀn]');
  assert.equal(nstSampaToDdo('"s\'E:?l'), '[ˈɕɛːˀl]');
});

test('resolves Danish inflections and English words directly from built TSV shards without external calls', async () => {
  let fallbackCalls = 0;
  const readShard = async (lang, hash) => {
    const file = path.join(PUBLIC_IPA_DIR, lang, `${hash}.txt`);
    return fs.readFile(file, 'utf8');
  };

  const danish = await resolveWordListPronunciation(
    'Hej! Hvordan går det i dag? Jeg spiste brød og kaffe i København.',
    'da',
    {
      readShard,
      fetchFallbackWord: async () => {
        fallbackCalls++;
        return '';
      }
    }
  );
  assert.equal(fallbackCalls, 0);
  assert.match(danish, /^\[ˈhɑj vʌˈdan ˈgɒˀ ˈde ˈiˀ ˈdæˀ/);
  assert.match(danish, /ˈsbiːsdə/);
  assert.match(danish, /ˈbʁøðˀ/);

  const english = await resolveWordListPronunciation('Hello coffee world', 'en', {
    readShard,
    fetchFallbackWord: async () => {
      fallbackCalls++;
      return '';
    }
  });
  assert.equal(fallbackCalls, 0);
  assert.match(english, /^\/[^/]+\s+[^/]+\s+[^/]+\/$/);
});

test('rejects phrases longer than 20 words and caps fallback lookups for missing words', async () => {
  const twentyOneWords = Array.from({ length: 21 }, (_, idx) => `ord${idx}`).join(' ');
  let shardReads = 0;
  const overLimit = await resolveWordListPronunciation(twentyOneWords, 'da', {
    readShard: async () => {
      shardReads++;
      return '';
    }
  });
  assert.equal(overLimit, '');
  assert.equal(shardReads, 0);

  let fallbackCount = 0;
  const twelveMissing = Array.from({ length: 12 }, (_, idx) => `zqxmissing${idx}`).join(' ');
  await resolveWordListPronunciation(twelveMissing, 'da', {
    readShard: async () => '\n',
    fetchFallbackWord: async (word) => {
      fallbackCount++;
      return `[${word}]`;
    }
  });
  assert.equal(fallbackCount, 10);
});

test('extracts DDO and IPA formats cleanly from real dictionary markup', () => {
  const ordnetHtml =
    '<span class="lydskrift"><span class="kilde-group group"><button class="kilde">[<span>vɒˈdan</span>]</button><span class="popup">ignored</span></span></span>';
  assert.equal(extractOrdnetDdo(ordnetHtml), '[vɒˈdan]');

  const udtaleHtml =
    '<ul><li><span class="ipa" id="x">[ˈsbiːsdə] </span></li></ul>';
  assert.equal(extractUdtaleordbogDdo(udtaleHtml), '[ˈsbiːsdə]');

  assert.equal(extractWiktionaryDanishDdo('==Danish== {{IPA|da|[ˈkɑfə]}}'), '[ˈkɑfə]');
  assert.equal(extractDictionaryApiPhonetic([{ phonetic: '/ˈhɛloʊ/' }]), '/ˈhɛloʊ/');
  assert.equal(
    lookupWordInTsvShard(`\nhello\t/həˈloʊ/\n`, 'hello'),
    '/həˈloʊ/'
  );
  assert.equal(ipaShardHash('hej').length, 2);
});

test('resolves Danish and English closed compound words (direct and with -s- linker) from local TSV shards without external calls', async () => {
  let fallbackCalls = 0;
  const readShard = async (lang, hash) => {
    const file = path.join(PUBLIC_IPA_DIR, lang, `${hash}.txt`);
    return fs.readFile(file, 'utf8');
  };

  const phraseIpa = await resolveWordListPronunciation(
    'Jeg er klar til at hjælpe dig med din dansktræning',
    'da',
    {
      readShard,
      fetchFallbackWord: async () => {
        fallbackCalls++;
        return '';
      }
    }
  );
  assert.equal(fallbackCalls, 0);
  assert.match(phraseIpa, /ˈdanˀsɡˌtʁeːneŋ\]$/);

  const sLinker = await resolveWordListPronunciation('forårsvejr kanelsnegl', 'da', {
    readShard,
    fetchFallbackWord: async () => {
      fallbackCalls++;
      return '';
    }
  });
  assert.equal(fallbackCalls, 0);
  assert.match(sLinker, /ˈfɒːɒːsˌvɛɐˀ/);
  assert.match(sLinker, /kaˈneːˀlˌsnɑjˀl/);

  const englishCompound = await resolveWordListPronunciation('coffeetime', 'en', {
    readShard,
    fetchFallbackWord: async () => {
      fallbackCalls++;
      return '';
    }
  });
  assert.equal(fallbackCalls, 0);
  assert.match(englishCompound, /^\/[^/]+ˌ[^/]+\/$/);
});

test('ignores redirected ordnet.dk headwords when expectedWord differs', () => {
  const redirectedHtml =
    '<span class="match">bagpå</span><span class="lydskrift"><span class="kilde-group"><button>[ˈbæˀpɔ]</button></span></span>';
  assert.equal(extractOrdnetDdo(redirectedHtml, 'på'), '');
});
