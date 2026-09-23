// Shared types for the multi-chain indexer

export interface ChainConfig {
  id: string;
  chainId: number;
  name: string;
  rpcUrls: string[];
  activeRpcIndex: number;
  blockTime: number;
  finalityBlocks: number;
  isActive: boolean;
}

export interface ContractConfig {
  id: string;
  projectId: string;
  chainId: number;
  address: string;
  abi: any[];
  startBlock: number;
  name: string;
  isActive: boolean;
}

export interface EventSubscription {
  id: string;
  contractId: string;
  eventName: string;
  eventSignature: string;
  topic0: string;
  isActive: boolean;
}

export interface IndexedEvent {
  id: string;
  subscriptionId: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  args: Record<string, any>;
  timestamp: Date;
}

export interface IndexState {
  id: string;
  chainId: number;
  contractId: string;
  lastIndexedBlock: number;
  lastFinalizedBlock: number;
  updatedAt: Date;
}

export interface Webhook {
  id: string;
  projectId: string;
  url: string;
  secret: string;
  isActive: boolean;
  events: string[]; // event subscription IDs to trigger on
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  responseCode?: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  apiKey: string;
  isActive: boolean;
  createdAt: Date;
}

// API Request/Response types
export interface CreateChainRequest {
  chainId: number;
  name: string;
  rpcUrls: string[];
  blockTime?: number;
  finalityBlocks?: number;
}

export interface CreateContractRequest {
  projectId: string;
  chainId: number;
  address: string;
  abi: any[];
  startBlock?: number;
  name: string;
}

export interface CreateWebhookRequest {
  projectId: string;
  url: string;
  secret?: string;
  eventSubscriptionIds: string[];
}

export interface EventsQueryParams {
  contractId?: string;
  eventName?: string;
  chainId?: number;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
  offset?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Webhook payload sent to subscribers
export interface WebhookPayload {
  id: string;
  event: string;
  chainId: number;
  contractAddress: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  args: Record<string, any>;
  timestamp: string;
}

// RPC Health status
export interface RpcHealth {
  url: string;
  isHealthy: boolean;
  latency: number;
  lastChecked: Date;
  errorCount: number;
}

export interface ChainHealth {
  chainId: number;
  name: string;
  rpcs: RpcHealth[];
  currentRpcIndex: number;
  lastIndexedBlock: number;
  latestBlock: number;
  isSynced: boolean;
}
