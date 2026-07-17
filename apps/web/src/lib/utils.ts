import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function fmtClock(seconds: number | null): string {
  if (seconds == null) return "--'--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtSol(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL`;
}

/** Fake Solana-style base58 signature for the demo ledger. */
export function fakeTxHash(): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 88; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function fakeSolAddress(): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 44; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
