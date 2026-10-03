# Changelog

This project follows Semantic Versioning for the npm package. Official skills do not have separate versions; they are delivered by the package version.

## [0.1.2](https://github.com/orbit-collective/orbit-skills/compare/v0.1.1...v0.1.2) (2026-10-03)


### Features

* add new skills for code review, CI fixes, dependency updates, and PR creation ([8ac1716](https://github.com/orbit-collective/orbit-skills/commit/8ac1716f35dc8746b727a3de8dea923087b07c6b))
* **skill:** add commit and responsive-check skills for improved commit management and layout auditing ([9c3a087](https://github.com/orbit-collective/orbit-skills/commit/9c3a0879f31ebce434d93d60ce9f851110f2e74e))
* **skill:** add commit skill for managing logical commits in the Orbit repository ([a52aa06](https://github.com/orbit-collective/orbit-skills/commit/a52aa06457ac7576ccfa1c343a2c28a2df19b220))
* **skill:** add create-pr skill for automated pull request creation ([107529e](https://github.com/orbit-collective/orbit-skills/commit/107529ee370c13c0c51198d67edc76b2a9594d6a))
* **skill:** add deps-update skill for managing dependency updates ([0bb04d1](https://github.com/orbit-collective/orbit-skills/commit/0bb04d1b9463d94513e0c9395be0e129dd7feae2))
* **skill:** add extend-orbit skill for guided extensibility implementation ([82dd41e](https://github.com/orbit-collective/orbit-skills/commit/82dd41ed2095de423651244940dbf461a62e84fb))
* **skill:** add fix-ci skill for diagnosing and resolving CI failures ([a3dafaa](https://github.com/orbit-collective/orbit-skills/commit/a3dafaaf7a6e36b913044cb88b38c9671486f00e))
* **skill:** add fix-review skill for addressing code review findings ([3120aa4](https://github.com/orbit-collective/orbit-skills/commit/3120aa4459eefd79ad5d020df80dd50e17d7f511))
* **skill:** add responsive-check skill for auditing and fixing layout responsiveness across devices ([3c81814](https://github.com/orbit-collective/orbit-skills/commit/3c818143bc3d99e62ac63f709598fb71f4efadf4))


### Bug Fixes

* **skill:** clarify commit and PR handling instructions in SKILL.md ([7bec832](https://github.com/orbit-collective/orbit-skills/commit/7bec8329d8d5230de38d2a73ace048eadeae2bec))

## [0.1.1](https://github.com/orbit-collective/orbit-skills/compare/v0.1.0...v0.1.1) (2026-10-03)


### Features

* add cleanup skill documentation for code maintenance ([7c11dd9](https://github.com/orbit-collective/orbit-skills/commit/7c11dd9edb03538f4238ce19fdfacd51ba6d6303))
* add frontend polish skill documentation for UI/UX improvements ([bf9c53b](https://github.com/orbit-collective/orbit-skills/commit/bf9c53b6ce96b0dbdabcb6b7718ccff9a9e5f4ed))
* add new skills for code review, frontend polish, and cleanup ([a579f98](https://github.com/orbit-collective/orbit-skills/commit/a579f982f74588ef506eeb8ff6a937421f0efd73))
* add release management configuration and git hooks ([8d220e2](https://github.com/orbit-collective/orbit-skills/commit/8d220e29a1c482d0116d0f7b59b6c9d8c6c2a41f))
* add review skill documentation for code assessment process ([d96cd28](https://github.com/orbit-collective/orbit-skills/commit/d96cd28ed56fc5d298c7482f29b85e7fa5ae33ad))
* add version consistency validation across package files ([d606397](https://github.com/orbit-collective/orbit-skills/commit/d6063972ddcfd35bc6f687b4c1b661a5d14304b8))


### Bug Fixes

* bump version to 0.1.1 for package updates ([4a77e9d](https://github.com/orbit-collective/orbit-skills/commit/4a77e9da0e9c5d9f55a82a202fa7185b8db712bd))
* correct version number in package.json and update changelog date ([c3934d4](https://github.com/orbit-collective/orbit-skills/commit/c3934d4c6c08dbd42ad260e79dd64934826c4405))

## 0.1.0 (2026-10-02)

First public release candidate of `@orbit-collective/skills`.

- Manage official Orbit skills for Codex and Claude Code through direct commands or an interactive terminal menu.
- Install, inspect, update, and safely uninstall selected skills with dry-run support and structured summaries.
- Detect local changes and conflicts using managed metadata and content fingerprints.
- Recover interrupted updates, inspect cooperative locks, and clean verified completed backups.
- Produce versioned JSON for catalog, skill information, status, and diagnostics.
- Validate package contents and exercise the packed tarball in an isolated environment before publication.
