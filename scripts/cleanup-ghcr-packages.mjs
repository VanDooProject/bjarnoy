#!/usr/bin/env node
// Prunes old ghcr.io/VanDooProject/bjarnoy container image versions so the
// org's Actions+Packages storage quota doesn't fill up with images nothing
// ever cleans up on its own (see the docker-image.yml comment on why an
// image gets pushed on every main-branch push and every vX.Y.Z release tag).
//
// Two kinds of version, two rules:
//
//  - Main-branch builds (tagged `main` / `latest` / a full-length commit
//    SHA, no semver tag): every push moves `main`/`latest` to the new
//    digest, so the previous version is left holding only its now-orphaned
//    SHA tag. Keep the single newest main-branch version always; delete any
//    older one once it has been superseded for more than KEEP_MAIN_DAYS.
//
//  - release-please release builds (tagged with a full `X.Y.Z` semver):
//    keep every release younger than KEEP_RELEASE_DAYS. Past that age, keep
//    only the versions belonging to the newest (major, minor) pair seen -
//    i.e. once a minor version is a month old and superseded, only its
//    latest patch line survives; older minors are dropped entirely.
//
// Usage: GITHUB_TOKEN=... PACKAGE_OWNER=VanDooProject PACKAGE_NAME=bjarnoy \
//        node scripts/cleanup-ghcr-packages.mjs [--dry-run]

const KEEP_MAIN_DAYS = 1;
const KEEP_RELEASE_DAYS = 30;

const FULL_SEMVER = /^\d+\.\d+\.\d+$/;

const API = "https://api.github.com";

async function gh(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function listAllVersions(token, owner, packageName) {
  const versions = [];
  for (let page = 1; ; page++) {
    const batch = await gh(
      token,
      `/orgs/${owner}/packages/container/${encodeURIComponent(packageName)}/versions?per_page=100&page=${page}`,
    );
    versions.push(...batch);
    if (batch.length < 100) break;
  }
  return versions;
}

function classify(version) {
  const tags = version.metadata?.container?.tags ?? [];
  const semverTag = tags.find((t) => FULL_SEMVER.test(t));
  if (semverTag) {
    const [major, minor] = semverTag.split(".").map(Number);
    return { kind: "release", major, minor, tags };
  }
  return { kind: "main", tags };
}

function daysOld(version) {
  return (Date.now() - new Date(version.created_at ?? version.updated_at).getTime()) / 86_400_000;
}

function minorKey(major, minor) {
  return major * 100_000 + minor;
}

function pickDeletions(versions) {
  const classified = versions.map((v) => ({ v, ...classify(v) }));
  const mainVersions = classified.filter((c) => c.kind === "main");
  const releaseVersions = classified.filter((c) => c.kind === "release");
  const toDelete = [];

  if (mainVersions.length > 0) {
    const [, ...supersededMainVersions] = [...mainVersions].sort(
      (a, b) => new Date(b.v.created_at) - new Date(a.v.created_at),
    );
    for (const c of supersededMainVersions) {
      if (daysOld(c.v) > KEEP_MAIN_DAYS) toDelete.push(c);
    }
  }

  if (releaseVersions.length > 0) {
    const newestMinorKey = Math.max(...releaseVersions.map((c) => minorKey(c.major, c.minor)));
    for (const c of releaseVersions) {
      if (minorKey(c.major, c.minor) === newestMinorKey) continue;
      if (daysOld(c.v) > KEEP_RELEASE_DAYS) toDelete.push(c);
    }
  }

  return { toDelete, mainCount: mainVersions.length, releaseCount: releaseVersions.length };
}

async function run({ owner, packageName, token, dryRun }) {
  const versions = await listAllVersions(token, owner, packageName);
  const { toDelete, mainCount, releaseCount } = pickDeletions(versions);

  console.log(
    `${versions.length} total versions: ${mainCount} main-build, ${releaseCount} release.`,
  );
  console.log(`${toDelete.length} eligible for deletion${dryRun ? " (dry run, not deleting)" : ""}.`);

  for (const c of toDelete) {
    const label = c.tags.length ? c.tags.join(", ") : "(untagged)";
    console.log(
      `- ${dryRun ? "[dry-run] would delete" : "deleting"} version ${c.v.id} [${label}], ${daysOld(c.v).toFixed(1)}d old`,
    );
    if (!dryRun) {
      await gh(token, `/orgs/${owner}/packages/container/${encodeURIComponent(packageName)}/versions/${c.v.id}`, {
        method: "DELETE",
      });
    }
  }
}

export { pickDeletions, classify, daysOld };

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const owner = process.env.PACKAGE_OWNER;
  const packageName = process.env.PACKAGE_NAME;
  const token = process.env.GITHUB_TOKEN;
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

  if (!owner || !packageName || !token) {
    console.error("PACKAGE_OWNER, PACKAGE_NAME and GITHUB_TOKEN are required");
    process.exit(1);
  }

  run({ owner, packageName, token, dryRun }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
