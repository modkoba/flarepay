/**
 * FlareKit SDK — encoding helpers.
 *
 * FDC identifiers (attestation types, source ids) are UTF-8 text RIGHT-padded
 * with zeros to 32 bytes — the opposite of ethers' zeroPadValue. Verified live
 * on Coston2 during Phase 0 research.
 */

import { toUtf8Bytes, hexlify } from "ethers";
import { ConfigError } from "./errors.js";

/** UTF-8 encode and right-pad to 32 bytes. "Payment" → 0x5061796d656e74000...0 */
export function pad32Utf8(text: string): `0x${string}` {
  const hex = hexlify(toUtf8Bytes(text)).slice(2);
  if (hex.length > 64) {
    throw new ConfigError(
      `"${text}" exceeds 32 bytes when UTF-8 encoded`,
      "FDC identifiers must fit in 32 bytes."
    );
  }
  return ("0x" + hex.padEnd(64, "0")) as `0x${string}`;
}

/**
 * FTSOv2 feed id: bytes21 = 1 category byte + UTF-8 symbol right-padded to 20 bytes.
 * Category 0x01 = crypto. "BTC/USD" → 0x014254432f555344000000000000000000000000
 */
export function feedId(symbol: string, category = 0x01): `0x${string}` {
  const hex = hexlify(toUtf8Bytes(symbol)).slice(2);
  if (hex.length > 40) {
    throw new ConfigError(
      `Feed symbol "${symbol}" exceeds 20 bytes`,
      'Use a standard feed symbol like "BTC/USD" or "FLR/USD".'
    );
  }
  return ("0x" + category.toString(16).padStart(2, "0") + hex.padEnd(40, "0")) as `0x${string}`;
}

/** Normalize a source-chain tx hash to 0x-prefixed lowercase 32-byte hex. */
export function normalizeTxId(txId: string): `0x${string}` {
  const stripped = (txId.startsWith("0x") || txId.startsWith("0X") ? txId.slice(2) : txId).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(stripped)) {
    throw new ConfigError(
      `"${txId}" is not a valid transaction hash (need 64 hex chars, got ${stripped.length})`,
      "Pass the transaction hash exactly as shown by the source-chain explorer, with or without 0x."
    );
  }
  return ("0x" + stripped) as `0x${string}`;
}
