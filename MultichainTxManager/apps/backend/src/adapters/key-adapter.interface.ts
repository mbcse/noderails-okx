import type { TransactionRequest } from "ethers";

// ────────────────────────────────────────────────────────────
// Pluggable key adapter interface
// ────────────────────────────────────────────────────────────

export interface IKeyAdapter {
  /** Ethereum address derived from the underlying key */
  getAddress(): Promise<string>;

  /** Sign a raw transaction → returns the signed serialised hex */
  signTransaction(tx: TransactionRequest): Promise<string>;

  /** Sign an arbitrary message (EIP-191 personal sign) */
  signMessage(message: string | Uint8Array): Promise<string>;

  /** Sign EIP-712 typed data */
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<string>;
}
