export const TRANSACTION_STATUS_CONFIG = {
    QUEUED: { label: "Queued", variant: "secondary", dotColor: "bg-zinc-400" },
    SIGNING: { label: "Signing", variant: "outline", dotColor: "bg-yellow-400" },
    SIGNED: { label: "Signed", variant: "outline", dotColor: "bg-blue-400" },
    BROADCASTING: { label: "Broadcasting", variant: "outline", dotColor: "bg-yellow-400" },
    BROADCAST: { label: "Broadcast", variant: "default", dotColor: "bg-blue-500" },
    CONFIRMING: { label: "Confirming", variant: "outline", dotColor: "bg-yellow-500" },
    CONFIRMED: { label: "Confirmed", variant: "default", dotColor: "bg-emerald-500" },
    FAILED: { label: "Failed", variant: "destructive", dotColor: "bg-red-500" },
    STUCK: { label: "Stuck", variant: "destructive", dotColor: "bg-orange-500" },
    CANCELLED: { label: "Cancelled", variant: "secondary", dotColor: "bg-zinc-500" },
    SPEED_UP: { label: "Speed Up", variant: "outline", dotColor: "bg-purple-400" },
};
// ────────────────────────────────────────────────────────────
// Webhook event type labels
// ────────────────────────────────────────────────────────────
export const WEBHOOK_EVENT_OPTIONS = [
    { value: "tx.signing", label: "Transaction Signing" },
    { value: "tx.signed", label: "Transaction Signed" },
    { value: "tx.broadcasting", label: "Transaction Broadcasting" },
    { value: "tx.broadcast", label: "Transaction Broadcast" },
    { value: "tx.confirmed", label: "Transaction Confirmed" },
    { value: "tx.failed", label: "Transaction Failed" },
    { value: "tx.stuck", label: "Transaction Stuck" },
    { value: "tx.cancelled", label: "Transaction Cancelled" },
    { value: "tx.speed_up", label: "Transaction Speed Up" },
];
// ────────────────────────────────────────────────────────────
// Commonly used chains (pre-fill helpers)
// ────────────────────────────────────────────────────────────
export const COMMON_CHAINS = [
    { name: "Ethereum Mainnet", chainId: 1, nativeCurrency: "ETH", isTestnet: false },
    { name: "Ethereum Sepolia", chainId: 11155111, nativeCurrency: "ETH", isTestnet: true },
    { name: "Polygon Mainnet", chainId: 137, nativeCurrency: "MATIC", isTestnet: false },
    { name: "Polygon Amoy", chainId: 80002, nativeCurrency: "MATIC", isTestnet: true },
    { name: "Arbitrum One", chainId: 42161, nativeCurrency: "ETH", isTestnet: false },
    { name: "Arbitrum Sepolia", chainId: 421614, nativeCurrency: "ETH", isTestnet: true },
    { name: "Optimism", chainId: 10, nativeCurrency: "ETH", isTestnet: false },
    { name: "Base", chainId: 8453, nativeCurrency: "ETH", isTestnet: false },
    { name: "Base Sepolia", chainId: 84532, nativeCurrency: "ETH", isTestnet: true },
    { name: "BSC Mainnet", chainId: 56, nativeCurrency: "BNB", isTestnet: false },
    { name: "Avalanche C-Chain", chainId: 43114, nativeCurrency: "AVAX", isTestnet: false },
];
export const SOLANA_DEFAULT_CHAINS = [
    {
        key: "testnet",
        name: "Solana Testnet",
        chainId: 101,
        rpcUrl: "https://api.testnet.solana.com",
        explorerUrl: "https://explorer.solana.com/?cluster=testnet",
        nativeCurrency: "SOL",
        isTestnet: true,
        note: "Validator and stress testing. May have intermittent downtime.",
    },
    {
        key: "devnet",
        name: "Solana Devnet",
        chainId: 102,
        rpcUrl: "https://api.devnet.solana.com",
        explorerUrl: "https://explorer.solana.com/?cluster=devnet",
        nativeCurrency: "SOL",
        isTestnet: true,
        note: "Public testing and development. Free SOL airdrop for testing.",
    },
    {
        key: "mainnet",
        name: "Solana Mainnet",
        chainId: 103,
        rpcUrl: "https://api.mainnet.solana.com",
        explorerUrl: "https://explorer.solana.com",
        nativeCurrency: "SOL",
        isTestnet: false,
        note: "Live production environment. Requires SOL for transactions.",
    },
];
export const SUI_DEFAULT_CHAINS = [
    {
        key: "testnet",
        name: "Sui Testnet",
        chainId: 202,
        rpcUrl: "https://fullnode.testnet.sui.io:443",
        explorerUrl: "https://suiscan.xyz/testnet/tx",
        nativeCurrency: "SUI",
        isTestnet: true,
        note: "Public testnet for development and testing.",
    },
    {
        key: "devnet",
        name: "Sui Devnet",
        chainId: 201,
        rpcUrl: "https://fullnode.devnet.sui.io:443",
        explorerUrl: "https://suiscan.xyz/devnet/tx",
        nativeCurrency: "SUI",
        isTestnet: true,
        note: "Developer network with frequent resets.",
    },
    {
        key: "mainnet",
        name: "Sui Mainnet",
        chainId: 203,
        rpcUrl: "https://fullnode.mainnet.sui.io:443",
        explorerUrl: "https://suiscan.xyz/mainnet/tx",
        nativeCurrency: "SUI",
        isTestnet: false,
        note: "Live production environment. Requires SUI for gas.",
    },
];
// ────────────────────────────────────────────────────────────
// Project-level sidebar navigation
// ────────────────────────────────────────────────────────────
export const PROJECT_NAV_ITEMS = [
    { label: "Overview", href: "", icon: "LayoutDashboard" },
    { label: "Chains", href: "/chains", icon: "Link" },
    { label: "Funding", href: "/funding", icon: "Wallet" },
    { label: "Signers", href: "/signers", icon: "KeyRound" },
    { label: "Transactions", href: "/transactions", icon: "ArrowLeftRight" },
    { label: "Webhooks", href: "/webhooks", icon: "Webhook" },
];
//# sourceMappingURL=constants.js.map