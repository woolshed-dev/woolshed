// Readers for what net-meter asks for: `netstat -ib` (macOS) and
// `cat /proc/net/dev` (Linux), and the sums it keeps. Pure.
// A reading is { name: { rx, tx } } in bytes since boot, one per interface
// that reaches the network (not loopback, bridges, containers or tunnels,
// whose traffic also crosses a real interface).

const MAC_KEEP = /^(en\d+|pdp_ip\d+)$/;
const LINUX_SKIP = /^(lo|docker\d*|veth|br-|virbr|vnet|tun|tap|wg|tailscale|zt|lxc|cni|flannel|cali|vmnet|kube)/;

/** macOS `netstat -ib`: the `<Link#n>` row of each interface carries its counters.
 *  Columns can be blank (no address), so the numbers are read from the end. */
export function parseNetstat(text) {
  const out = {};
  for (const line of (text ?? "").split("\n").slice(1)) {
    const words = line.trim().split(/\s+/);
    if (words.length < 9 || !/^<Link#\d+>$/.test(words[2])) continue;
    const name = words[0].replace(/\*$/, "");
    if (!MAC_KEEP.test(name)) continue;
    const n = words.slice(-7).map(Number); // Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
    if (n.some((v) => Number.isNaN(v))) continue;
    out[name] = { rx: n[2], tx: n[5] };
  }
  return out;
}

/** Linux `/proc/net/dev`. */
export function parseProcNetDev(text) {
  const out = {};
  for (const line of (text ?? "").split("\n").slice(2)) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    if (!m || LINUX_SKIP.test(m[1])) continue;
    const n = m[2].trim().split(/\s+/).map(Number);
    if (n.length < 9) continue;
    out[m[1]] = { rx: n[0], tx: n[8] };
  }
  return out;
}

/** What moved between two readings, per interface: counters that went back
 *  (a reboot, an interface that came back) count from zero. */
export function moved(before, after) {
  let rx = 0, tx = 0;
  for (const [name, now] of Object.entries(after ?? {})) {
    const was = before?.[name];
    if (!was) continue;
    if (now.rx >= was.rx) rx += now.rx - was.rx;
    if (now.tx >= was.tx) tx += now.tx - was.tx;
  }
  return { rx, tx };
}

/** Today's sums: { day, rx, tx, since, last }. `last` is the latest reading,
 *  kept so the time it was closed still counts the next time it opens the
 *  same day (counters run since boot). A new day starts again from zero. */
export function accrue(state, reading, now, day) {
  const fresh = !state || state.day !== day;
  const base = fresh ? { day, rx: 0, tx: 0, since: now } : state;
  const add = fresh ? { rx: 0, tx: 0 } : moved(state.last, reading);
  return { day, rx: base.rx + add.rx, tx: base.tx + add.tx, since: base.since, last: reading };
}

/** 2_500_000 → "2.5 MB" (decimal units). */
export function bytes(n) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i += 1; }
  return `${i === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Bytes per second → "1.2 MB/s". */
export function rate(perSecond) {
  return `${bytes(Math.max(0, perSecond))}/s`;
}
