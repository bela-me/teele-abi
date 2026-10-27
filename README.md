# teele-abi
Teele Abi – web application for creating and managing draft replies to Teele information system support requests.

## Eesmärk ja piirangud

Teele Abi on **avalik õppedemo** Teele kasutajatoe spetsialistile. Spetsialist sisestab väljamõeldud pöördumise, saab mallipõhise vastuse mustandi, muudab seda ja salvestab päringu koos mustandiga.

- Mustandid koostatakse ainult failist `data/support_templates.csv` deterministliku märksõnade võrdlusega. Rakendus ei kasuta tehisintellekti ega väliseid API-sid.
- Rakendus ei saada vastuseid ega tee kasutajatoe toiminguid (paroolid, õigused, uurimine). Mustand tuleb enne kasutamist alati üle vaadata.
- Kasuta ainult väljamõeldud andmeid. Ära sisesta päris päringuid, isikuandmeid, paroole ega dokumentide sisu.
- **Sisselogimist ei ole. Kõik külastajad näevad samu demoandmeid ning saavad neid vaadata, muuta ja kustutada.**

## Tehnoloogia

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Prisma 6 ja PostgreSQL. Node.js **24.x** (`package.json` → `engines`).

## Majutus Renderis

| Seadistus | Väärtus |
|---|---|
| Teenuse tüüp | Web Service |
| Repositoorium | `bela-me/teele-abi` |
| Haru | `main` |
| Piirkond | Frankfurt (sama mis andmebaasil) |
| Language | Node |
| Root Directory | tühi |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Pre-Deploy Command | tühi |
| Keskkonnamuutuja | `DATABASE_URL` = olemasoleva andmebaasi `teele-abi-db` **Internal Database URL** |

`DATABASE_URL` lisatakse **ainult** Renderi teenuse Environment-vaates. Seda ei kirjutata koodi, faili `.env` ega Git'i. Fail `.env.example` sisaldab ainult kohatäidet.

### Mis toimub build'i ja käivitamise ajal

1. **Build:** `npm ci --include=dev` paigaldab `package-lock.json` järgi kõik paketid. `--include=dev` on vajalik, sest TypeScripti ja Tailwindi on vaja ka siis, kui `NODE_ENV=production`. Järgmisena `npm run build` käivitab `prisma generate && next build`. Build ei vaja andmebaasi ega `DATABASE_URL`-i.
2. **Start:** `npm start` käivitab järjest:
   1. `prisma migrate deploy` rakendab kaustas `prisma/migrations` olevad migratsioonid. Juba rakendatud migratsioone ei rakendata uuesti.
   2. `npm run seed` (`prisma db seed` → `tsx prisma/seed.ts`) loeb CSV-faili ja teeb iga malli kohta upsert'i paari (`category`, `exampleIssue`) järgi. Korduv käivitamine ei tekita duplikaate. Salvestatud päringuid see ei puuduta ja malle ei kustuta.
   3. `next start -H 0.0.0.0` käivitab veebiserveri. Server kuulab Renderi `PORT` muutuja porti.

   Kui migratsioon või seed ebaõnnestub, veebiserver ei käivitu ja viga on näha Renderi logis.

Paketid `prisma`, `@prisma/client`, `tsx` ja `csv-parse` asuvad `dependencies` all, et migratsioonid ja seed töötaksid ka Renderi käituskeskkonnas.

## Turvaparandus: `overrides`

`npm audit` leidis Prisma 6.19.3 CLI sõltuvuses `deepmerge-ts@7.1.5` turvanõrkuse [GHSA-ggr8-5vv4-36mx / CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). Ringviitega objektide ühendamine põhjustab seal lõputu rekursiooni. Prisma 6 jaoks ametlikku parandust ei ole: `npm audit fix --force` uuendaks Prisma versioonile 7. Seetõttu asendab `package.json` reegel

```json
"overrides": { "@prisma/config": { "deepmerge-ts": "8.0.2" } }
```

ainult `@prisma/config` sõltuvusahelas paketi parandatud versiooniga 8.0.2. Seda versiooni kasutab ka Prisma 7. Haavatav kood töötab ainult Prisma CLI konfiguratsiooni laadimisel, mitte rakenduse päringutes. Parandus hoiab `npm audit` puhtana. Pärast parandust kontrolliti `prisma generate`, `prisma validate`, lint'i ja build'i.

## Arendus ja kontrollid

Kohalikku andmebaasi ega serverit ei kasutata. Kohapeal saab käivitada järgmised kontrollid:

```bash
npm ci
npm test
npm run lint
npm run build
```

Build ja testid ei vaja `DATABASE_URL`-i. `prisma validate` vajab ajutist kohatäidet, näiteks `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder`. Ühendust ei looda.

Algmigratsioon (`prisma/migrations/20261027000000_init`) on koostatud ilma andmebaasita käsuga `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.

## Kontrollitud ja kontrollimata

**Automaatselt kontrollitud** (`npm test`, ilma andmebaasita):
- CSV parsimine ja mallivalik: sama kategooria erinevad probleemid, üldmustand, viigireegel, kolm tooni ning hoiatuste säilimine;
- API valideerimine (100, 2000 ja 5000 märki, enum'id, kategooria), HTTP staatused ja eestikeelsed vead. Andmekiht on testides asendatud mälupõhise testiasendusega, mida rakendus ise ei kasuta;
- `draftNeedsReview` reegel ning brauseri ja serveri ühine räsi;
- vormi olek: salvestamata muudatused, ülekirjutamise kinnitus ning hilinenud vastuste käsitlus.

**Renderis veel kontrollida:**
- migratsiooni ja seed'i rakendumine andmebaasis `teele-abi-db` (14 malli, 7 kategooriat) ning duplikaatide puudumine pärast uut deploy'd;
- päringute loomine, muutmine, staatuse vahetus, kustutamine ning andmete püsimine pärast lehe uuesti laadimist ja teises seadmes;
- kolm tooni, üldmustand, piirangud 100, 2000 ja 5000, kopeerimine ning salvestamata muudatuste hoiatused;
- mobiilimenüü, klaviatuuriga kasutatavad dialoogid ja andmebaasivea taastamine.
