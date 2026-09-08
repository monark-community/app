// Port slot allocator.
//
// The model: every checkout of the repo (the primary one and each worktree)
// owns a numbered SLOT. Slot N gets `base + N * stride` for every declared
// service, so slot 0 is 3000/4000, slot 1 is 3010/4010, and so on. A slot is
// sticky to a directory, recorded in one registry file that lives above every
// worktree, so two sessions can never be handed the same port.
import fs from "node:fs";
import path from "node:path";
import { readJson, upsertEnv, withLock, writeJson } from "./util.mjs";

export function registryFile(cfg) {
  return path.join(cfg.registryDirAbs, "ports.json");
}

export function loadRegistry(cfg) {
  return readJson(registryFile(cfg), { version: 1, slots: {} });
}

export function portsForSlot(cfg, slot) {
  const out = {};
  for (const [name, base] of Object.entries(cfg.ports.services)) {
    out[name] = Number(base) + slot * cfg.ports.stride;
  }
  return out;
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/**
 * Reserve (or re-read) the slot for `checkout`. Idempotent: calling it twice
 * from the same directory returns the same slot. Slot 0 is pinned to the
 * primary checkout so the main clone keeps the ports you have muscle memory
 * for; worktrees start at 1.
 */
export function reserve(cfg, checkout) {
  return withLock(path.join(cfg.registryDirAbs, ".lock"), () => {
    const reg = loadRegistry(cfg);
    reg.slots ??= {};

    // Drop entries whose directory no longer exists; a removed worktree
    // should hand its ports back automatically.
    for (const [slot, entry] of Object.entries(reg.slots)) {
      if (slot === "0") continue;
      if (!entry?.dir || !fs.existsSync(entry.dir)) delete reg.slots[slot];
    }

    for (const [slot, entry] of Object.entries(reg.slots)) {
      if (entry?.dir && same(entry.dir, checkout.dir)) {
        entry.name = checkout.name;
        entry.branch = checkout.branch;
        entry.lastSeen = new Date().toISOString();
        writeJson(registryFile(cfg), reg);
        return { slot: Number(slot), ports: portsForSlot(cfg, Number(slot)), created: false };
      }
    }

    let slot;
    if (checkout.isPrimary) {
      slot = 0;
    } else {
      const taken = new Set(Object.keys(reg.slots).map(Number));
      taken.add(0);
      slot = 1;
      while (taken.has(slot)) slot++;
      if (slot >= cfg.ports.maxSlots) {
        throw new Error(
          `no free port slot (maxSlots=${cfg.ports.maxSlots}); run \`agentkit ports prune\``,
        );
      }
    }

    reg.slots[String(slot)] = {
      dir: checkout.dir,
      name: checkout.name,
      branch: checkout.branch,
      reservedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    writeJson(registryFile(cfg), reg);
    return { slot, ports: portsForSlot(cfg, slot), created: true };
  });
}

export function release(cfg, target) {
  return withLock(path.join(cfg.registryDirAbs, ".lock"), () => {
    const reg = loadRegistry(cfg);
    let released = null;
    for (const [slot, entry] of Object.entries(reg.slots ?? {})) {
      const hit = entry?.dir && (same(entry.dir, target) || entry.name === target);
      if (hit) {
        released = { slot: Number(slot), ...entry };
        delete reg.slots[slot];
      }
    }
    if (released) writeJson(registryFile(cfg), reg);
    return released;
  });
}

export function prune(cfg) {
  return withLock(path.join(cfg.registryDirAbs, ".lock"), () => {
    const reg = loadRegistry(cfg);
    const dropped = [];
    for (const [slot, entry] of Object.entries(reg.slots ?? {})) {
      if (!entry?.dir || !fs.existsSync(entry.dir)) {
        dropped.push({ slot: Number(slot), ...entry });
        delete reg.slots[slot];
      }
    }
    if (dropped.length) writeJson(registryFile(cfg), reg);
    return dropped;
  });
}

export function list(cfg) {
  const reg = loadRegistry(cfg);
  return Object.entries(reg.slots ?? {})
    .map(([slot, entry]) => ({
      slot: Number(slot),
      ...entry,
      alive: Boolean(entry?.dir && fs.existsSync(entry.dir)),
      ports: portsForSlot(cfg, Number(slot)),
    }))
    .sort((a, b) => a.slot - b.slot);
}

/** `{web}` / `{api}` placeholders resolved against the slot's ports. */
export function interpolate(template, ports) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) =>
    key in ports ? String(ports[key]) : m,
  );
}

/**
 * Write the slot's ports into the checkout's own (gitignored) env files, so
 * `pnpm dev` in this worktree simply picks the right ports up with no flags.
 */
export function materialize(cfg, ports, cwd) {
  const written = [];
  for (const spec of cfg.ports.env ?? []) {
    const file = path.resolve(cwd, spec.file);
    const seed = cfg.ports.seedFrom?.[spec.file];
    if (!fs.existsSync(file) && seed) {
      const seedPath = path.resolve(cwd, seed);
      if (fs.existsSync(seedPath)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.copyFileSync(seedPath, file);
      }
    }
    const vars = {};
    for (const [key, value] of Object.entries(spec.vars ?? {})) {
      vars[key] = interpolate(value, ports);
    }
    const changed = upsertEnv(file, vars);
    if (changed.length) written.push({ file: spec.file, keys: changed });
  }
  return written;
}
