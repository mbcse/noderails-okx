import type { Hex } from 'viem';

/** Match server `uuidToBytes32` — UUID hex left-padded to bytes32. */
export function uuidToBytes32(uuid: string): Hex {
  const hex = uuid.replace(/-/g, '');
  return `0x${hex.padStart(64, '0')}` as Hex;
}
