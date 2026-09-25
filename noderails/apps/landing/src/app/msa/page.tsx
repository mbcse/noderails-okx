import Link from 'next/link';

const EFFECTIVE_DATE = '15 April 2026';
const VERSION = '1.0';

export const metadata = {
  title: 'Merchant Services Agreement | NodeRails',
  description:
    'The Merchant Services Agreement governing merchant use of NodeRails payment processing, settlement, and payout services.',
};

export default function MerchantServicesAgreementPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-20">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12 docs-content">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-indigo-600">Legal</p>
          <h1>Merchant Services Agreement</h1>
          <p className="subtitle">
            Effective date: {EFFECTIVE_DATE} &middot; Version {VERSION}
          </p>

          <p>
            This Merchant Services Agreement (this &ldquo;Agreement&rdquo;) is a binding contract between NodeRails
            (&ldquo;NodeRails,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) and the business entity
            or sole proprietor that registers for and uses a NodeRails merchant account (the &ldquo;Merchant,&rdquo;
            &ldquo;you,&rdquo; or &ldquo;your&rdquo;). This Agreement sets forth the terms under which NodeRails will
            provide payment acceptance, settlement, reporting, and related technology services to Merchant, and under
            which Merchant will use those services in connection with Merchant&apos;s lawful commercial activities.
          </p>
          <p>
            By clicking &ldquo;I agree,&rdquo; completing merchant onboarding, creating an account, or accessing or
            using any part of the Services (as defined below), you acknowledge that you have read, understood, and agree
            to be bound by this Agreement on behalf of yourself and, if applicable, the business you represent. If you
            accept on behalf of a company or other legal entity, you represent and warrant that you have full legal
            authority to bind that entity. If you do not agree, you must not use the Services.
          </p>

          <h2>1. Incorporation of Related Documents</h2>
          <p>
            This Agreement incorporates by reference, as if fully set forth herein, the following documents as they may
            be updated from time to time: (a) the NodeRails{' '}
            <Link href="/terms">Terms and Conditions</Link>; (b) the NodeRails{' '}
            <Link href="/privacy">Privacy Policy</Link>; (c) any pricing schedule, order form, or plan documentation
            applicable to your account; (d) our published prohibited and restricted business policies; and (e) any
            product-specific or feature-specific terms disclosed in the dashboard or developer documentation at the time
            you enable a feature. In the event of a conflict between this Agreement and a separately executed written
            enterprise agreement signed by both parties, the enterprise agreement will control with respect to the
            subject matter of that conflict.
          </p>

          <h2>2. Definitions</h2>
          <p>Capitalized terms used in this Agreement have the meanings set forth below or in the section where they first appear.</p>
          <ul>
            <li>
              <strong>&ldquo;Applicable Law&rdquo;</strong> means all laws, statutes, regulations, rules, orders, and
              binding guidance of any governmental, regulatory, or self-regulatory authority that applies to a party or
              to a transaction processed under this Agreement, including without limitation laws relating to
              anti-money laundering (&ldquo;AML&rdquo;), countering the financing of terrorism (&ldquo;CFT&rdquo;),
              economic and trade sanctions, consumer protection, privacy and data protection, tax, securities, and
              payment services.
            </li>
            <li>
              <strong>&ldquo;Authorized User&rdquo;</strong> means any employee, contractor, or agent of Merchant whom
              Merchant permits to access the dashboard, APIs, or other administrative interfaces under Merchant&apos;s
              account.
            </li>
            <li>
              <strong>&ldquo;Banking Partner&rdquo;</strong> means a licensed bank, electronic money institution,
              payment institution, or other regulated financial services provider that NodeRails uses or makes available
              to facilitate fiat conversion, virtual account references, bank settlement, or off-ramp services for
              Merchant.
            </li>
            <li>
              <strong>&ldquo;Charge&rdquo;</strong> means a payment initiated by a Customer in favor of Merchant
              through the Services, whether in digital assets or, where supported, fiat.
            </li>
            <li>
              <strong>&ldquo;Confidential Information&rdquo;</strong> means non-public information disclosed by one party
              to the other that is designated as confidential or that reasonably should be understood to be confidential
              given the nature of the information and the circumstances of disclosure.
            </li>
            <li>
              <strong>&ldquo;Customer&rdquo;</strong> means an end user, purchaser, or payer who initiates a Charge to
              Merchant through checkout, a payment link, an invoice, a subscription renewal, or another payment flow
              enabled by the Services.
            </li>
            <li>
              <strong>&ldquo;Digital Assets&rdquo;</strong> means cryptocurrencies, stablecoins, and other digital
              tokens supported by the Services on one or more blockchain networks.
            </li>
            <li>
              <strong>&ldquo;Dispute&rdquo;</strong> means a Customer claim, chargeback, reversal request, or formal
              dispute raised through the Services or under Applicable Law in connection with a Charge.
            </li>
            <li>
              <strong>&ldquo;Fees&rdquo;</strong> means all platform fees, processing fees, subscription fees, and other
              amounts payable by Merchant to NodeRails as disclosed in the applicable pricing plan or order form.
            </li>
            <li>
              <strong>&ldquo;Merchant Data&rdquo;</strong> means information submitted by or on behalf of Merchant to
              the Services, including business profile data, product catalogs, pricing, Customer contact information
              submitted by Merchant, API payloads, and settlement instructions.
            </li>
            <li>
              <strong>&ldquo;Network&rdquo;</strong> means a supported blockchain or distributed ledger protocol (for
              example, EVM-compatible chains, Solana, or Sui) through which on-chain payment flows are executed.
            </li>
            <li>
              <strong>&ldquo;Platform&rdquo;</strong> means the NodeRails software, hosted infrastructure, APIs, SDKs,
              dashboards, documentation, and related tools made available to Merchant under this Agreement.
            </li>
            <li>
              <strong>&ldquo;Reserve&rdquo;</strong> means an amount of settlement proceeds that NodeRails or a Banking
              Partner withholds temporarily to secure Merchant&apos;s obligations under this Agreement.
            </li>
            <li>
              <strong>&ldquo;Services&rdquo;</strong> means the Platform and all payment, settlement, reporting,
              compliance, and ancillary services NodeRails provides to Merchant under this Agreement, including hosted
              checkout, payment links, invoicing, subscriptions, on-chain capture and escrow, payout initiation, optional
              fiat settlement features, virtual account references, webhooks, and developer integrations.
            </li>
            <li>
              <strong>&ldquo;Settlement&rdquo;</strong> means the transfer of funds resulting from a captured Charge to
              Merchant or to Merchant&apos;s designated Settlement Account, net of Fees, reserves, offsets, and
              adjustments permitted under this Agreement.
            </li>
            <li>
              <strong>&ldquo;Settlement Account&rdquo;</strong> means the blockchain wallet address, bank account, or
              other destination designated by Merchant in the dashboard or via API to receive Settlement proceeds.
            </li>
            <li>
              <strong>&ldquo;Transaction Data&rdquo;</strong> means data generated by or in connection with Charges,
              including amounts, currencies, token types, chain identifiers, wallet addresses, transaction hashes,
              timestamps, and status events.
            </li>
            <li>
              <strong>&ldquo;Virtual Account&rdquo;</strong> means a unique account reference, routing identifier, or
              similar banking credential issued by a Banking Partner and assigned to Merchant for the purpose of
              receiving bank Settlement of Merchant&apos;s funds. A Virtual Account is not a deposit account maintained
              by NodeRails.
            </li>
          </ul>

          <h2>3. Scope of Services and Role of the Parties</h2>
          <h3>3.1 Services Provided</h3>
          <p>
            Subject to this Agreement and successful completion of onboarding, NodeRails will make the Services
            available to Merchant for Merchant&apos;s internal business use. The Services may include, without
            limitation:
          </p>
          <ul>
            <li>Hosted checkout pages, payment links, and invoice payment flows;</li>
            <li>Recurring billing and subscription management, including automated renewal charges where supported on a given Network;</li>
            <li>On-chain payment authorization, capture, escrow, dispute, refund, and settlement orchestration through smart contracts and program logic deployed on supported Networks;</li>
            <li>Merchant dashboards, transaction reporting, webhook notifications, and exportable records;</li>
            <li>REST and SDK-based APIs for payment intent creation, checkout session management, and post-payment operations;</li>
            <li>Payout and settlement tooling to transfer captured proceeds to Merchant-designated Settlement Accounts;</li>
            <li>
              Optional fiat settlement pathways, including conversion and bank transfer services performed by Banking
              Partners and, where enabled, Virtual Account references for bank Settlement; and
            </li>
            <li>Risk, compliance, and fraud-screening tools that support Merchant onboarding and transaction monitoring.</li>
          </ul>

          <h3>3.2 Technology Provider; Non-Custodial Model</h3>
          <p>
            Merchant acknowledges that NodeRails is a technology and payments infrastructure provider. Except as expressly
            stated in a separate written agreement with a Banking Partner or as required by Applicable Law, NodeRails
            does not: (a) take custody of Customer or Merchant Digital Assets; (b) control private keys for Merchant
            wallets; (c) operate as a bank, trust company, broker-dealer, or registered exchange; or (d) hold fiat
            balances on behalf of Merchant. On-chain funds are moved according to protocol rules and Merchant
            instructions through escrow and settlement flows on supported Networks. Fiat Settlement, where available, is
            performed by Banking Partners into accounts held in Merchant&apos;s name or for Merchant&apos;s benefit,
            subject to the Banking Partner&apos;s terms and Applicable Law.
          </p>

          <h3>3.3 No Guarantee of Availability</h3>
          <p>
            NodeRails may modify, suspend, or discontinue features of the Services from time to time. Support for
            particular Networks, tokens, fiat currencies, or Banking Partners may change based on technical, legal, or
            commercial considerations. NodeRails will use commercially reasonable efforts to provide advance notice of
            material deprecations that affect production integrations, except where immediate action is required for
            security, compliance, or network integrity.
          </p>

          <h2>4. Merchant Onboarding, Eligibility, and Account Security</h2>
          <h3>4.1 Eligibility</h3>
          <p>To register for and maintain a merchant account, Merchant must:</p>
          <ul>
            <li>Be duly organized and validly existing under the laws of its jurisdiction of formation, or be a natural person of legal age with capacity to contract;</li>
            <li>Conduct business only in jurisdictions where use of the Services is permitted by Applicable Law and by NodeRails policy;</li>
            <li>Not be listed on, owned or controlled by a person listed on, or located in a country or territory subject to comprehensive sanctions administered by the United States, United Kingdom, European Union, or other applicable authority;</li>
            <li>Sell only lawful goods and services that comply with this Agreement and NodeRails prohibited-business policies; and</li>
            <li>Complete all onboarding steps requested by NodeRails or a Banking Partner, including identity verification, beneficial ownership disclosure, and source-of-funds or business model documentation where reasonably requested.</li>
          </ul>

          <h3>4.2 Know Your Business and Enhanced Due Diligence</h3>
          <p>
            Merchant will provide accurate and complete information during onboarding and will update that information
            promptly upon any material change. NodeRails and its Banking Partners may conduct initial and periodic
            know-your-business (&ldquo;KYB&rdquo;), know-your-customer (&ldquo;KYC&rdquo;), and enhanced due diligence
            reviews. Merchant will cooperate fully, including by providing additional documentation, explanations of
            business model, expected transaction volumes, geographies, and counterparties, and responses to
            questionnaires. Failure to cooperate may result in delayed activation, restricted features, suspension, or
            termination.
          </p>

          <h3>4.3 Account Credentials and Authorized Users</h3>
          <p>
            Merchant is responsible for all activity occurring under its account, including activity by Authorized Users.
            Merchant will: (a) maintain strong authentication for dashboard access; (b) restrict API keys and secrets to
            personnel with a need to know; (c) rotate compromised credentials promptly; and (d) notify NodeRails
            immediately at <a href="mailto:business@example.com">business@example.com</a> upon discovery of
            unauthorized access or suspected credential theft. NodeRails may suspend API access upon reasonable belief
            of compromise until Merchant confirms remediation.
          </p>

          <h2>5. Merchant Obligations and Restrictions on Use</h2>
          <h3>5.1 General Merchant Obligations</h3>
          <p>Merchant agrees that it will:</p>
          <ul>
            <li>Use the Services solely for bona fide commercial transactions arising from Merchant&apos;s own sales of goods or services;</li>
            <li>Present accurate, non-misleading descriptions of goods and services, including price, currency, delivery timelines, recurring billing terms, and cancellation rights;</li>
            <li>Honor valid Customer refund and cancellation requests in accordance with Merchant&apos;s published policies and Applicable Law;</li>
            <li>Maintain adequate customer support channels and respond to Customer inquiries in a timely manner;</li>
            <li>Comply with all Applicable Law in every jurisdiction where Merchant offers goods or services to Customers;</li>
            <li>Collect, use, and disclose Customer personal data only as permitted by Applicable Law and Merchant&apos;s own privacy notices;</li>
            <li>Ensure Settlement Account details (wallet addresses, bank account numbers, routing data) are accurate and belong to Merchant or Merchant&apos;s duly authorized entity; and</li>
            <li>Not interfere with, overload, reverse engineer, decompile, or attempt to derive source code from the Platform except to the limited extent expressly permitted by Applicable Law notwithstanding this restriction.</li>
          </ul>

          <h3>5.2 Prohibition on Payment Aggregation and Resale</h3>
          <p>
            Unless NodeRails provides prior written consent, Merchant may not use the Services to process payments on
            behalf of third parties, operate as a payment facilitator or aggregator, white-label the Services for
            unrelated merchants, or resell access to the Platform. Merchant&apos;s use must be tied to Merchant&apos;s
            own brand and commercial activity.
          </p>

          <h3>5.3 Integration and Technical Requirements</h3>
          <p>
            Where Merchant integrates via API or SDK, Merchant is responsible for secure implementation, validation of
            webhook signatures, idempotent handling of retries, and testing in non-production environments before
            release. Merchant will not bypass documented APIs or use the Services in a manner that materially degrades
            platform performance or security.
          </p>

          <h2>6. Prohibited and Restricted Businesses</h2>
          <p>
            Merchant may not use the Services, directly or indirectly, in connection with any of the following categories,
            or with any activity that violates Applicable Law or NodeRails published policies (as updated from time to
            time):
          </p>
          <ul>
            <li>Money laundering, terrorist financing, sanctions evasion, bribery, or corruption;</li>
            <li>Fraud, identity theft, account takeover, or misrepresentation of identity or business purpose;</li>
            <li>Illegal narcotics, controlled substances sold without required licenses, or unapproved pharmaceuticals;</li>
            <li>Child sexual abuse material, exploitation, or any sexual services involving minors;</li>
            <li>Human trafficking or forced labor;</li>
            <li>Unlicensed money transmission, unregistered securities offerings, Ponzi schemes, pyramid schemes, or deceptive investment programs;</li>
            <li>Ransomware, malware distribution, hacking services, or trafficking in stolen data or credentials;</li>
            <li>Darknet marketplaces, sale of stolen goods, counterfeit goods, or goods that infringe intellectual property rights;</li>
            <li>Gambling or gaming where unlicensed or prohibited in the relevant jurisdiction, or where Merchant lacks required licenses;</li>
            <li>Weapons, ammunition, explosives, or dual-use goods exported or sold in violation of export control laws;</li>
            <li>Adult content where prohibited by Applicable Law or NodeRails policy, or where age verification and record-keeping requirements are not met;</li>
            <li>Any product or service that primarily facilitates evasion of taxes, sanctions, or lawful financial reporting; and</li>
            <li>Any other category designated as prohibited or restricted in NodeRails compliance documentation or in writing to Merchant.</li>
          </ul>
          <p>
            NodeRails may decline, block, reverse, or report transactions, and may suspend or terminate Merchant access,
            where NodeRails reasonably believes a violation of this Section 6 has occurred or is likely to occur.
          </p>

          <h2>7. Compliance, AML, CFT, and Sanctions</h2>
          <h3>7.1 NodeRails Compliance Program</h3>
          <p>
            NodeRails maintains a risk-based AML/CFT and sanctions compliance program appropriate to its role as a
            payments technology provider. Elements of the program may include merchant and beneficial owner screening,
            sanctions and politically exposed persons list checks, on-chain wallet and address screening, transaction
            monitoring rules, investigation workflows, record retention, and escalation to competent authorities where
            required by Applicable Law.
          </p>

          <h3>7.2 Merchant Cooperation and Independent Responsibility</h3>
          <p>
            Merchant acknowledges that NodeRails compliance tools support but do not replace Merchant&apos;s own legal
            obligations. Merchant remains solely responsible for determining whether Merchant&apos;s business model,
            products, Customers, and jurisdictions are lawful and for implementing any Customer due diligence, tax
            reporting, or licensing required of Merchant independently of the Services.
          </p>
          <p>Merchant agrees that NodeRails and Banking Partners may:</p>
          <ul>
            <li>Delay, decline, or cancel Charges or Settlements pending review;</li>
            <li>Request additional information about Merchant, Customers, or specific transactions;</li>
            <li>Share Merchant information with Banking Partners, screening vendors, auditors, and governmental authorities as permitted or required by Applicable Law and as described in the Privacy Policy;</li>
            <li>File suspicious activity reports or other regulatory filings without notice to Merchant where prohibited by law from doing so; and</li>
            <li>Terminate or restrict the Services where required by a regulator, Banking Partner, or sanctions authority.</li>
          </ul>

          <h3>7.3 Sanctions Representations</h3>
          <p>
            Merchant represents that neither Merchant nor any beneficial owner, director, or control person of Merchant
            is a sanctioned person, and that Merchant will not accept payments from or on behalf of sanctioned persons
            or from jurisdictions subject to comprehensive sanctions, except as authorized by Applicable Law under a
            valid license.
          </p>

          <h2>8. Payment Processing, Capture, Escrow, and Settlement</h2>
          <h3>8.1 Payment Flows</h3>
          <p>
            When a Customer initiates a Charge, the Services may authorize and capture funds on-chain through escrow
            smart contracts or equivalent program logic, or through other supported payment mechanics. Capture may
            require Customer wallet authorization, permit signatures, subscription wallet rules, or native asset
            transfers depending on Network and token type. Merchant acknowledges that blockchain transactions are
            generally irreversible once confirmed, subject to dispute, refund, and settlement rules implemented in the
            Platform and on-chain programs.
          </p>

          <h3>8.2 Escrow, Dispute Windows, and Timelocks</h3>
          <p>
            Captured funds may be held in escrow for a dispute window and settlement timelock period disclosed in
            Merchant&apos;s plan or dashboard. During the dispute window, Customers may raise Disputes through
            NodeRails customer dispute flows where enabled. Merchant must respond to Disputes with supporting evidence
            within the time limits shown in the dashboard. Failure to respond may result in automatic resolution in
            favor of the Customer where permitted by platform rules and Applicable Law.
          </p>

          <h3>8.3 On-Chain Settlement</h3>
          <p>
            Following expiration of applicable timelocks and resolution of open Disputes, net proceeds will be released
            to Merchant&apos;s designated on-chain Settlement Account, minus Fees, reserves, chargebacks, refunds, and
            other offsets permitted under this Agreement. Settlement timing depends on Network congestion, protocol
            rules, and completion of compliance review. NodeRails does not guarantee a fixed on-chain confirmation time.
          </p>

          <h3>8.4 Fiat Settlement and Virtual Accounts</h3>
          <p>
            Where Merchant enables fiat Settlement, conversion from Digital Assets to fiat and transfer to Merchant&apos;s
            bank account will be performed by a Banking Partner. Virtual Accounts, where offered, are provided solely as
            a mechanism for Banking Partners to identify and credit Settlement proceeds to Merchant. Virtual Accounts
            are not used for Customer payment collection in standard merchant checkout flows unless expressly described
            in feature documentation for a specific product. NodeRails does not operate Virtual Accounts as bank
            accounts and does not accept fiat deposits on behalf of Merchant except through Banking Partner arrangements
            subject to separate partner terms.
          </p>
          <p>
            Fiat Settlement may be subject to Banking Partner cut-off times, banking holidays, FX spreads, wire fees,
            minimum transfer thresholds, and additional KYB requirements. Merchant is responsible for providing accurate
            bank details and for any rejections caused by incorrect or incomplete instructions.
          </p>

          <h3>8.5 Erroneous Settlement and Recovery</h3>
          <p>
            If NodeRails or a Banking Partner credits Merchant with amounts that were not owed (including duplicate
            credits, processing errors, or amounts later determined to be fraudulent or subject to reversal), Merchant
            authorizes NodeRails to debit Merchant&apos;s pending or future Settlements or to invoice Merchant for
            direct reimbursement. Merchant will cooperate in returning erroneous funds within five (5) business days of
            written notice where practicable.
          </p>

          <h2>9. Subscriptions and Recurring Billing</h2>
          <p>
            Where Merchant uses subscription or recurring billing features, Merchant is responsible for: (a) obtaining
            all legally required consents from Customers for recurring charges, including clear disclosure of amount,
            frequency, and cancellation method; (b) honoring cancellation requests promptly; and (c) ensuring that
            renewal amounts comply with Applicable Law and the authorization limits applicable on the relevant Network
            (for example, on-chain subscription wallet budgets and per-charge caps on Sui). NodeRails may attempt
            automated renewal captures where authorized by Customer and supported by the platform; failed renewals may
            be reported in the dashboard. Merchant remains liable for disputes and refunds arising from subscription
            billing practices.
          </p>

          <h2>10. Fees, Billing, and Taxes</h2>
          <h3>10.1 Platform Fees</h3>
          <p>
            Merchant agrees to pay Fees as set forth in the applicable pricing plan, order form, or dashboard. Unless
            otherwise stated, platform Fees include blockchain network execution costs for supported payment flows
            orchestrated by NodeRails (such as sponsored or platform-submitted transactions on certain Networks).
            Separate network fees paid directly by Customers from their wallets are not NodeRails Fees.
          </p>

          <h3>10.2 Banking and Third-Party Charges</h3>
          <p>
            Fees charged by Banking Partners for fiat conversion, wires, Virtual Accounts, or FX are disclosed when
            Merchant enables the relevant feature or in Banking Partner documentation. Merchant is responsible for those
            third-party charges unless expressly included in a custom enterprise quote.
          </p>

          <h3>10.3 Fee Changes</h3>
          <p>
            NodeRails may change standard Fees upon at least thirty (30) days&apos; notice to Merchant via dashboard or
            email, unless a shorter period is required by law or a Banking Partner. Continued use of the Services after
            the effective date of a fee change constitutes acceptance. Custom enterprise pricing is governed by the
            applicable order form.
          </p>

          <h3>10.4 Taxes</h3>
          <p>
            Fees are exclusive of taxes unless stated otherwise. Merchant is solely responsible for determining,
            collecting, reporting, and remitting all taxes associated with Merchant&apos;s sales (including VAT, GST,
            sales tax, and digital services taxes). Merchant will provide valid tax identification numbers and
            documentation reasonably requested by NodeRails or Banking Partners.
          </p>

          <h2>11. Refunds, Disputes, Chargebacks, and Offsets</h2>
          <ul>
            <li>Merchant must maintain a clear, accessible refund and cancellation policy and honor it consistently;</li>
            <li>Merchant authorizes NodeRails to process refunds and dispute outcomes through on-chain refund mechanisms or other supported flows where Merchant initiates or accepts a refund, or where a Dispute is resolved against Merchant;</li>
            <li>Amounts owed by Merchant due to refunds, Disputes, chargebacks, fines, or penalties may be deducted from pending or future Settlements without prior notice to the extent permitted by Applicable Law;</li>
            <li>Merchant remains liable for negative balances if Settlements are insufficient to cover amounts owed; and</li>
            <li>Elevated dispute rates, refund rates, or fraud indicators may trigger reserves, delayed Settlement, enhanced monitoring, or termination under Section 14.</li>
          </ul>

          <h2>12. Reserves and Settlement Holds</h2>
          <p>
            To manage credit, fraud, and compliance risk, NodeRails or a Banking Partner may establish a Reserve or
            place a hold on Settlement proceeds. Circumstances that may trigger a Reserve include, without limitation:
            elevated chargeback or dispute ratios; unusual transaction patterns; new Merchant accounts with limited
            processing history; regulatory inquiry; Banking Partner requirement; or suspected breach of this Agreement.
            NodeRails will communicate Reserve terms through the dashboard where permitted by law. Reserves will be
            reviewed periodically and released when underlying risk factors have been addressed, subject to offsets for
            amounts Merchant owes.
          </p>

          <h2>13. Data Protection, Security, and Records</h2>
          <h3>13.1 Privacy</h3>
          <p>
            Each party will comply with Applicable Law governing personal data. NodeRails processing of personal data
            is described in the <Link href="/privacy">Privacy Policy</Link>. Merchant must provide appropriate notices
            to Customers and obtain required consents for personal data Merchant submits to the Services.
          </p>

          <h3>13.2 Security</h3>
          <p>
            NodeRails implements technical and organizational measures designed to protect the Platform and Transaction
            Data. Merchant is responsible for securing its systems, integrations, and wallets. Neither party guarantees
            absolute security of internet-connected systems.
          </p>

          <h3>13.3 Records and Audit</h3>
          <p>
            NodeRails will maintain Transaction Data and compliance records in accordance with its retention policies
            and Applicable Law. Merchant will maintain complete and accurate books and records relating to transactions
            processed through the Services for at least five (5) years or longer if required by Applicable Law. Upon
            reasonable notice, Merchant will provide NodeRails or Banking Partners with information necessary to respond
            to regulatory inquiries, Disputes, or audits related to Merchant&apos;s use of the Services.
          </p>

          <h2>14. Suspension, Termination, and Effect of Termination</h2>
          <h3>14.1 Term</h3>
          <p>
            This Agreement begins on the date of electronic acceptance and continues until terminated as provided herein.
          </p>

          <h3>14.2 Termination by Merchant</h3>
          <p>
            Merchant may terminate this Agreement at any time by closing its account and ceasing use of the Services,
            subject to completion of pending Settlements, Disputes, and payment of outstanding Fees.
          </p>

          <h3>14.3 Suspension and Termination by NodeRails</h3>
          <p>
            NodeRails may suspend or terminate Merchant&apos;s access to all or part of the Services immediately if:
            (a) required by Applicable Law, regulator, or Banking Partner; (b) Merchant breaches this Agreement; (c)
            NodeRails reasonably suspects fraud, sanctions evasion, or prohibited activity; or (d) continued provision
            poses material security or reputational risk. Where practicable, NodeRails will provide notice and an
            opportunity to cure material breaches, except in cases requiring immediate action.
          </p>

          <h3>14.4 Effect of Termination</h3>
          <p>
            Upon termination, Merchant&apos;s license to use the Services ends. NodeRails will pay Merchant any net
            amounts due for completed Settlements, subject to reserves, offsets, open Disputes, chargebacks, and Applicable
            Law. Sections that by their nature should survive (including definitions, fees owed, confidentiality,
            indemnification, limitation of liability, dispute resolution, and governing law) survive termination.
          </p>

          <h2>15. Representations and Warranties</h2>
          <p>Merchant represents and warrants to NodeRails on the effective date and continuously thereafter that:</p>
          <ul>
            <li>Merchant has full power and authority to enter into and perform this Agreement;</li>
            <li>All information provided to NodeRails is true, accurate, complete, and not misleading;</li>
            <li>Merchant&apos;s use of the Services and each Charge processed complies with this Agreement and Applicable Law;</li>
            <li>Merchant owns or has all necessary rights in Merchant Data and content displayed through the Services;</li>
            <li>Merchant is not subject to sanctions and will not process transactions for sanctioned persons or prohibited jurisdictions; and</li>
            <li>Proceeds of transactions processed through the Services are not derived from unlawful activity.</li>
          </ul>

          <h2>16. Disclaimers</h2>
          <p>
            EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE.&rdquo; TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NODERAILS DISCLAIMS ALL WARRANTIES,
            WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. NODERAILS DOES NOT WARRANT THAT THE SERVICES WILL BE
            UNINTERRUPTED, ERROR-FREE, OR FREE OF MALICIOUS CODE, OR THAT BLOCKCHAIN NETWORKS, BANKING PARTNERS, OR
            THIRD-PARTY SERVICES WILL OPERATE WITHOUT FAILURE. NODERAILS IS NOT RESPONSIBLE FOR DIGITAL ASSET PRICE
            VOLATILITY, FORK EVENTS, SMART CONTRACT VULNERABILITIES OUTSIDE NODERAILS&apos; REASONABLE CONTROL, OR
            ACTIONS OF MINERS, VALIDATORS, OR NETWORK PARTICIPANTS.
          </p>

          <h2>17. Indemnification</h2>
          <p>
            Merchant will defend, indemnify, and hold harmless NodeRails, its affiliates, and their respective officers,
            directors, employees, contractors, and agents from and against any third-party claims, demands, actions,
            losses, damages, fines, penalties, and reasonable attorneys&apos; fees arising out of or relating to: (a)
            Merchant&apos;s breach of this Agreement; (b) Merchant&apos;s products, services, marketing, or Customer
            relationships; (c) Merchant&apos;s violation of Applicable Law; (d) Merchant Data or content provided by
            Merchant; (e) disputes, refunds, or reversals attributable to Merchant&apos;s transactions; or (f) gross
            negligence or willful misconduct by Merchant. NodeRails may assume control of the defense of any indemnified
            claim at Merchant&apos;s expense, and Merchant will cooperate fully.
          </p>

          <h2>18. Limitation of Liability</h2>
          <p>
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW: (A) NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOSS OF PROFITS, REVENUE, DATA,
            GOODWILL, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE
            POSSIBILITY OF SUCH DAMAGES; AND (B) NODERAILS&apos; TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO
            THIS AGREEMENT WILL NOT EXCEED THE GREATER OF (I) THE TOTAL PLATFORM FEES PAID BY MERCHANT TO NODERAILS IN
            THE SIX (6) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (II) ONE HUNDRED U.S. DOLLARS (US$100).
            THE LIMITATIONS IN THIS SECTION APPLY REGARDLESS OF THE THEORY OF LIABILITY AND EVEN IF ANY REMEDY FAILS OF
            ITS ESSENTIAL PURPOSE. NOTHING IN THIS AGREEMENT EXCLUDES OR LIMITS LIABILITY THAT CANNOT BE EXCLUDED OR
            LIMITED UNDER APPLICABLE LAW.
          </p>

          <h2>19. Confidentiality</h2>
          <p>
            Each party (the &ldquo;Receiving Party&rdquo;) will use the other party&apos;s Confidential Information only
            to perform under this Agreement and will protect it using at least the same degree of care the Receiving
            Party uses for its own confidential information, but no less than reasonable care. The Receiving Party may
            disclose Confidential Information to employees, contractors, and professional advisors with a need to know
            and who are bound by confidentiality obligations, and as required by Applicable Law or court order (with
            notice to the disclosing party where legally permitted). Confidential Information does not include
            information that is publicly available without breach, independently developed, or rightfully received from a
            third party without restriction.
          </p>

          <h2>20. Intellectual Property</h2>
          <p>
            NodeRails and its licensors retain all right, title, and interest in the Platform, Services, documentation,
            APIs, SDKs, trademarks, and all related intellectual property. Subject to this Agreement, NodeRails grants
            Merchant a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use
            the Services for Merchant&apos;s internal business purposes during the term. Merchant grants NodeRails a
            non-exclusive license to use Merchant&apos;s name, logos, and product descriptions as necessary to operate
            the Services (including on checkout pages, receipts, and customer communications) and, with Merchant&apos;s
            prior consent, in marketing materials.
          </p>

          <h2>21. Changes to This Agreement</h2>
          <p>
            NodeRails may amend this Agreement from time to time. Material changes will be notified through the dashboard,
            by email to the address associated with Merchant&apos;s account, or by posting an updated version at{' '}
            <Link href="/msa">example.local/msa</Link> with a revised effective date. Changes become effective on the
            stated effective date unless Applicable Law requires a different notice period. Merchant&apos;s continued use
            of the Services after the effective date constitutes acceptance of the amended Agreement. If Merchant does
            not agree to an amendment, Merchant must stop using the Services and close its account before the effective
            date.
          </p>

          <h2>22. General Provisions</h2>
          <ul>
            <li>
              <strong>Independent contractors.</strong> The parties are independent contractors. Nothing in this Agreement
              creates a partnership, joint venture, agency, fiduciary, or employment relationship.
            </li>
            <li>
              <strong>Assignment.</strong> Merchant may not assign or transfer this Agreement, in whole or in part,
              without NodeRails&apos; prior written consent. NodeRails may assign this Agreement to an affiliate or in
              connection with a merger, acquisition, corporate reorganization, or sale of assets upon notice to
              Merchant.
            </li>
            <li>
              <strong>Notices.</strong> NodeRails may provide operational and legal notices through the dashboard, email,
              or the contact details on Merchant&apos;s account. Legal notices to NodeRails must be sent to{' '}
              <a href="mailto:business@example.com">business@example.com</a> with a copy to any address specified in
              Merchant&apos;s enterprise order form, if applicable.
            </li>
            <li>
              <strong>Force majeure.</strong> Neither party is liable for delay or failure to perform due to events
              beyond its reasonable control, including acts of God, war, terrorism, labor disputes, government actions,
              internet or telecommunications failures, blockchain network outages, consensus failures, or Banking Partner
              disruptions, provided the affected party uses reasonable efforts to mitigate impact.
            </li>
            <li>
              <strong>Severability.</strong> If any provision is held invalid or unenforceable, the remaining provisions
              remain in full force, and the invalid provision will be modified to the minimum extent necessary to make it
              enforceable.
            </li>
            <li>
              <strong>No waiver.</strong> Failure to enforce any provision is not a waiver of future enforcement. Any
              waiver must be in writing signed by the waiving party.
            </li>
            <li>
              <strong>Entire agreement.</strong> This Agreement, together with incorporated documents, constitutes the
              entire agreement between the parties regarding the Services and supersedes all prior negotiations and
              agreements, whether oral or written, relating to the same subject matter.
            </li>
            <li>
              <strong>Third-party beneficiaries.</strong> Banking Partners may be intended third-party beneficiaries of
              provisions necessary to enable fiat Settlement, to the extent required by their agreements with NodeRails.
            </li>
          </ul>

          <h2>23. Governing Law and Dispute Resolution</h2>
          <p>
            This Agreement is governed by the laws specified in Merchant&apos;s signed order form. If no governing law is
            specified, this Agreement is governed by the laws of the jurisdiction of NodeRails&apos; principal place of
            business, without regard to conflict-of-law principles that would require application of another
            jurisdiction&apos;s laws. The parties will attempt in good faith to resolve any dispute arising out of this
            Agreement through informal negotiation for at least thirty (30) days after one party delivers written notice
            of the dispute to the other. If the dispute is not resolved, it will be submitted to the exclusive
            jurisdiction of the courts located in that governing jurisdiction, unless the parties&apos; order form or
            plan documentation specifies binding arbitration. Nothing in this Section prevents either party from seeking
            injunctive or equitable relief in any court of competent jurisdiction to protect intellectual property or
            confidential information.
          </p>

          <h2>24. Contact</h2>
          <p>
            For questions regarding this Agreement, merchant onboarding, or compliance matters, contact NodeRails at{' '}
            <a href="mailto:business@example.com">business@example.com</a>.
          </p>

          <hr />

          <p className="text-sm text-slate-500">
            <strong>Electronic acceptance.</strong> This Agreement is presented to merchants during account registration
            and is accepted by click-to-accept affirmation. NodeRails retains a record of the version accepted and the
            timestamp of acceptance associated with your merchant account. This document is provided for transparency
            and compliance review. It does not constitute legal advice. Consult qualified counsel regarding your specific
            obligations.
          </p>

          <p className="mt-6 text-sm">
            Related documents: <Link href="/terms">Terms and Conditions</Link>,{' '}
            <Link href="/privacy">Privacy Policy</Link>,{' '}
            <Link href="/compliance">AML / CFT Policy</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
