# PRD review — J'étais pas là (V1 → V2)

This document reviews `PRD_V1.md`, which was drafted with ChatGPT. Each item is classified as **Keep**, **Refine**, **Remove** or **Add**, and was checked against current documentation on 2026-11-14. The user makes the final call on every decision. `PRD_V2.md` applies the decisions recorded here.

Legend: ✅ Keep · 🔧 Refine · ❌ Remove · ➕ Add · 🕓 Backlog

---

## 1. Verified facts

| Fact | Source / check |
|---|---|
| The project folder contains only `PRD_V1.md`. The prototype described in V1 (`index.html`, `script.js`, `style.css`, IndexedDB) **doesn't exist** | Folder listing; confirmed by the user |
| Supabase project "Jetais pas la" (`kklvodtpjilsdaptogff`, us-east-1, Postgres 17) is healthy and its `public` schema is **empty** | Supabase MCP |
| Supabase recommends **publishable keys (`sb_publishable_…`)**. Legacy `anon`/`service_role` keys only work until **end of 2026** | Supabase docs, API keys |
| Anonymous users get the `authenticated` role plus an `is_anonymous` claim. Default limit: **30 anonymous sign-ins per hour per IP** | Supabase docs, Anonymous Sign-Ins |
| Storage rejects uploads unless RLS policies exist on `storage.objects`. Buckets can enforce max size and MIME types | Supabase docs, Storage Access Control |
| Tesseract.js runs in the browser from a CDN with no build step. It's built for **printed** text and weak on handwriting | Tesseract.js docs, handwriting studies |
| MiniSearch (about 7 KB, CDN) supports fuzzy, prefix and boosted search, filters, and custom term processing for accent folding | MiniSearch docs |

---

## 2. Review matrix

### ✅ Keep
| V1 item | Why |
|---|---|
| Core problem: find notes from a missed class, searchable by content | Real student pain, easy to demo |
| Supabase for database and storage | Free tier is enough, no backend code |
| Vanilla HTML/CSS/JS, no build | Fastest path. Every library we need has a CDN build |
| OCR at publish time, stored, never re-run at search time | Correct architecture |
| Publishing still works when OCR fails | Resilient |
| `textContent` for user content, no service key in the browser | Correct security baseline |
| File validation, double-submit guard, empty and error states | Cheap, and they matter in a live demo |
| Out-of-scope list | Good scope discipline |
| Acceptance criteria | Testable definition of done (updated in V2) |

### 🔧 Refine
| # | V1 item | Problem in V1 | Decision |
|---|---|---|---|
| R1 | OCR engine | The critical scenario is **handwritten** "Socrate", and Tesseract is weak on handwriting | Tesseract.js in the browser (`fra+eng`). The result goes into an **editable text box** before publishing, with a tip: copy handwriting with **Live Text (iOS) / Google Lens** and paste it in. No API key, no cost |
| R2 | Search ("insensible aux accents si possible") | OCR output has typos (e.g. "Socrafe"), so `ilike` alone wouldn't find the note. Search that can't find notes defeats the purpose | **MiniSearch** in the browser: accent folding and lowercasing, `fuzzy: 0.2`, `prefix: true`, boosts on title and course, filters for subject and type. Upgrade path: Postgres `pg_trgm` with an immutable `unaccent` wrapper once the catalogue passes about 1–2k notes |
| R3 | Deletion ("remove it if there's no auth") | Removing delete means test data can't be cleaned up | **Supabase anonymous sign-in**. RLS allows anyone to read, and lets users insert and delete only their own notes. The same rule applies on Storage (path prefix = user id) |
| R4 | Image references (unspecified) | Not specified | Public-read bucket `notes-fichiers`, path `{uid}/{uuid}.{ext}`, 10 MB limit, MIME allow-list. Column `fichiers jsonb` holds `[{chemin, type, nom}]` |
| R5 | File limits ("raisonnables") | Phone photos are 4–12 MB, which makes upload and OCR slow | Resize images in the browser to about 2000 px JPEG before OCR and upload. Max 10 files |
| R6 | "Clé publique" | Legacy anon key is deprecated at end of 2026 | Publishable key in a committed `config.js` |
| R7 | `texte_ocr` column | Digital docs have text that isn't OCR | Rename to **`texte_contenu`** (OCR text or extracted text) |

### ❌ Remove
| V1 item | Why |
|---|---|
| IndexedDB local store | Replaced by Supabase. Keeping both invites sync bugs |
| "État connu du prototype" section | The prototype doesn't exist |
| "Conserver le CSS existant" | Nothing exists yet, so the CSS has to be created |
| Public deletion | Unsafe; replaced by owner-only deletion (R3) |

### ➕ Add
| # | Addition | Priority |
|---|---|---|
| M1 | **Vercel** static hosting. Needed to meet the "visible from another device" criterion | P0 |
| M2 | Problem statement (who, pain, success signal) | P0 (doc) |
| M3 | **Digital notes**: `.md`/`.txt` (FileReader), `.pdf` (pdf.js), `.docx` (mammoth.js). Notion and Google Docs are handled by exporting to PDF/DOCX/MD | P1, after the photo flow works |
| M4 | "Signaler" button that writes to a `signalements` table (insert-only) | P2 |
| M5 | OCR languages `fra+eng` | P0 |
| M6 | Results newest first and capped; 2 sample test images (printed and handwritten) | P1 |

### 🕓 Backlog
| Item | Condition |
|---|---|
| `.pptx` support (teachers' PowerPoints) | Only once everything else works flawlessly |
| Postgres server-side search | Only if the catalogue grows past ~1–2k notes |

---

## 3. Decisions log

| Date | Topic | Decision | Rationale |
|---|---|---|---|
| 2026-11-14 | Prototype | Build from scratch | Files don't exist |
| 2026-11-14 | OCR | Tesseract.js, editable text, Live Text/Lens tip | No billing or server, and handwriting is still covered through correction |
| 2026-11-14 | Identity | Anonymous sign-in, owner-only delete | Safe RLS with no sign-up friction |
| 2026-11-14 | Hosting | Vercel | Already connected; public URL for the second device |
| 2026-11-14 | Search | MiniSearch (client-side) | Typo-tolerant, instant, ranked, simple |
| 2026-11-14 | Digital docs | .md/.txt/.pdf/.docx at P1; .pptx in backlog | Covers Notion/Docs through export without risking the core demo |
| 2026-11-14 | Extras | Problem statement, image resize, Signaler, fra+eng | Chosen by the user |

---

## 4. Manual actions in the Supabase dashboard (blocking)
1. **Authentication → Sign In / Providers**: enable **Anonymous sign-ins**.
2. **Authentication → Rate limits**: raise the anonymous sign-in limit before the demo (everyone in the room shares one IP; the default is 30/hour).
3. **Settings → API Keys**: copy the Project URL and the **publishable** key into `config.js`.

---

## 5. Sources
- Supabase: [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) · [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) · [API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Full Text Search](https://supabase.com/docs/guides/database/full-text-search)
- Tesseract.js: [GitHub / docs](https://github.com/naptha/tesseract.js)
- Handwriting limits: [arXiv 1003.5891](https://arxiv.org/pdf/1003.5891) · [Level Up: Tesseract on handwriting](https://levelup.gitconnected.com/i-tried-tesseract-ocr-to-extract-text-from-handwritten-images-192f4f225957) · [DEV: OCR in 2026](https://dev.to/michael_lip_52d5151c3e364/ocr-in-2026-why-tesseract-still-beats-most-commercial-apis-1nd3)
- Search: [MiniSearch](https://github.com/lucaong/minisearch) · [npm-compare: Fuse/FlexSearch/MiniSearch](https://npm-compare.com/elasticlunr,flexsearch,fuse.js,minisearch) · [Neon: unaccent](https://neon.com/docs/extensions/unaccent) · [Nile: pg_trgm](https://www.thenile.dev/docs/extensions/pg_trgm)
