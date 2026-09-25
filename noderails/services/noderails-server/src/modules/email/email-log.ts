import { createLogger } from '@noderails/service-base';

/** Shared logger for campaign, payout-receipt, and people-directory mail. */
export const emailLog = createLogger('email');
