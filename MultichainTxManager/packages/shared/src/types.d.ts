export interface PaginationParams {
    page?: number;
    limit?: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}
export type AdminRole = "OWNER" | "ADMIN" | "VIEWER";
export interface AdminUser {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    createdAt: string;
    updatedAt: string;
}
export interface LoginCredentials {
    email: string;
    password: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}
export interface Project {
    id: string;
    name: string;
    description: string | null;
    apiKey: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    _count?: {
        chains: number;
        signerKeys: number;
        transactions: number;
        webhookEndpoints: number;
    };
}
export interface CreateProjectInput {
    name: string;
    description?: string;
}
export interface UpdateProjectInput {
    name?: string;
    description?: string;
    isActive?: boolean;
}
export type ChainType = "EVM" | "SOLANA" | "SUI";
export interface Chain {
    id: string;
    projectId: string;
    chainType: ChainType;
    name: string;
    chainId: number;
    rpcUrls: string[];
    explorerUrl: string | null;
    nativeCurrency: string;
    isTestnet: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface CreateChainInput {
    chainType?: ChainType;
    name: string;
    chainId: number;
    rpcUrls: string[];
    explorerUrl?: string;
    nativeCurrency: string;
    isTestnet: boolean;
}
export interface UpdateChainInput {
    chainType?: ChainType;
    name?: string;
    rpcUrls?: string[];
    explorerUrl?: string;
    isActive?: boolean;
}
export type KeyAdapterType = "ENV" | "KMS";
export interface SignerKey {
    id: string;
    projectId: string;
    label: string;
    chainType: ChainType;
    address: string;
    adapterType: KeyAdapterType;
    kmsKeyId: string | null;
    isMaster: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface CreateSignerKeyInput {
    label: string;
    chainType?: ChainType;
    adapterType: KeyAdapterType;
    kmsKeyId?: string;
}
export interface UpdateSignerKeyInput {
    label?: string;
    isActive?: boolean;
}
export interface SignerChainBalance {
    chainDbId: string;
    chainName: string;
    chainId: number;
    chainType: ChainType;
    nativeCurrency: string;
    isTestnet: boolean;
    balanceWei: string;
    balanceFormatted: string;
    error?: string;
}
export interface SignerTransaction {
    id: string;
    hash: string | null;
    to: string;
    value: string;
    status: TransactionStatus;
    chainName: string;
    chainId: number;
    explorerUrl: string | null;
    createdAt: string;
    confirmedAt: string | null;
}
export interface FundingLog {
    id: string;
    chainName: string;
    chainType: ChainType;
    nativeCurrency: string;
    fromAddress: string;
    toAddress: string;
    txHash: string | null;
    amountWei: string;
    amountFormatted: string;
    status: string;
    explorerUrl: string | null;
    createdAt: string;
}
/** Round-robin signer allocation for integrators (e.g. SUI capture / settle / sponsor). */
export interface AllocatedSigner {
    /** Signers API row id — maps to `MTXM_SUI_SIGNER_ID`. */
    signerId: string;
    label: string;
    chainType: ChainType;
    /** On-chain address — maps to `MTXM_SUI_SIGNER_PUBKEY`. */
    address: string;
    /** Base64 Ed25519 public key (32 bytes) — SUI only; maps to `MTXM_SUI_ED25519_PUBKEY_BASE64`. */
    publicBase64Key?: string;
}
export interface SignerDetail {
    signer: {
        id: string;
        label: string;
        address: string;
        adapterType: KeyAdapterType;
        isActive: boolean;
        isMaster: boolean;
        chainType: ChainType;
        createdAt: string;
        /** Base64 Ed25519 public key — SUI ENV signers only. */
        publicBase64Key?: string;
    };
    balances: SignerChainBalance[];
    txCount: number;
    recentTransactions: SignerTransaction[];
    fundingLogs: FundingLog[];
}
export type TransactionStatus = "QUEUED" | "SIGNING" | "SIGNED" | "BROADCASTING" | "BROADCAST" | "CONFIRMING" | "CONFIRMED" | "FAILED" | "STUCK" | "CANCELLED" | "SPEED_UP";
export interface Transaction {
    id: string;
    projectId: string;
    chainId: string;
    chain?: Chain;
    signerId: string;
    signer?: SignerKey;
    hash: string | null;
    from: string;
    to: string;
    value: string;
    data: string | null;
    solanaInstructions?: SolanaInstruction[] | null;
    solanaRawTransactionBase64?: string | null;
    solanaCuLimit?: number | null;
    solanaCuPriceMicroLamports?: number | null;
    suiMoveCalls?: SuiMoveCall[] | null;
    suiRawTransactionBase64?: string | null;
    suiGasBudget?: string | null;
    suiGasPrice?: string | null;
    nonce: number | null;
    gasLimit: string | null;
    gasPrice: string | null;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
    status: TransactionStatus;
    blockNumber: number | null;
    blockHash: string | null;
    receipt: unknown | null;
    metadata: Record<string, unknown> | null;
    errorMessage: string | null;
    attempts: number;
    createdAt: string;
    updatedAt: string;
    confirmedAt: string | null;
}
export interface SolanaAccountMeta {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
}
export interface SolanaInstruction {
    programId: string;
    keys: SolanaAccountMeta[];
    /** Base64-encoded instruction data bytes. Optional => empty data */
    dataBase64?: string;
}
export type SuiMoveCallArg = {
    kind: "object";
    objectId: string;
} | {
    kind: "pure";
    valueBase64: string;
    bcsType: string;
} | {
    kind: "address";
    address: string;
};
export interface SuiMoveCall {
    target: string;
    arguments: SuiMoveCallArg[];
    typeArguments?: string[];
}
export interface SuiAuthorizationInput {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingPackageId?: string;
        authority?: string;
    };
    structHash?: string;
    rawPreimageBase64?: string;
    rawPreimageHex?: string;
    payload?: Record<string, unknown>;
}
export interface SuiGasPaymentRef {
    objectId: string;
    version: string;
    digest: string;
}
/** SUI sponsored transaction — sponsor co-signs gas for a user-built PTB. */
export interface SuiSponsorSignInput {
    chainId: string | number;
    /** Optional override — must be a non-master SUI ENV signer. If omitted, MTXM round-robins non-master signers. */
    sponsorSignerId?: string;
    /** Kind bytes from tx.build({ onlyTransactionKind: true }) — base64. */
    transactionKindBase64?: string;
    /** Partial or full unsigned PTB — base64. Mutually exclusive with kind bytes. */
    transactionBase64?: string;
    /** Expected user sender — validated against PTB sender when set. */
    senderAddress?: string;
    gasBudget?: string;
    gasPrice?: string;
}
export interface SuiSponsorSignResult {
    sponsor: string;
    sender: string;
    gasOwner: string;
    /** false when sender pays own gas — only one signature needed on execute. */
    dualSignRequired: boolean;
    transactionBlockBase64: string;
    sponsorSignature: string;
    gasPayment: SuiGasPaymentRef[];
    gasBudget: string | null;
    gasPrice: string | null;
}
export interface SuiExecuteSponsoredInput {
    chainId: string | number;
    transactionBlockBase64: string;
    /** Dual signatures — user first, sponsor second (recommended). */
    signatures?: string[];
    userSignature?: string;
    sponsorSignature?: string;
    /** User wallet address (ZkLogin or Ed25519). Optional — PTB sender from sponsor-sign is used when omitted. */
    senderAddress?: string;
    /** MTXM signer row for tracking webhooks — optional. */
    signerId?: string;
    sponsorSignerId?: string;
    /** Persist tx record, webhooks, and confirmation (default true). */
    track?: boolean;
    to?: string;
    metadata?: Record<string, unknown>;
}
export interface SuiExecuteSponsoredResult {
    /** Present when track is false (sync execute). With tracking, digest arrives via tx.broadcast webhook. */
    digest?: string;
    transactionId?: string;
    status?: TransactionStatus;
}
export interface SolanaAuthorizationInput {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingProgramId?: string;
        authority?: string;
    };
    /**
     * Canonical struct hash supplied by the caller.
     * Use a 32-byte hex string (0x-prefixed) so both sides can verify the exact payload.
     */
    structHash?: string;
    /** Raw preimage bytes (base64) to sign exactly as provided. */
    rawPreimageBase64?: string;
    /** Raw preimage bytes (0x-prefixed hex) to sign exactly as provided. */
    rawPreimageHex?: string;
    payload?: Record<string, unknown>;
}
export interface SendTransactionInput {
    chainId: string | number;
    /** Optional: force which project signer will be used. If omitted, backend uses round-robin. */
    signerId?: string;
    to: string;
    value?: string;
    data?: string;
    gasLimit?: string;
    metadata?: Record<string, unknown>;
    solana?: {
        /** Generic Solana program transaction (single-signer, built server-side). */
        instructions?: SolanaInstruction[];
        /** Advanced: client-built raw Solana transaction (legacy/v0), base64-encoded. Requires signerId. */
        transactionBase64?: string;
        /** Optional compute budget config */
        cuLimit?: number;
        cuPriceMicroLamports?: number;
    };
    sui?: {
        moveCalls?: SuiMoveCall[];
        transactionBase64?: string;
        gasBudget?: string;
        gasPrice?: string;
    };
}
export interface SignTypedDataInput {
    chainType?: ChainType;
    chainId: string | number;
    signerId?: string;
    domain?: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: string;
    };
    types?: Record<string, Array<{
        name: string;
        type: string;
    }>>;
    value?: Record<string, unknown>;
    solana?: SolanaAuthorizationInput;
    sui?: SuiAuthorizationInput;
}
export interface TransactionFilters extends PaginationParams {
    status?: TransactionStatus;
    chainId?: string;
    from?: string;
    to?: string;
}
export type WebhookEventType = "tx.signing" | "tx.signed" | "tx.broadcasting" | "tx.broadcast" | "tx.confirmed" | "tx.failed" | "tx.stuck" | "tx.cancelled" | "tx.speed_up";
export interface WebhookEndpoint {
    id: string;
    projectId: string;
    url: string;
    secret: string;
    events: WebhookEventType[];
    isActive: boolean;
    failureCount: number;
    lastDeliveredAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface CreateWebhookInput {
    url: string;
    events: WebhookEventType[];
}
export interface UpdateWebhookInput {
    url?: string;
    events?: WebhookEventType[];
    isActive?: boolean;
}
export interface WebhookDelivery {
    id: string;
    endpointId: string;
    event: WebhookEventType;
    payload: unknown;
    statusCode: number | null;
    responseBody: string | null;
    latencyMs: number | null;
    attempts: number;
    error: string | null;
    deliveredAt: string | null;
    createdAt: string;
}
export interface WebhookDeliveryFilters extends PaginationParams {
    event?: WebhookEventType;
    statusCode?: number;
}
export type SettingDataType = "string" | "number" | "boolean";
export type SettingCategory = "queue" | "confirmation" | "stuck-resolver" | "rpc" | "funding";
export interface Setting {
    key: string;
    value: string;
    label: string;
    description: string | null;
    category: SettingCategory;
    dataType: SettingDataType;
    updatedAt: string;
}
export interface UpdateSettingInput {
    value: string;
}
export interface ChainFundingOverride {
    chainDbId: string;
    chainName: string;
    chainId: number;
    nativeCurrency: string;
    isTestnet: boolean;
    chainType?: ChainType;
    hasOverride: boolean;
    override: {
        minBalanceEth: string | null;
        fundAmountEth: string | null;
    };
    effective: {
        minBalanceEth: string;
        fundAmountEth: string;
    };
}
export interface ProjectFundingConfig {
    global: {
        minBalanceEth: string;
        fundAmountEth: string;
    };
    globalByChainType?: Partial<Record<ChainType, {
        nativeCurrency: string;
        minBalance: string;
        fundAmount: string;
    }>>;
    chains: ChainFundingOverride[];
}
//# sourceMappingURL=types.d.ts.map