# NodeRails on OKX X Layer

NodeRails is payment infrastructure for crypto commerce. Merchants get hosted checkout, payment links, invoices, subscriptions, payouts, and disputes. Shoppers pay from a wallet. Funds sit in **on-chain escrow** with clear rules for capture, refund, dispute, and settlement.

This repository is our **X Layer** focused package: EVM escrow and merchant-manager contracts deployed on X Layer Testnet, plus the platform and the services that make production payments work day to day (**MTXM**, **Indexer**, **BPC**).

Live product: [noderails.com](https://www.noderails.com) · Merchant dashboard: [merchant.noderails.com](https://merchant.noderails.com)

For deeper access, diligence, or a live walkthrough on X Layer, write to **mohit@noderails.com**.

---

## Why X Layer

X Layer (by OKX) is a low-cost EVM environment that fits retail and merchant flows well: fast confirmation, familiar tooling, and OKX ecosystem reach.

We run NodeRails escrow and merchant manager on **X Layer Testnet (chain ID 1952)**:

| | |
|--|--|
| Network | X Layer Testnet |
| Chain ID | `1952` |
| RPC | `https://xlayertestrpc.okx.com` |
| Explorer | `https://www.oklink.com/xlayer-test` |
| Native gas | OKB |
| Escrow | `0x5a4bc03b982a909fc1e665cf63c5e662ee74cb2a` |
| Merchant Manager | `0x2fa8ec8170e74afa89991e44e7d8c984f7867e86` |

Same Solidity contracts we use on other EVM chains. X Layer is a first-class rail for merchants who want OKX ecosystem settlement without rebuilding their payment stack.

---

## The problem we solve

Crypto payments are still hard for normal businesses.

**For shoppers**  
Wallet UX is rough. People abandon when the flow feels like a developer tool, not a checkout. They need clear amounts, clear status, and a path that finishes.

**For merchants**  
You cannot tell every customer to “just send tokens to this address.” You need payment intents, webhooks, invoices, refunds, and reports that finance can trust. You also need protection when something goes wrong after capture.

**For ops and risk**  
Someone has to sign and broadcast txs reliably, watch contracts for events, price tokens correctly, and keep keys out of the main API process. That is not something every product team should rebuild from scratch.

NodeRails is that layer: Stripe-shaped product objects on top, escrow and programme rules on chain, and first-party ops services underneath.

---

## What merchants get

- **Hosted checkout** and **payment UI** on X Layer (and other configured EVM chains)
- **Payment links**, **invoices**, **one-time** and **subscription** billing
- **Payment intents** with clear states: created → authorized → captured → settled / refunded / disputed
- **Webhooks** and a TypeScript-friendly API surface for your backend
- **Merchant dashboard** for apps, keys, customers, payouts, and bank settlement settings
- **Admin** tools for chains, tokens, fees, and platform config

---

## Core features (why teams pick NodeRails)

### Timelock escrow

After capture, funds sit in the **NodeRails Escrow** contract, not in a hot wallet that ops can sweep by accident. Settlement and refunds follow programme rules and timelocks. Merchants get predictable money movement; payers get a window where disputes and refunds are still possible before full settle.

### Chargebacks / dispute support

Crypto does not magically remove buyer–seller conflict. NodeRails models **disputes** in product state and on chain: open a dispute inside the window, collect evidence, and resolve toward merchant or payer. That is our chargeback-style safety net for escrowed payments, with an audit trail ops can actually use.

### Fraud and risk hooks

Before or during authorization, the stack can attach risk signals (wallet screening where configured, disposable-email checks, suspension flags, and admin controls). The point is simple: catch bad wallets and abuse early, without blocking every honest checkout.

### Bank account settlement

Merchants who want fiat endpoints can enable **bank settlement** flows (own-account onboarding and global bank account options where the corridor is live). Crypto capture still goes through escrow; off-ramp / bank payout is a first-class path next to on-chain settle. Useful when finance wants a bank balance, not only a wallet balance.

### Payouts and merchant manager

**Merchant Manager** on X Layer handles merchant payouts (single and bulk). Merchants authorize payout programmes; MTXM submits the on-chain work; Indexer confirms events back into NodeRails.

### Conversion and multi-rail settlement

Where configured, merchants can convert and settle toward preferred tokens / chains, or keep single-chain settlement simple. Quotes and fees are explicit so checkout can show what the payer will spend.

---

## How the stack fits together on X Layer

```
Shopper / merchant apps
        |
        v
   NodeRails API + payment UI
        |
        +---- BPC --------> live prices and balances
        |
        +---- MTXM -------> sign + broadcast on X Layer
        |
        +---- Indexer ----> contract events back as webhooks
        |
        v
   Escrow + Merchant Manager (X Layer)
```

1. Checkout uses **BPC** so amounts and balances are consistent across RPCs.
2. Capture / settle / refund / payout requests go to **MTXM**, which owns signers and broadcast.
3. **Indexer** watches Escrow and Merchant Manager on chain `1952` and posts events into NodeRails.
4. Merchant backends only talk to NodeRails APIs and webhooks. They do not need to run their own indexer or key farm.

---

## MTXM (Multichain Transaction Manager)

Folder: `MultichainTxManager/`

MTXM is our transaction ops service. The main API does not hold day-to-day EVM private keys for every settle and payout. It asks MTXM to:

- register projects, chains, and signers
- submit transactions (calldata for escrow / merchant manager)
- track pending → confirmed / failed
- notify NodeRails over secured webhooks

That separation keeps the payment API focused on product state, and MTXM focused on reliable chain execution. On X Layer this is how capture, refund, dispute, settle, and payout txs actually leave the building.

---

## Indexer

Folder: `Indexer/`

Indexer is the independent eyes on chain. We register Escrow and Merchant Manager ABIs and addresses (including X Layer), scan for events, and deliver HMAC webhooks into NodeRails.

Why it matters: MTXM tells you what you *submitted*. Indexer tells you what the chain *emitted*. Together they give confirmation you can reconcile, which is what finance and support need when someone asks “did that payment actually settle?”

---

## BPC (Balance and Price Check)

Folder: `noderails-bpc-service/`

BPC is a small dedicated service for **prices** and **balances**. Checkout and dashboards should not invent their own RPC soup. BPC pools RPCs, serves `/v1/prices` and `/v1/balance`, and keeps token/chain config in one place.

On X Layer that means OKB and configured tokens show consistent numbers in payment UI and merchant screens.

---

## On-chain contracts (EVM / X Layer)

Folder: `noderails/noderails-contracts/`

| Contract | Role |
|----------|------|
| `NodeRailsEscrow` | Payment escrow: capture, convert, settle, bank settle, withdraw, dispute |
| `NodeRailsEscrowLogic` | Logic implementation behind the escrow facade |
| `NodeRailsMerchantManager` | Merchant payouts (single / bulk) |
| `SuperAdmin3of5` | Multi-sig style super-admin controls for sensitive ops |

Deploy data for X Layer Testnet lives under `noderails/noderails-contracts/deployData/` (chain `1952`).

---

## Repository map

```
noderails-okx/
├── README.md
├── noderails/                  # Platform: apps, API, packages, EVM contracts
├── MultichainTxManager/        # MTXM – sign / broadcast / confirm
├── Indexer/                    # On-chain event indexer + webhooks
└── noderails-bpc-service/      # Prices and balances
```

Useful places inside `noderails/`:

| Path | What you will find |
|------|--------------------|
| `apps/payment-ui` | Hosted checkout experience |
| `apps/dashboard` | Merchant dashboard |
| `apps/admin` | Platform admin |
| `apps/landing` | Marketing / product site |
| `services/noderails-server` | Main API, webhooks, payment lifecycle |
| `packages/mtxm-client` | Client for MTXM |
| `packages/indexer-client` | Client for Indexer |
| `noderails-contracts/src` | Escrow and merchant manager Solidity |

---

## Benefits in one page

| Need | How NodeRails helps on X Layer |
|------|--------------------------------|
| Accept crypto without DIY escrow | Escrow + payment intents + hosted checkout |
| Protect after capture | Timelocks, refunds, dispute / chargeback-style flow |
| Pay out merchants and vendors | Merchant Manager + MTXM |
| Settle to bank where available | Bank settlement path beside on-chain settle |
| Reliable chain ops | MTXM for submit, Indexer for observe |
| Honest prices at checkout | BPC for balances and FX-style quotes |
| Grow with OKX ecosystem | Same product on X Layer Testnet today, mainnet-ready contracts |

---

## Contact

Built by **Martand Rise / NodeRails**.

Questions, X Layer mainnet (`196`) registration, partnership, or a demo: **mohit@noderails.com**
