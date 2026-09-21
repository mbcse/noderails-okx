import type { TransactionStatus, WebhookEventType } from "./types";
interface StatusConfig {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    dotColor: string;
}
export declare const TRANSACTION_STATUS_CONFIG: Record<TransactionStatus, StatusConfig>;
export declare const WEBHOOK_EVENT_OPTIONS: {
    value: WebhookEventType;
    label: string;
}[];
export declare const COMMON_CHAINS: readonly [{
    readonly name: "Ethereum Mainnet";
    readonly chainId: 1;
    readonly nativeCurrency: "ETH";
    readonly isTestnet: false;
}, {
    readonly name: "Ethereum Sepolia";
    readonly chainId: 11155111;
    readonly nativeCurrency: "ETH";
    readonly isTestnet: true;
}, {
    readonly name: "Polygon Mainnet";
    readonly chainId: 137;
    readonly nativeCurrency: "MATIC";
    readonly isTestnet: false;
}, {
    readonly name: "Polygon Amoy";
    readonly chainId: 80002;
    readonly nativeCurrency: "MATIC";
    readonly isTestnet: true;
}, {
    readonly name: "Arbitrum One";
    readonly chainId: 42161;
    readonly nativeCurrency: "ETH";
    readonly isTestnet: false;
}, {
    readonly name: "Arbitrum Sepolia";
    readonly chainId: 421614;
    readonly nativeCurrency: "ETH";
    readonly isTestnet: true;
}, {
    readonly name: "Optimism";
    readonly chainId: 10;
    readonly nativeCurrency: "ETH";
    readonly isTestnet: false;
}, {
    readonly name: "Base";
    readonly chainId: 8453;
    readonly nativeCurrency: "ETH";
    readonly isTestnet: false;
}, {
    readonly name: "Base Sepolia";
    readonly chainId: 84532;
    readonly nativeCurrency: "ETH";
    readonly isTestnet: true;
}, {
    readonly name: "BSC Mainnet";
    readonly chainId: 56;
    readonly nativeCurrency: "BNB";
    readonly isTestnet: false;
}, {
    readonly name: "Avalanche C-Chain";
    readonly chainId: 43114;
    readonly nativeCurrency: "AVAX";
    readonly isTestnet: false;
}];
export declare const SOLANA_DEFAULT_CHAINS: readonly [{
    readonly key: "testnet";
    readonly name: "Solana Testnet";
    readonly chainId: 101;
    readonly rpcUrl: "https://api.testnet.solana.com";
    readonly explorerUrl: "https://explorer.solana.com/?cluster=testnet";
    readonly nativeCurrency: "SOL";
    readonly isTestnet: true;
    readonly note: "Validator and stress testing. May have intermittent downtime.";
}, {
    readonly key: "devnet";
    readonly name: "Solana Devnet";
    readonly chainId: 102;
    readonly rpcUrl: "https://api.devnet.solana.com";
    readonly explorerUrl: "https://explorer.solana.com/?cluster=devnet";
    readonly nativeCurrency: "SOL";
    readonly isTestnet: true;
    readonly note: "Public testing and development. Free SOL airdrop for testing.";
}, {
    readonly key: "mainnet";
    readonly name: "Solana Mainnet";
    readonly chainId: 103;
    readonly rpcUrl: "https://api.mainnet.solana.com";
    readonly explorerUrl: "https://explorer.solana.com";
    readonly nativeCurrency: "SOL";
    readonly isTestnet: false;
    readonly note: "Live production environment. Requires SOL for transactions.";
}];
export declare const SUI_DEFAULT_CHAINS: readonly [{
    readonly key: "testnet";
    readonly name: "Sui Testnet";
    readonly chainId: 202;
    readonly rpcUrl: "https://fullnode.testnet.sui.io:443";
    readonly explorerUrl: "https://suiscan.xyz/testnet/tx";
    readonly nativeCurrency: "SUI";
    readonly isTestnet: true;
    readonly note: "Public testnet for development and testing.";
}, {
    readonly key: "devnet";
    readonly name: "Sui Devnet";
    readonly chainId: 201;
    readonly rpcUrl: "https://fullnode.devnet.sui.io:443";
    readonly explorerUrl: "https://suiscan.xyz/devnet/tx";
    readonly nativeCurrency: "SUI";
    readonly isTestnet: true;
    readonly note: "Developer network with frequent resets.";
}, {
    readonly key: "mainnet";
    readonly name: "Sui Mainnet";
    readonly chainId: 203;
    readonly rpcUrl: "https://fullnode.mainnet.sui.io:443";
    readonly explorerUrl: "https://suiscan.xyz/mainnet/tx";
    readonly nativeCurrency: "SUI";
    readonly isTestnet: false;
    readonly note: "Live production environment. Requires SUI for gas.";
}];
export declare const PROJECT_NAV_ITEMS: ({
    label: string;
    href: string;
    icon: "LayoutDashboard";
} | {
    label: string;
    href: string;
    icon: "Link";
} | {
    label: string;
    href: string;
    icon: "Wallet";
} | {
    label: string;
    href: string;
    icon: "KeyRound";
} | {
    label: string;
    href: string;
    icon: "ArrowLeftRight";
} | {
    label: string;
    href: string;
    icon: "Webhook";
})[];
export {};
//# sourceMappingURL=constants.d.ts.map