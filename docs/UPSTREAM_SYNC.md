# HRAI branch and upstream synchronization

This repository is an HRAI product fork of `scratchfoundation/scratch-editor`. It keeps a clean upstream baseline while allowing HRAI product work to evolve independently.

## Remotes

- `origin` — HRAI product repository.
- `upstream` — official Scratch editor repository:
  `git@github.com:scratchfoundation/scratch-editor.git`

Check the configuration with:

```sh
git remote -v
```

## Branch roles

### `main`

`main` is the HRAI repository's default and product branch.

- It contains the selected upstream baseline plus HRAI-specific changes.
- Product releases are made from `main`.
- HRAI feature and fix branches are based on `main` and merged back into `main` through pull requests.

Examples:

```text
feat/tutor-panel  -> main
fix/hrai-session  -> main
```

### `develop`

`develop` is the HRAI fork's upstream-baseline branch, not its product development branch.

- It contains upstream changes only.
- It initially mirrors `upstream/develop`.
- Do not merge HRAI-only product work into it.
- It is not a release branch.

Keeping this branch clean makes the upstream delta explicit and keeps synchronization repeatable.

### Temporary branches

Use a short-lived `sync/*` branch when an upstream update needs conflict resolution or review before entering `main`:

```text
sync/upstream-develop  -> main
```

Changes intended for contribution back to Scratch should be based on `develop` and kept separate from HRAI product branches.

## Routine synchronization

Fetch the official repository and fast-forward the upstream baseline:

```sh
git fetch upstream

git switch develop
git merge --ff-only upstream/develop
git push origin develop
```

Then merge the updated baseline into the HRAI product branch:

```sh
git switch main
git merge --no-ff develop
```

Resolve conflicts, run the full relevant build, test, and lint checks, then push `main`. If `main` is protected, perform the merge on a temporary `sync/*` branch and open a pull request instead.

Do not cherry-pick upstream commits one by one. The upstream baseline and the explicit merge into `main` preserve the relationship between the two histories.

## Product feature workflow

1. Update local `main`.
2. Create a `feat/*`, `fix/*`, or similarly scoped branch from `main`.
3. Implement and validate the HRAI change.
4. Open a pull request targeting `main`.
5. Merge only after the normal review and checks pass.

Do not base HRAI product work on `develop`; doing so drops the product changes already present on `main` and creates unnecessary merge conflicts.

## Switching to upstream `main` later

The active upstream branch is currently `develop`. Do not switch merely because the branch names change. Switch only after the Scratch repository's `main` contains the active `develop` history and is confirmed to be the supported current baseline.

At that point:

1. Verify that `upstream/main` contains the required upstream `develop` history.
2. Run a synchronization cycle against `upstream/main` on a temporary branch.
3. Update the sync procedure and automation to use `upstream/main`.
4. Continue merging the clean upstream baseline into HRAI `main`.

HRAI `main` remains the product branch. Only the upstream source for the baseline branch changes. The HRAI `develop` branch may retain its name for continuity, but its documentation and automation must state that it now mirrors `upstream/main`.

## Conflict policy

Most conflicts should be resolved once, when the upstream baseline is merged into `main`. Pay particular attention to:

- `scratch-gui` integration points;
- package manifests and lockfiles;
- localization files;
- build and release configuration.

Do not rewrite published `main` or `develop` history. Use merge commits or the repository's agreed pull-request workflow.

## Sync checklist

- [ ] `upstream` points to the official Scratch repository.
- [ ] `develop` contains only the selected upstream branch.
- [ ] The upstream update was fast-forwarded into `develop`.
- [ ] The update was merged into `main` through a `sync/*` branch when review is required.
- [ ] Build, tests, and lint checks pass.
- [ ] Attribution, license notices, and HRAI modifications remain intact.
- [ ] The selected upstream branch and sync date are recorded in the pull request.
