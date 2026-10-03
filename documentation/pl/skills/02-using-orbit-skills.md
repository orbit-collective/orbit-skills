# Korzystanie z CLI i menu interaktywnego

Ten przewodnik opisuje dwa obsługiwane interfejsy korzystające z tych samych usług instalacji i odzyskiwania: menu TTY dla użytkowników oraz bezpośrednie komendy lub wersjonowany JSON dla skryptów.

## Krok 1 — Zbuduj i uruchom lokalnie

Użyj Node.js 22.13+ w linii Node 22, Node.js 24 albo Node.js 26:

```bash
npm install
npm run build
node dist/cli.js
```

Brak argumentów otwiera menu, gdy stdin i stdout są połączone z TTY. Przy przekierowaniu program wyświetla pomoc i kończy działanie. Pracując na kopii repozytorium, używaj powyższego polecenia lokalnego. Aby użyć opublikowanej paczki, zainstaluj albo uruchom jawną wersję z rejestru:

<!-- x-release-please-start-version -->
```bash
npm install --global @orbit-collective/skills@0.1.1
npm exec --yes --package=@orbit-collective/skills@0.1.1 -- orbit-skills list
```
<!-- x-release-please-end -->

## Krok 2 — Nawiguj i wyszukuj

W menu używaj `↑`/`↓` oraz `Enter`. W liście wyboru skillów `Space` przełącza aktywną pozycję. Wyszukiwanie jest osobnym ekranem wpisywania: podaj nazwę lub identyfikator, naciśnij `Enter`, a następnie ponownie otwórz listę wyboru. Filtrowanie nie usuwa ukrytych zaznaczeń. W razie potrzeby użyj jawnych akcji zaznaczenia wszystkiego i wyczyszczenia wyboru. `Ctrl+C` anuluje działanie bez rozpoczynania nowej operacji.

Pierwsze uruchomienie proponuje instalację, ale nigdy nie wykonuje jej automatycznie. Instalacja, aktualizacja i usuwanie pokazują plan dry-run przed potwierdzeniem. Usuwanie i sprzątanie backupów wymagają potwierdzenia operacji destrukcyjnej.

## Krok 3 — Używaj bezpośrednich komend

Bezpośrednie komendy nigdy nie wyświetlają promptów:

```bash
node dist/cli.js list
node dist/cli.js info document-feature
node dist/cli.js install document-feature --agent codex --dry-run
node dist/cli.js update document-feature --agent codex
node dist/cli.js uninstall document-feature --agent codex
node dist/cli.js status --agent claude-code
node dist/cli.js doctor --agent codex
node dist/cli.js recover --agent codex --transaction .orbit-skills-update-EXACT
node dist/cli.js cleanup --agent codex --dry-run --keep 3
```

Bez identyfikatorów skillów instalacja i aktualizacja obejmują wszystkie dostępne zgodne skille. Uninstall zawsze wymaga jawnych identyfikatorów.

## Krok 4 — Odbieraj JSON

Komendy `list`, `info`, `status` i `doctor` przyjmują `--json`. Zapisują jeden dokument z `schemaVersion: 1`; błędy zapisują obiekt `error` i ustawiają niezerowy kod wyjścia. JSON nigdy nie zawiera dekoracji terminalowych.

`status` i `doctor` ujawniają lokalne ścieżki instalacji i odzyskiwania. Doctor może ujawnić zweryfikowane pola właściciela blokady potrzebne do kontrolowanego odzyskiwania, ale nigdy nie eksportuje identyfikatorów maszyny, surowych niepoprawnych dzienników, fingerprintów ani treści skillów.

## Krok 5 — Zweryfikuj zmiany

Testy stanu menu używają wstrzykiwanego adaptera promptów. Testy zbudowanego CLI korzystają z tymczasowego `HOME` i obejmują pomoc, wersję, JSON, wybór, idempotencję oraz zachowanie nieinteraktywne:

```bash
npm run typecheck
npm run build
npm test
npm run validate:catalog
npm run check:package
npm run test:package
```
