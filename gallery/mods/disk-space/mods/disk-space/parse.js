// Reads `df -kP` (macOS and Linux) into the volumes a person cares about. Pure.

/** `df -kP` → [{ device, mount, size, used, free }] in bytes, every line. */
export function parseDf(text) {
  const out = [];
  for (const line of (text ?? "").split("\n").slice(1)) {
    // The mount point is last and may hold spaces: take the five fields before it.
    const m = /^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(\/.*)$/.exec(line.trim());
    if (!m) continue;
    out.push({ device: m[1], size: Number(m[2]) * 1024, used: Number(m[3]) * 1024, free: Number(m[4]) * 1024, mount: m[6] });
  }
  return out;
}

const SKIP_DEVICE = /^(devfs|map |tmpfs|devtmpfs|udev|none|overlay|shm|efivarfs|proc|sysfs|cgroup2?|ramfs|squashfs|nsfs|fusectl|portal)\b/;
const SKIP_MOUNT_MAC = /^(\/dev|\/System\/Volumes\/|\/private\/var\/|\/Library\/Developer\/CoreSimulator\/|\/Volumes\/com\.apple\.)/;
const SKIP_MOUNT_LINUX = /^(\/dev|\/run|\/sys|\/proc|\/snap\/|\/var\/snap\/|\/var\/lib\/docker\/|\/boot\/efi$)/;

/** The volumes worth showing: real disks, not system mounts, snapshots or
 *  simulator images. On macOS the APFS volumes of one container share their
 *  free space, so they collapse into the first one (/ before the rest).
 *  Free is what the person can still write; the share used is what's left of the size. */
export function volumes(list, platform) {
  const skip = platform === "linux" ? SKIP_MOUNT_LINUX : SKIP_MOUNT_MAC;
  const seen = new Set();
  const out = [];
  for (const v of list) {
    if (!v.size || SKIP_DEVICE.test(v.device) || skip.test(v.mount)) continue;
    // One APFS container: same size, same free space.
    const key = platform === "linux" ? v.device : `${v.size}:${v.free}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const used = Math.max(0, v.size - v.free);
    out.push({ ...v, used, share: used / v.size, name: nameOf(v.mount, platform) });
  }
  return out.sort((a, b) => (a.mount === "/" ? -1 : b.mount === "/" ? 1 : a.mount.localeCompare(b.mount)));
}

function nameOf(mount, platform) {
  if (mount === "/") return platform === "linux" ? "System" : "Startup disk";
  if (mount.startsWith("/Volumes/")) return mount.slice(9);
  if (/^\/(mnt|media|run\/media)\/./.test(mount)) return mount.split("/").pop();
  return mount;
}

/** 1.5e12 → "1.5 TB"; 4.2e9 → "4.2 GB" (decimal units, as Finder and disks say). */
export function size(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = bytes, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i += 1; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
