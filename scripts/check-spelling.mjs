/**
 * Fails when a tracked text file uses British spelling. The app, its code, comments and docs
 * are written in American English ("practice", "color", "center", "canceled", "normalize").
 *
 *   node scripts/check-spelling.mjs      (part of `npm run lint`)
 *
 * A deny-list rather than a full spell checker: it only knows British forms, so music terms,
 * identifiers and library names never need an allow-list. Matches are case-insensitive and also
 * catch words inside camelCase identifiers (ChordJudgement, normaliseInput).
 * To add a word: add a [pattern, American form] pair to RULES.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** British spelling (regex source, matched case-insensitively) → American spelling to use. */
const RULES = [
  ['practis(e|es|ed|ing)', 'practice / practiced / practicing'],
  ['(col|fav|hon|neighb|behavi|flav|harb|lab|rum|hum|arm|vap|odo|endeav|savi)our', '-or (color, favor, honor, neighbor, behavior, …)'],
  ['(cent|met|lit|theat|fib|sab|calib)re(s|d)?(?![a-z])', '-er (center, meter, liter, …)'],
  ['grey', 'gray'],
  ['(catal|anal)ogue', 'catalog / analog'],
  ['judgement', 'judgment'],
  ['acknowledgement', 'acknowledgment'],
  ['(cancel|label|level|model|travel|signal|total|fuel|dial|pedal|channel|tunnel|marshal|counsel)l(ed|ing|er|ers)(?![a-z])', 'single l (canceled, labeled, leveled, …)'],
  [
    '(organ|recogn|real|optim|custom|normal|summar|random|synchron|synthes|harmon|penal|minim|maxim|categor|priorit|visual|initial|final|memor|emphas|apolog|critic|util|author|standard|serial|capital|special|general|stabil|central|token|personal|familiar|sanit|quant|vector|symbol|character|fertil|util|modern|neutral|legal|local|global|internal|tranquil|anonym|equal|ideal|jeopard|mobil|polar|rational|sympath|trivial)is(e|es|ed|ing|ation|ations|er|ers)(?![a-z])',
    '-ize / -ization (normalize, summarize, synchronization, …)',
  ],
  ['analys(e|ed|ing)(?![a-z])', 'analyze / analyzed / analyzing'],
  ['(paraly|cataly)s(e|ed|ing)(?![a-z])', '-yze'],
  ['whilst', 'while'],
  ['amongst', 'among'],
  ['(learn|spel|burn|dream|spil|spoil)t(?![a-z])', '-ed (learned, spelled, …)'],
  ['(to|after|up|down|back)wards', 'toward / afterward / upward / downward / backward'],
  ['programme', 'program'],
  ['licence', 'license'],
  ['(def|off|pret)ence', '-ense (defense, offense, pretense)'],
  ['enrol(?!l)', 'enroll'],
  ['fulfil(?!l)', 'fulfill'],
  ['skilful', 'skillful'],
  ['ageing', 'aging'],
  ['artefact', 'artifact'],
  ['maths(?![a-z])', 'math'],
  ['cheque', 'check'],
  ['go(es)? round', 'go around'],
].map(([source, us]) => ({ re: new RegExp(source, 'gi'), us }));

/** Fixed names that look British but are not ours to change. */
const ALLOWED = [/aria-labelledby/gi, /labelledby/gi];

const SKIP = /(^|\/)package-lock\.json$|\.(png|jpe?g|gif|ico|icns|webp|svg|woff2?|ttf|mp3|wav|ogg|pdf|zip)$/i;
const SELF = 'scripts/check-spelling.mjs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && f !== SELF && !SKIP.test(f));

let problems = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree, or not readable
  }
  text.split('\n').forEach((raw, i) => {
    const line = ALLOWED.reduce((l, re) => l.replace(re, (m) => ' '.repeat(m.length)), raw);
    for (const { re, us } of RULES) {
      for (const m of line.matchAll(re)) {
        problems++;
        console.log(`${file}:${i + 1}:${m.index + 1}  "${m[0]}" is British spelling, use ${us}`);
      }
    }
  });
}

if (problems) {
  console.log(`\n${problems} British spelling(s) found. This project uses American English (see scripts/check-spelling.mjs).`);
  process.exit(1);
}
