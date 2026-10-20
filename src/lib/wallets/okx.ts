import {
  BaseMessageSignerWalletAdapter,
  isVersionedTransaction,
  scopePollingDetectionStrategy,
  WalletAccountError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSendTransactionError,
  WalletSignMessageError,
  WalletSignTransactionError,
  type SendTransactionOptions,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { PublicKey, type Connection, type Transaction, type TransactionSignature, type TransactionVersion, type VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * OKX Wallet adapter for the injected `window.okxwallet.solana` provider
 * (Phantom-compatible API). If OKX also registers via Wallet Standard, the
 * wallet adapter de-duplicates by name and the UI collapses any OKX duplicates.
 */

type PublicKeyLike = PublicKey | { toBytes(): Uint8Array } | { toBase58(): string } | string;

interface OkxSolanaProvider {
  isConnected?: boolean;
  publicKey?: PublicKeyLike | null;
  connect(): Promise<unknown>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8" | "hex"): Promise<{ signature: Uint8Array | string } | Uint8Array | string>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
  signAndSendTransaction(tx: Transaction | VersionedTransaction, options?: SendTransactionOptions): Promise<{ signature: TransactionSignature }>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    okxwallet?: { solana?: OkxSolanaProvider };
  }
}

export const OkxWalletName = "OKX Wallet" as WalletName<"OKX Wallet">;

// Simplified OKX mark (black tile, five white squares).
const ICON =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#000"/><g fill="#fff"><rect x="8" y="8" width="7.5" height="7.5"/><rect x="24.5" y="8" width="7.5" height="7.5"/><rect x="16.25" y="16.25" width="7.5" height="7.5"/><rect x="8" y="24.5" width="7.5" height="7.5"/><rect x="24.5" y="24.5" width="7.5" height="7.5"/></g></svg>',
      )
    : "");

function toPublicKey(pk: PublicKeyLike): PublicKey {
  if (typeof pk === "string") return new PublicKey(pk);
  if ("toBytes" in pk && typeof pk.toBytes === "function") return new PublicKey(pk.toBytes());
  if ("toBase58" in pk && typeof pk.toBase58 === "function") return new PublicKey(pk.toBase58());
  return new PublicKey(String(pk));
}

/** OKX has returned { signature }, a raw Uint8Array, and base58 strings across versions. */
export function normalizeSignature(r: unknown): Uint8Array {
  const v = r && typeof r === "object" && !(r instanceof Uint8Array) && "signature" in r ? (r as { signature: unknown }).signature : r;
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return Uint8Array.from(v);
  if (typeof v === "string") return bs58.decode(v);
  if (v && typeof v === "object" && "data" in v && Array.isArray((v as { data: unknown }).data)) return Uint8Array.from((v as { data: number[] }).data);
  throw new Error("Unrecognized signature format from OKX Wallet");
}

const isMobile = () => typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

export class OkxWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = OkxWalletName;
  url = "https://web3.okx.com";
  icon = ICON;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(["legacy", 0]);

  private _connecting = false;
  private _wallet: OkxSolanaProvider | null = null;
  private _publicKey: PublicKey | null = null;
  private _readyState: WalletReadyState =
    typeof window === "undefined" || typeof document === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.NotDetected;

  constructor() {
    super();
    if (this._readyState === WalletReadyState.Unsupported) return;
    scopePollingDetectionStrategy(() => {
      if (window.okxwallet?.solana) {
        this._readyState = WalletReadyState.Installed;
        this.emit("readyStateChange", this._readyState);
        return true;
      }
      return false;
    });
    // Mobile browser without the extension: offer to open the site inside OKX's in-app browser.
    if (this._readyState === WalletReadyState.NotDetected && isMobile()) {
      this._readyState = WalletReadyState.Loadable;
      this.emit("readyStateChange", this._readyState);
    }
  }

  get publicKey() {
    return this._publicKey;
  }
  get connecting() {
    return this._connecting;
  }
  get readyState() {
    return this._readyState;
  }

  async autoConnect(): Promise<void> {
    if (this.readyState === WalletReadyState.Installed) await this.connect();
  }

  async connect(): Promise<void> {
    try {
      if (this.connected || this.connecting) return;
      if (this.readyState === WalletReadyState.Loadable && !window.okxwallet?.solana) {
        const dappUrl = encodeURIComponent(window.location.href);
        window.location.href = `https://web3.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${dappUrl}`)}`;
        return;
      }
      const wallet = window.okxwallet?.solana;
      if (!wallet) throw new WalletNotReadyError();
      this._connecting = true;

      if (!wallet.isConnected || !wallet.publicKey) {
        try {
          await wallet.connect();
        } catch (error) {
          throw new WalletConnectionError((error as Error)?.message, error);
        }
      }
      if (!wallet.publicKey) throw new WalletAccountError();
      let publicKey: PublicKey;
      try {
        publicKey = toPublicKey(wallet.publicKey);
      } catch (error) {
        throw new WalletPublicKeyError((error as Error)?.message, error);
      }

      wallet.on("disconnect", this._disconnected);
      wallet.on("accountChanged", this._accountChanged);
      this._wallet = wallet;
      this._publicKey = publicKey;
      this.emit("connect", publicKey);
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      this._off(wallet);
      this._wallet = null;
      this._publicKey = null;
      try {
        await wallet.disconnect();
      } catch (error) {
        this.emit("error", new WalletDisconnectionError((error as Error)?.message, error));
      }
    }
    this.emit("disconnect");
  }

  async sendTransaction<T extends Transaction | VersionedTransaction>(transaction: T, connection: Connection, options: SendTransactionOptions = {}): Promise<TransactionSignature> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        const { signers, ...sendOptions } = options;
        if (isVersionedTransaction(transaction)) {
          if (signers?.length) transaction.sign(signers);
        } else {
          transaction = (await this.prepareTransaction(transaction, connection, sendOptions)) as T;
          if (signers?.length) (transaction as Transaction).partialSign(...signers);
        }
        sendOptions.preflightCommitment = sendOptions.preflightCommitment || connection.commitment;
        const { signature } = await wallet.signAndSendTransaction(transaction, sendOptions);
        return signature;
      } catch (error) {
        if (error instanceof WalletError) throw error;
        throw new WalletSendTransactionError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        return (await wallet.signTransaction(transaction)) || transaction;
      } catch (error) {
        throw new WalletSignTransactionError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        return (await wallet.signAllTransactions(transactions)) || transactions;
      } catch (error) {
        throw new WalletSignTransactionError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        return normalizeSignature(await wallet.signMessage(message, "utf8"));
      } catch (error) {
        throw new WalletSignMessageError((error as Error)?.message, error);
      }
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  private _off(wallet: OkxSolanaProvider) {
    const off = (wallet.off ?? wallet.removeListener)?.bind(wallet);
    off?.("disconnect", this._disconnected);
    off?.("accountChanged", this._accountChanged);
  }

  private _disconnected = () => {
    const wallet = this._wallet;
    if (wallet) {
      this._off(wallet);
      this._wallet = null;
      this._publicKey = null;
      this.emit("error", new WalletDisconnectedError());
      this.emit("disconnect");
    }
  };

  private _accountChanged = (next: unknown) => {
    if (!this._publicKey) return;
    // OKX may emit null when switching to an account that hasn't approved this site.
    if (!next) {
      this._disconnected();
      return;
    }
    let pk: PublicKey;
    try {
      pk = toPublicKey(next as PublicKeyLike);
    } catch (error) {
      this.emit("error", new WalletPublicKeyError((error as Error)?.message, error));
      return;
    }
    if (this._publicKey.equals(pk)) return;
    this._publicKey = pk;
    this.emit("connect", pk);
  };
}
