#!/usr/bin/env node
// lint-ia.mjs — flags "AI slop" patterns in markdown / HTML / text files and scores each file 0-100.
// Companion to content/GRILLE-ANTI-IA.md (section 4/5). No dependencies. Node >= 18.
//
// Usage:
//   node content/lint-ia.mjs <file|dir> [...]     scan .md .markdown .html .htm .txt (dirs recursively)
//   node content/lint-ia.mjs --verbose page.html   show every hit with line / snippet
//   node content/lint-ia.mjs --json post.md        machine-readable output
//   node content/lint-ia.mjs --min 85 dir/         exit 1 if any file scores below 85 (default 70)
//   node content/lint-ia.mjs --list                print the phrase rules
//   cat post.txt | node content/lint-ia.mjs -      read stdin (treated as plain text)
//
// Escapes: a line containing "lint-ia-ignore" is skipped; a file containing "lint-ia: off" is skipped.
// The score is a heuristic for editors, not an AI detector. Read GRILLE-ANTI-IA.md before trusting it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Phrase rules. level: ban = never in published copy, limit = allowed sparingly.
// Patterns are matched case-insensitively on text where ’ is normalised to ' and nbsp to space.
// ---------------------------------------------------------------------------
const RULES = [
  // ---- FR: openers, filler, conclusions
  ['fr', 'ban', "dans un monde (?:en (?:constante|perpétuelle|pleine) (?:évolution|mutation)|où|qui|de plus en plus)", "Supprimer. Ouvrir sur le fait ou le problème du lecteur."],
  ['fr', 'ban', "en (?:constante|perpétuelle) (?:évolution|mutation)", "Dire ce qui change, quand, et de combien."],
  ['fr', 'ban', "à l'ère (?:du numérique|de l'ia|de l'intelligence artificielle|digitale)", "Supprimer, ou dater (« depuis 2024 »)."],
  ['fr', 'ban', "dans le (?:paysage|contexte) (?:actuel|numérique|concurrentiel)", "Supprimer, ou nommer le marché et le chiffre."],
  ['fr', 'ban', "il est (?:essentiel|crucial|primordial|important|indispensable|capital|fondamental) (?:de|d'|que)", "Dire quoi faire, et pourquoi (un fait)."],
  ['fr', 'ban', "il convient de (?:noter|souligner|rappeler|préciser|mentionner)", "Commencer par l'affirmation."],
  ['fr', 'ban', "force est de constater", "Supprimer."],
  ['fr', 'ban', "n'hésitez (?:surtout )?pas à", "Verbe direct (« Répondez », « Téléchargez ») ou rien."],
  ['fr', 'ban', "plongeons(?:-nous)?|plong(?:er|ez|eons) (?:au cœur|dans l'univers)", "Supprimer ; entrer dans le sujet."],
  ['fr', 'ban', "en somme|en conclusion|pour conclure|en définitive|en résumé|pour résumer|vous l'aurez compris|le mot de la fin", "Finir sur la prochaine action ou un fait nouveau, pas un résumé."],
  ['fr', 'ban', "dans cet article,? (?:nous )?(?:allons|verrons|explorerons|découvrirons)", "Répondre tout de suite à la question."],
  ['fr', 'ban', "tout ce que vous devez savoir|(?:le )?guide (?:ultime|complet|définitif)", "Titre qui dit la réponse ou le périmètre exact."],
  ['fr', 'ban', "sans plus attendre", "Supprimer."],
  // ---- FR: inflated vocabulary
  ['fr', 'ban', "incontournables?", "Dire pourquoi c'est utile, ou supprimer."],
  ['fr', 'ban', "(?:un |une |de )?véritables? (?:levier|atout|révolution|game[- ]changer|pilier|enjeu|allié|tournant|mine d'or|casse-tête)", "Supprimer « véritable » et nommer l'effet chiffré."],
  ['fr', 'limit', "véritables?", "Supprimer (presque toujours inutile)."],
  ['fr', 'ban', "boost(?:er|ez|e|é|ée|és|ées|ons|s|ing|ed)?", "« augmenter de X % », « faire passer de A à B »."],
  ['fr', 'ban', "révolutionn(?:er|ez|e|ent|ant|aire|aires)|changer la donne|game[- ]chang(?:er|ing)", "Décrire le changement concret."],
  ['fr', 'ban', "propuls(?:er|ez|e|ent)|sublim(?:er|ez|e|ent)|transcend(?:er|ez|e)", "Verbe concret : publier, envoyer, réduire…"],
  ['fr', 'ban', "leviers? (?:de croissance|de performance|stratégiques?|puissants?|essentiels?|majeurs?)", "Nommer le mécanisme."],
  ['fr', 'limit', "leviers?", "« moyen », « outil », ou le nom de la chose."],
  ['fr', 'limit', "optimis(?:er|ez|ons|ation|ations|e|é|ée|és|ées)", "« réduire », « accélérer », « corriger » + chiffre."],
  ['fr', 'ban', "pierre angulaire|fer de lance|clé de voûte|maître[- ]mot|le nerf de la guerre", "Dire la chose simplement."],
  ['fr', 'ban', "que vous soyez [^.?!\\n]{1,60}? ou ", "Nommer le lecteur visé (un seul)."],
  ['fr', 'ban', "navigu(?:er|ez|ons|ant) (?:dans|à travers|au sein|entre|les)", "« comprendre », « s'y retrouver », « trier »."],
  ['fr', 'ban', "synergies?|holistiques?|paradigmes?", "Supprimer ou nommer la collaboration concrète."],
  ['fr', 'limit', "écosystèmes?|robustes?|innovant(?:e|es|s)?|intuiti(?:f|ve|fs|ves)|fluides?|fluidité|sans couture|sans friction", "Fait vérifiable à la place de l'adjectif."],
  ['fr', 'ban', "(?:jou(?:e|ent|er)) un rôle (?:clé|crucial|essentiel|central|majeur|déterminant|primordial)", "Dire ce que ça fait."],
  ['fr', 'ban', "soulign(?:e|ent|er|ant) l'importance|met(?:tre|tent|tant)? en (?:lumière|exergue)", "« montre », ou la donnée elle-même."],
  ['fr', 'limit', "témoign(?:e|ent|er|ant) de|(?:s'impose|se positionne|se pose|s'affirme) comme", "« est », « a »."],
  ['fr', 'ban', "un atout (?:majeur|précieux|indéniable|de taille)|riches? et variée?s?|un jeu d'enfant", "Supprimer ou prouver."],
  ['fr', 'limit', "valeur ajoutée|au cœur de|en toute sérénité|l'esprit tranquille|en un clin d'œil|clés? en main", "Dire le résultat concret."],
  ['fr', 'limit', "crucial(?:e|es|aux)?|essentiel(?:le|les|s)?|primordial(?:e|es|aux)?", "Montrer l'enjeu (délai, coût, risque)."],
  ['fr', 'limit', "en outre|par ailleurs|de plus,|néanmoins|notamment|dès lors", "Supprimer la transition ou lien précis."],
  ['fr', 'limit', "accompagn(?:er|ons|ez|ement|e|ent)|maximis(?:er|ez|e)|valoris(?:er|ez|e)|décupl(?:er|ez|e)", "Verbe concret + objet précis."],
  ['fr', 'limit', "découvrez|explorons|explorez", "Dire ce que le lecteur obtient."],
  ['fr', 'ban', "prêts? à (?:booster|transformer|révolutionner|propulser|passer|faire passer)|(?:au|le) niveau supérieur", "CTA littéral : « Télécharger le tableau (gratuit) »."],
  // ---- FR: e-mail
  ['fr', 'ban', "j'espère que (?:ce (?:message|mail|e-mail|courriel) vous trouve|vous allez bien|vous vous portez bien|vous passez)", "Première ligne = le fait qui justifie l'e-mail."],
  ['fr', 'ban', "je me permets de vous (?:contacter|écrire|solliciter|relancer)", "Entrer dans le sujet."],
  ['fr', 'ban', "(?:une |la )?(?:petite )?question rapide", "Poser la question."],
  ['fr', 'limit', "je reste à votre (?:entière )?disposition", "« Répondez à ce message » ou rien."],
  // ---- FR: LinkedIn
  ['fr', 'ban', "(?:et vous|qu'en pensez-vous|vous en pensez quoi|vous êtes d'accord)\\s?\\?", "Finir sur une info ou une question précise, pas un appât."],
  ['fr', 'limit', "(?:le secret|la clé|la raison|le résultat|la réponse|le problème|la vérité|la suite)\\s?\\?", "Dire la chose directement."],
  ['fr', 'limit', "voici (?:pourquoi|comment|ce que|ce qu'il)|spoiler\\s?:|résultat\\s?:", "Supprimer l'annonce, donner l'info."],
  ['fr', 'ban', "reli(?:sez|re) (?:ça|cette phrase|bien)", "Supprimer."],
  // ---- FR: negative parallelism ("Ce n'est pas X, c'est Y")
  ['fr', 'ban', "ce n'est pas (?:juste |seulement |qu'|que |simplement )?[^.!?\\n]{1,60}?(?:[,;:—–-]|\\.)\\s*c'est", "Dire Y directement."],
  ['fr', 'ban', "il ne s'agit pas (?:seulement |simplement |juste )?d[e'][^.!?\\n]{1,60}?[,;:—–.-]\\s*(?:il s'agit|c'est)", "Dire Y directement."],
  ['fr', 'limit', "non seulement[^.!?\\n]{1,80}?mais (?:aussi|également|encore)|pas (?:seulement|uniquement|juste) [^.!?\\n]{1,60}?, mais", "Une seule affirmation, la plus forte."],
  ['fr', 'ban', "pas de [^.!?\\n]{1,30}\\. pas de [^.!?\\n]{1,30}\\. (?:juste|seulement|que)", "Phrase normale."],

  // ---- EN
  ['en', 'ban', "delv(?:e|es|ed|ing)|tapestry|(?:a |is a |stands as a )?testament to|underscor(?:e|es|ed|ing)|pivotal|intricac(?:y|ies)|intricate|meticulous(?:ly)?|realm", "Plain word: look at, shows, key, careful."],
  ['en', 'ban', "(?:ever[- ]evolving|ever[- ]changing|rapidly evolving|fast[- ]paced) (?:world|landscape|environment|market)", "Cut. Open with the reader's problem."],
  ['en', 'ban', "in today's (?:fast[- ]paced |digital |competitive |modern )?(?:world|age|landscape|era|environment|market)", "Cut."],
  ['en', 'ban', "navigat(?:e|es|ing) (?:the )?(?:complexities|landscape|world|challenges|maze)", "Understand, sort out, handle."],
  ['en', 'ban', "seamless(?:ly)?|unlock(?:s|ed|ing)?|elevat(?:e|es|ed|ing)|empower(?:s|ed|ing|ment)?|supercharg(?:e|es|ed|ing)|revolutioni[sz](?:e|es|ed|ing)|cutting[- ]edge|unleash(?:es|ed|ing)?|transformative|holistic|synerg(?:y|ies)|paradigm", "Say what it does, with a number."],
  ['en', 'ban', "harness(?:es|ing)? the power|foster(?:s|ed|ing)?|embark(?:s|ed|ing)? on|nestled|vibrant", "Plain verb."],
  ['en', 'ban', "plays? a (?:crucial|pivotal|key|vital|significant|central) role", "Say what it does."],
  ['en', 'ban', "in conclusion|in summary|to sum up|it(?:'s| is) (?:important|worth|crucial) (?:to note|noting|to remember)", "Cut; end on the next step."],
  ['en', 'ban', "i hope (?:this|my) (?:e-?mail |message |note )?finds you well|quick question|i came across your profile", "First line = the researched fact."],
  ['en', 'ban', "here's the thing|let that sink in|read that again|the best part\\s?\\?|agree\\s?\\?|thoughts\\s?\\?", "Cut the hook / bait."],
  ['en', 'ban', "whether you(?:'re| are) [^.?!\\n]{1,50}? or |look no further|to the next level|(?:let's|let us) dive (?:in|into|deeper)", "Name one reader; just start."],
  ['en', 'ban', "(?:it'?s|this is|that'?s|it is) not (?:just |only |merely |about )?[^.!?\\n]{1,60}?[,;:—–.-]\\s*(?:it'?s|it is|this is)|(?:isn't|is not) (?:just |only )?[^.!?\\n]{1,60}?[,;:—–.-]\\s*it'?s|not (?:just|only|merely) [^.!?\\n]{1,60}?,? but", "Say Y directly."],
  ['en', 'ban', "no [^.!?\\n]{1,30}[.,] no [^.!?\\n]{1,30}[.,] just", "Normal sentence."],
  ['en', 'limit', "the (?:result|secret|reason|truth|kicker|catch)\\s?\\?", "Say it directly."],
  ['en', 'limit', "leverag(?:e|es|ed|ing)|robust|streamlin(?:e|es|ed|ing)|crucial|comprehensive|moreover|furthermore|additionally|journey|landscape|showcas(?:e|es|ed|ing)|boasts?|(?:serves|stands) as|deep dive|here's (?:why|how|what)|game plan", "Plain word, or cut."],
];

const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
const COMPILED = RULES.map(([lang, level, src, fix]) => ({ lang, level, src, fix, re: new RegExp(B + '(?:' + src + ')' + E, 'giu') }));

// ---------------------------------------------------------------------------
// Text extraction (line-preserving for markdown/text; best effort for HTML).
// ---------------------------------------------------------------------------
const blank = (s) => s.replace(/[^\n]/g, ' ');
const CODE_LANGS = /^(?:js|javascript|mjs|ts|typescript|tsx|jsx|bash|sh|shell|zsh|console|json|jsonc|yaml|yml|toml|html|xml|css|scss|py|python|sql|go|rust|java|php|ruby|diff|ini|csv|mermaid|dockerfile|makefile)\b/i;

function fromMarkdown(raw) {
  let t = raw.replace(/^---\n[\s\S]*?\n---\n/, blank);                       // front matter
  t = t.replace(/^(```|~~~)([^\n]*)\n[\s\S]*?^\1[^\n]*$/gm, (m, f, lang) => (CODE_LANGS.test(lang.trim()) ? blank(m) : m.replace(/^(```|~~~).*$/gm, '')));
  t = t.replace(/<!--[\s\S]*?-->/g, blank);
  t = t.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));                    // inline code
  t = t.replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1');                          // links / images -> text
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/^\s*\|?\s*:?-{3,}.*$/gm, '');                                  // table separators
  t = t.replace(/\|/g, ' ');
  return t;
}

function fromHtml(raw) {
  const extra = [];
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) extra.push('# ' + title[1].trim());
  for (const m of raw.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:description|og:title)["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']*)["']/i);
    if (c) extra.push(c[1]);
  }
  for (const m of raw.matchAll(/\salt=["']([^"']{3,})["']/gi)) extra.push(m[1]);
  let t = raw.replace(/<(script|style|noscript|svg|template|pre|code)[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/<h([1-6])[^>]*>/gi, (m, n) => '\n\n' + '#'.repeat(+n) + ' ');
  t = t.replace(/<li[^>]*>/gi, '\n- ');
  t = t.replace(/<\/?(?:strong|b)(?:\s[^>]*)?>/gi, '**');
  t = t.replace(/<(?:br)\s*\/?>/gi, '\n');
  t = t.replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|ul|ol|blockquote|figure|figcaption|td|th|tr|main|aside|nav|button|a)>/gi, '\n\n');
  t = t.replace(/<\/li>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&#8217;/g, "'").replace(/&mdash;|&#8212;/g, '—').replace(/&ndash;|&#8211;/g, '–')
    .replace(/&ldquo;|&#8220;/g, '“').replace(/&rdquo;|&#8221;/g, '”').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&hellip;/g, '…').replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d));
  t = t.split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  return (extra.length ? extra.join('\n\n') + '\n\n' : '') + t;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const EMOJI = /(?![©®™‼])\p{Extended_Pictographic}/u;
const EMOJI_G = /(?![©®™‼])\p{Extended_Pictographic}/gu;
const BULLET_EMOJI = /^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)?(?![©®™‼✓✔➡→▶►☑])\p{Extended_Pictographic}/u;
const BULLET_SYMBOL = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?[✓✔➡→▶►☑➜]/u;
const STOP_OPENERS = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'et', 'the', 'a', 'an', 'and', 'to', 'of', 'in', 'en']);
const ITEM = "[\\p{L}][\\p{L}'’-]*(?: [\\p{L}][\\p{L}'’-]*){0,2}";
const TRIAD = new RegExp(`(?<![\\p{L}])${ITEM}, ${ITEM},? (?:et|and|ou|or) ${ITEM}(?![\\p{L}])`, 'gu');

function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; }
function snippet(text, idx, len) { return text.slice(Math.max(0, idx - 25), idx + len + 25).replace(/\s+/g, ' ').trim(); }
const cap = (v, max) => Math.min(v, max);

function analyse(raw, kind) {
  let text = kind === 'html' ? fromHtml(raw) : kind === 'md' ? fromMarkdown(raw) : raw;
  text = text.split('\n').map((l) => (l.includes('lint-ia-ignore') ? '' : l)).join('\n');
  const norm = text.replace(/[’‘]/g, "'").replace(/[\u00a0\u202f\u2009]/g, ' ');
  const words = (norm.match(WORD) || []).length;
  const where = (idx, len) => (kind === 'html' ? snippet(norm, idx, len) : `L${lineOf(norm, idx)}: ${snippet(norm, idx, len)}`);
  const penalties = [];
  const add = (key, label, points, hits, note = '') => { if (points > 0 || hits.length) penalties.push({ key, label, points: Math.round(points * 10) / 10, count: hits.length, note, hits }); };

  // 1. phrases
  // Overlapping matches are counted once: ban before limit, longest first ("véritable levier de croissance" = 1 hit).
  const found = [];
  for (const r of COMPILED) for (const m of norm.matchAll(r.re)) found.push({ level: r.level, s: m.index, e: m.index + m[0].length, text: m[0], fix: r.fix });
  found.sort((x, y) => (x.level === y.level ? (y.e - y.s) - (x.e - x.s) : x.level === 'ban' ? -1 : 1));
  const kept = [], ban = [], limit = [];
  for (const h of found) {
    if (kept.some((k) => h.s < k.e && k.s < h.e)) continue;
    kept.push(h);
    (h.level === 'ban' ? ban : limit).push({ text: h.text, at: where(h.s, h.e - h.s), fix: h.fix });
  }
  add('ban', 'banned phrases', cap(ban.length * 4, 40), ban);
  const limitAllow = Math.ceil(words / 150);
  add('limit', 'limited words', cap(Math.max(0, limit.length - limitAllow) * 1.5, 15), limit, `allowance ${limitAllow}`);

  // 2. em dashes
  const dashes = [...norm.matchAll(/—/g)].map((m) => ({ text: '—', at: where(m.index, 1) }));
  const dashAllow = Math.floor(words / 400);
  add('emdash', 'em dashes', cap(Math.max(0, dashes.length - dashAllow) * 1.5, 15), dashes, `allowance ${dashAllow}, ${(dashes.length / Math.max(words, 1) * 100).toFixed(2)}/100 words`);

  // 3. emoji as structure, decorative emoji
  const lines = norm.split('\n');
  const emojiBullets = [], symbolBullets = [], emojiInline = [];
  let offset = 0;
  for (const l of lines) {
    if (BULLET_EMOJI.test(l)) emojiBullets.push({ text: l.trim().slice(0, 40), at: where(offset, l.length) });
    else if (BULLET_SYMBOL.test(l)) symbolBullets.push({ text: l.trim().slice(0, 40), at: where(offset, l.length) });
    else if (EMOJI.test(l)) for (const m of l.matchAll(EMOJI_G)) emojiInline.push({ text: m[0], at: where(offset + m.index, 1) });
    offset += l.length + 1;
  }
  add('emojibullet', 'emoji bullets or headings', cap(emojiBullets.length * 3, 15), emojiBullets);
  add('symbolbullet', 'arrow / tick bullets (→ ✓)', cap(symbolBullets.length, 5), symbolBullets, 'fine in a pricing table, not in prose');
  add('emoji', 'decorative emoji', cap(Math.max(0, emojiInline.length - 1), 6), emojiInline, 'allowance 1');

  // 4. rule of three: inline triads + three-item lists
  // Enumerations containing a proper noun or a number (real lists: "Amazon, Vinted et Shopify") are not counted.
  const triads = [...norm.matchAll(TRIAD)].filter((m) => !m[0].split(/,\s|\s(?:et|and|ou|or)\s/).some((it) => /^\s*\p{Lu}/u.test(it) && !/^\s*\p{Lu}\p{Ll}*$/u.test(it.split(' ')[0]) || /\p{N}/u.test(it) || /(?:^|\s)\p{Lu}/u.test(it.trim().slice(1))))
    .map((m) => ({ text: m[0], at: where(m.index, m[0].length) }));
  const triadAllow = 1 + Math.floor(words / 150);
  add('triad', 'rule of three ("A, B et C")', cap(Math.max(0, triads.length - triadAllow) * 1.5, 10), triads, `allowance ${triadAllow}`);
  const lists = []; let run = 0;
  for (const l of [...lines, '']) {
    if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(l)) run++;
    else if (l.trim() === '' && run) continue;
    else { if (run) lists.push(run); run = 0; }
  }
  const threes = lists.filter((n) => n === 3).length;
  add('threelists', 'three-item lists', threes >= 2 ? cap((threes - 1) * 2, 6) : 0, threes ? [{ text: `${threes} of ${lists.length} lists have exactly 3 items`, at: '' }] : []);

  // 4b. inline-header lists ("- **Mot :** phrase")
  const inlineHeads = lines.filter((l) => /^\s*(?:[-*+]|\d+[.)])\s+(?:\S+\s+)?\*\*[^*]{1,40}\*\*\s*:|^\s*(?:[-*+]|\d+[.)])\s+(?:\S+\s+)?\*\*[^*]{1,40}\s?:\*\*/u.test(l));
  add('inlinehead', 'inline-header list items ("- **Mot :** ...")', inlineHeads.length >= 3 ? cap(inlineHeads.length, 6) : 0, inlineHeads.map((l) => ({ text: l.trim().slice(0, 40), at: '' })));

  // 5. headings: title case, colons
  const headings = lines.filter((l) => /^#{1,6}\s+\S/.test(l)).map((l) => l.replace(/^#+\s+/, '').replace(/\*\*/g, '').trim());
  const titleCase = headings.filter((h) => {
    const ws = h.split(/\s+/).slice(1).filter((w) => /^\p{L}{4,}/u.test(w) && !/^\p{Lu}{2,}/u.test(w));
    return ws.length >= 3 && ws.every((w) => /^\p{Lu}/u.test(w));
  });
  add('titlecase', 'Title Case Headings', cap(titleCase.length * 2, 8), titleCase.map((h) => ({ text: h, at: '' })));
  const colonH = headings.filter((h) => /\S\s?:\s/.test(h));
  const colonAllow = Math.max(1, Math.floor(headings.length * 0.3));
  add('colon', 'headings with a colon', cap(Math.max(0, colonH.length - colonAllow), 6), colonH.map((h) => ({ text: h, at: '' })), `allowance ${colonAllow} of ${headings.length}`);

  // 6. bold density
  const bolds = [...norm.matchAll(/\*\*[^*\n]+\*\*|__[^_\n]+__/g)];
  const boldAllow = Math.floor(words / 60);
  add('bold', 'bold spans', cap(Math.max(0, bolds.length - boldAllow), 8), bolds.map((m) => ({ text: m[0], at: where(m.index, m[0].length) })), `allowance ${boldAllow}`);

  // 7. exclamation marks, hashtags
  const excl = [...norm.matchAll(/!(?![\[(])/g)].filter((m) => norm[m.index - 1] !== '!');
  const exclAllow = Math.floor(words / 200);
  add('excl', 'exclamation marks', cap(Math.max(0, excl.length - exclAllow), 6), excl.map((m) => ({ text: '!', at: where(m.index, 1) })), `allowance ${exclAllow}`);
  const tags = [...norm.matchAll(/(?<=^|\s)#[\p{L}\p{N}_]{2,}/gu)];
  add('hashtags', 'hashtags beyond 3', cap(Math.max(0, tags.length - 3) * 2, 8), tags.length > 3 ? tags.map((m) => ({ text: m[0], at: '' })) : []);

  // 8. prose: paragraphs, sentences, rhythm, anaphora
  const paras = norm.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !/^(?:#|[-*+] |\d+[.)] )/.test(p) && (p.match(WORD) || []).length >= 2);
  const sentences = [];
  for (const p of paras) for (const s of p.replace(/\n/g, ' ').split(/(?<=[.!?…])\s+(?=[\p{Lu}«"(\d])/u)) { const n = (s.match(WORD) || []).length; if (n >= 2) sentences.push({ s, n }); }
  const oneLiners = paras.filter((p) => p.split(/(?<=[.!?…])\s+(?=\p{Lu})/u).length === 1 && (p.match(WORD) || []).length <= 25);
  const broetry = kind !== 'html' && paras.length >= 8 && oneLiners.length / paras.length >= 0.7; // HTML cells/buttons are not paragraphs
  add('broetry', 'one-line paragraphs ("broetry")', broetry ? 8 : 0, broetry ? [{ text: `${oneLiners.length}/${paras.length} paragraphs are one short sentence`, at: '' }] : []);
  let cv = null;
  if (sentences.length >= 10) {
    const mean = sentences.reduce((a, x) => a + x.n, 0) / sentences.length;
    const sd = Math.sqrt(sentences.reduce((a, x) => a + (x.n - mean) ** 2, 0) / sentences.length);
    cv = sd / mean;
    add('rhythm', 'monotone sentence length', cv < 0.35 ? 5 : 0, cv < 0.35 ? [{ text: `CV ${cv.toFixed(2)} over ${sentences.length} sentences (mean ${mean.toFixed(1)} words)`, at: '' }] : []);
  }
  const anaphora = []; let prev = null, streak = 1;
  for (const s of sentences.map((x) => x.s)) {
    const w = (s.toLowerCase().match(WORD) || [''])[0].replace(/'.*/, '');
    if (w && w === prev && !STOP_OPENERS.has(w)) { streak++; if (streak === 3) anaphora.push({ text: `3+ sentences open with "${w}"`, at: '' }); } else streak = 1;
    prev = w;
  }
  add('anaphora', 'repeated sentence openers', cap(anaphora.length * 2, 6), anaphora);

  // 8b. honesty flags: claims that must be backed by a real, citable source (grid section J)
  const honesty = [];
  const HONEST = [
    /(?<![\p{L}])(?:trusted by|loved by|join (?:over |more than )?[\d,. ]+\+?|thousands of (?:teams|users|customers|companies)|nous font confiance|des (?:milliers|centaines) d(?:e |')(?:clients|utilisateurs|entreprises|organismes)|(?:déjà )?(?:plus de|\+ ?de) [\d  .]+ (?:clients|utilisateurs|organismes|entreprises))/giu,
    /(?<![\p{L}\p{N}])(?:\d+ ?x(?![\p{L}])|[+]\s?\d+ ?%|99[.,]9 ?%|100 ?% (?:satisfaits|satisfied|garanti|guaranteed))/giu,
    /[«"“][^»"”\n]{10,300}[»"”]\s*[—–-]\s*\p{Lu}\p{Ll}+(?: \p{Lu}\.)?,? ?(?:\p{Lu}{2,}|CEO|fondat\p{L}+|founder|directeur|directrice|gérant\p{L}*)?/gu,
  ];
  for (const re of HONEST) for (const m of norm.matchAll(re)) honesty.push({ text: m[0].slice(-60), at: where(m.index, m[0].length), fix: 'Keep only with a real, named, checkable source (grid J).' });
  add('honesty', 'claims to verify (social proof, multipliers, testimonials)', cap(honesty.length * 3, 9), honesty);

  // 9. specifics density (numbers, prices, dates). Proxy only: names and sources are checked by hand.
  const specifics = (norm.match(/\p{N}+(?:[.,]\p{N}+)?/gu) || []).length;
  const specRate = words ? (specifics / words) * 100 : 0;
  const lowSpec = words >= 120 && specRate < 0.5;
  add('specifics', 'low specifics density', lowSpec ? 8 : 0, lowSpec ? [{ text: `${specifics} numbers in ${words} words (${specRate.toFixed(2)}/100)`, at: '' }] : []);

  const total = penalties.reduce((a, p) => a + p.points, 0);
  const score = Math.max(0, Math.round(100 - total));
  return { words, score, specRate: +specRate.toFixed(2), sentenceCV: cv === null ? null : +cv.toFixed(2), penalties: penalties.filter((p) => p.points > 0 || ['ban', 'limit', 'emdash', 'triad'].includes(p.key)) };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = { verbose: args.includes('--verbose') || args.includes('-v'), json: args.includes('--json'), list: args.includes('--list') };
const minIdx = args.indexOf('--min');
const MIN = minIdx >= 0 ? Number(args[minIdx + 1]) : 70;
const targets = args.filter((a, i) => !a.startsWith('--') && a !== '-v' && !(minIdx >= 0 && i === minIdx + 1));

if (opt.list) {
  console.log('| lang | level | pattern | fix |\n|---|---|---|---|');
  for (const [lang, level, src, fix] of RULES) console.log(`| ${lang} | ${level} | \`${src.replace(/\|/g, '\\|')}\` | ${fix} |`);
  process.exit(0);
}
if (!targets.length) { console.error('usage: node lint-ia.mjs [--verbose] [--json] [--min N] <file|dir|-> ...'); process.exit(2); }

const EXT = { '.md': 'md', '.markdown': 'md', '.html': 'html', '.htm': 'html', '.txt': 'txt' };
function collect(p, out) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) if (!['node_modules', '.git', 'dist', 'build'].includes(f)) collect(join(p, f), out); }
  else if (EXT[extname(p).toLowerCase()]) out.push(p);
  return out;
}
const files = [];
for (const t of targets) { if (t === '-') files.push('-'); else collect(t, files); }

// A banned phrase or an unverified claim caps the verdict at REVISE, whatever the score.
const verdict = (r) => {
  const blocking = r.penalties.some((p) => (p.key === 'ban' || p.key === 'honesty') && p.count > 0);
  return r.score >= 85 && !blocking ? 'OK' : r.score >= 70 ? 'REVISE' : 'REWRITE';
};
const results = [];
let failed = false;
for (const f of files) {
  const raw = f === '-' ? readFileSync(0, 'utf8') : readFileSync(f, 'utf8');
  if (raw.includes('lint-ia: off')) { results.push({ file: f, skipped: true }); continue; }
  const r = analyse(raw, f === '-' ? 'txt' : EXT[extname(f).toLowerCase()]);
  if (r.score < MIN) failed = true;
  results.push({ file: f, ...r, verdict: verdict(r) });
}

if (opt.json) console.log(JSON.stringify(results, null, 2));
else {
  for (const r of results) {
    if (r.skipped) { console.log(`${r.file}  skipped (lint-ia: off)`); continue; }
    console.log(`\n${r.file}  ${r.score}/100  ${r.verdict}  (${r.words} words, ${r.specRate} numbers/100w${r.sentenceCV !== null ? `, sentence-length CV ${r.sentenceCV}` : ''})`);
    for (const p of r.penalties) {
      const sample = [...new Set(p.hits.map((h) => h.text.toLowerCase()))].slice(0, 6).map((t) => `"${t.length > 60 ? t.slice(0, 57) + '...' : t}"`).join(', ');
      console.log(`  ${p.points ? '-' + String(p.points).padEnd(4) : ' 0   '} ${p.label}: ${p.count}${p.note ? ` (${p.note})` : ''}${sample ? '  ' + sample : ''}`);
      if (opt.verbose) for (const h of p.hits) console.log(`        ${h.at || h.text}${h.fix ? `  ->  ${h.fix}` : ''}`);
    }
  }
  if (results.length > 1) console.log(`\n${results.filter((r) => !r.skipped && r.score < MIN).length} file(s) below ${MIN}.`);
}
process.exit(failed ? 1 : 0);
