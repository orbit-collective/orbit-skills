# Dodawanie oficjalnego skilla

Stosuj ten proces tylko dla skillów utrzymywanych i dostarczanych przez `@orbit-collective/skills`. Zewnętrzne źródła i instalacja w zakresie projektu celowo nie należą do katalogu.

## 1. Wybierz przenośny identyfikator

Wybierz identyfikator zapisany małymi literami w formacie kebab-case, na przykład `release-notes`. Identyfikator staje się nazwą katalogu i zainstalowanej komendy. Nie używaj `synced` ani `anthropic-skills`; Claude Code rezerwuje te przestrzenie nazw.

## 2. Dodaj katalog źródłowy

Utwórz `skills/<id>/SKILL.md`. Frontmatter YAML musi zawierać niepuste `name` równe identyfikatorowi i `description` równe opisowi w katalogu. Instrukcje dodaj za zamykającym separatorem frontmatter.

Zwykłe pliki pomocnicze mogą znajdować się w dowolnym miejscu wewnątrz katalogu skilla. Odwołania powinny być względne wobec tego katalogu. Nie dodawaj dowiązań symbolicznych, `.orbit-skill.json` ani `.orbit-skill-*.tmp`; te nazwy należą do metadanych instalacji i walidacja katalogu je odrzuca.

## 3. Zarejestruj definicję

Dodaj dokładnie jeden wpis do `declaredSkills` w `src/skills/catalog.ts`, podając:

- identyfikator i nazwę wyświetlaną;
- ten sam opis co w `SKILL.md`;
- praktyczny opis zastosowania;
- obsługiwanych agentów (`codex`, `claude-code` lub obu).

Zasoby są wykrywane w katalogu źródłowym po walidacji, dlatego `orbit-skills info <id>` i przyszli odbiorcy danych strukturalnych pokazują je spójnie.

## 4. Zweryfikuj format obu agentów

Codex i Claude Code wymagają pliku `SKILL.md` z frontmatter YAML oraz pozwalają na pliki pomocnicze w katalogu skilla. Ta paczka instaluje wyłącznie w zakresie osobistym: `~/.agents/skills/<id>` dla Codexa i `~/.claude/skills/<id>` dla Claude Code.

Przed zmianą reguł zgodności sprawdź oficjalną [dokumentację skillów Codexa](https://learn.chatgpt.com/docs/build-skills) i [dokumentację skillów Claude Code](https://code.claude.com/docs/en/skills).

Uruchom:

```bash
npm run typecheck
npm run build
npm test
node dist/cli.js info <id>
```

Testy muszą używać katalogów tymczasowych i wstrzykniętych adapterów testowych. Nie mogą zapisywać danych w prawdziwym katalogu agenta.
