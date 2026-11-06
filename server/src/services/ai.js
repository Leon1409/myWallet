import { randomUUID } from 'node:crypto';
import { httpError } from '../http.js';

// Parsowanie zdjęcia paragonu przez model z vision (GLM, format Anthropic).
// Default: endpoint OpenCode Go (subskrypcja miesięczna; wg wymogów Go klient
// identyfikuje się własnym User-Agent i wysyła x-opencode-session).
// Alternatywnie działa Z.ai (AI_BASE_URL=https://api.z.ai/api/anthropic).
// Konfiguracja env: AI_API_KEY (wymagany), AI_BASE_URL, AI_MODEL.
const BASE_URL = () => process.env.AI_BASE_URL || 'https://opencode.ai/inference/go';
const MODEL = () => process.env.AI_MODEL || 'glm-5.3-flash';

// Z domeny modelu do liczby: "3,49" / "3.49" / 3.49 -> 3.49
function toNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toText(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

// Wyciąga pierwszy blok {...} z odpowiedzi (model lubi owijać w ```json)
function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function buildPrompt(categories) {
  const catList = categories.length
    ? categories.map((c) => `${c.id} ${c.name}`).join('\n')
    : '(brak kategorii)';
  return `Przeanalizuj zdjęcie paragonu ze sklepu w Polsce.

Zwróć WYŁĄCZNIE jeden poprawny obiekt JSON (bez komentarzy, bez markdown):
{
  "store": "nazwa sklepu z paragonu lub null",
  "date": "data z paragonu w formacie RRRR-MM-DD lub null",
  "total": "SUMA DO ZAPŁATY jako liczba",
  "categoryId": id jednej kategorii z listy poniżej najlepiej pasującej do CAŁYCH zakupów, lub null
}

Zasady:
- total: odczytaj wyłącznie końcową SUMĘ paragonu (po rabatach, do zapłaty) — NIE sumuj ani nie rozbijaj na pozycje
- ceny jako liczby (np. 3.49), kwoty z przecinkiem dziesiętnym zamień na kropkę
- categoryId wybierz tylko spośród podanych id
- jeśli któregoś pola nie da się odczytać, zwróć null

Kategorie użytkownika (id — nazwa):
${catList}`;
}

// Zdjęcie paragonu -> struktura pozycji. Nie ufa odpowiedzi modelu:
// wszystko walidowane/ucięte, categoryId tylko z przekazanej listy.
export async function parseReceipt({ buffer, mime, categories }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw httpError(500, 'AI nie jest skonfigurowane — ustaw AI_API_KEY (opcje addonu lub .env)');
  }
  const allowedIds = new Set(categories.map((c) => String(c.id)));

  let res;
  try {
    res = await fetch(`${BASE_URL()}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Bearer (Go/Anthropic-compatible) + x-api-key (natywne API Anthropic) —
        // gateway wybiera to, co zna
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Wymogi OpenCode Go: własny UA klienta + stabilny id sesji per rozmowa
        'User-Agent': 'MyWallet/1.0',
        'x-opencode-session': randomUUID(),
      },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mime, data: buffer.toString('base64') },
              },
              { type: 'text', text: buildPrompt(categories) },
            ],
          },
        ],
      }),
    });
  } catch {
    throw httpError(502, 'Nie udało się połączyć z usługą AI');
  }

  if (!res.ok) {
    throw httpError(502, `Usługa AI zwróciła błąd (HTTP ${res.status})`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const raw = extractJson(text);
  if (!raw) {
    throw httpError(502, 'AI nie zwróciło odczytu paragonu — spróbuj zrobić jaśniejsze zdjęcie');
  }

  let total = toNumber(raw.total);
  if (total != null && total > 0) total = Math.round(total * 100) / 100;

  const catId = raw.categoryId != null && allowedIds.has(String(raw.categoryId)) ? raw.categoryId : null;
  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;

  return {
    store: toText(raw.store, 60),
    date,
    total,
    categoryId: catId,
  };
}
