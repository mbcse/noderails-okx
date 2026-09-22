import { ethers, type TransactionRequest } from "ethers";
import type { IKeyAdapter } from "./key-adapter.interface.js";
import { decrypt } from "../lib/crypto.js";

// ────────────────────────────────────────────────────────────
// ENV key adapter — uses ethers.Wallet with a decrypted PK
// ────────────────────────────────────────────────────────────

export class EnvKeyAdapter implements IKeyAdapter {
  private wallet: ethers.Wallet;

  constructor(encryptedPrivateKey: string, provider?: ethers.Provider) {
    let privateKey: string;
    try {
      privateKey = decrypt(encryptedPrivateKey);
    } catch {
      throw new Error("Failed to decrypt signer key — encryption key mismatch or corrupted data");
    }
    try {
      this.wallet = new ethers.Wallet(privateKey, provider);
    } catch {
      throw new Error("Failed to initialize signer — invalid key configuration");
    } finally {
      // Wipe the plaintext key from the local variable
      privateKey = "";
    }
  }

  async getAddress(): Promise<string> {
    return this.wallet.address;
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    return this.wallet.signTransaction(tx);
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this.wallet.signMessage(message);
  }

  async signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  /** Attach / swap the JSON-RPC provider */
  connect(provider: ethers.Provider): EnvKeyAdapter {
    this.wallet = this.wallet.connect(provider) as ethers.Wallet;
    return this;
  }
}
