import { redis } from "../config/redis.js";
import { logger } from "./logger.js";

/** Log throttle for empty-master repeats. Does not skip funding checks. */
export const FUNDING_COOLDOWN_TTL_SECS = 20 * 60;

export function masterInsufficientKey(projectId: string, chainDbId: string): string {
  return `funding:master-insufficient:${projectId}:${chainDbId}`;
}

export function rpcBrokenKey(chainDbId: string): string {
  return `funding:rpc-broken:${chainDbId}`;
}

async function keyExists(key: string): Promise<boolean> {
  try {
    return (await redis.exists(key)) === 1;
  } catch (err) {
    logger.debug({ err, key }, "Funding cooldown lookup failed — proceeding");
    return false;
  }
}

/** SET NX; returns true when this call created the key (first occurrence). */
async function markKey(key: string): Promise<boolean> {
  try {
    const created = await redis.set(key, "1", "EX", FUNDING_COOLDOWN_TTL_SECS, "NX");
    return created === "OK";
  } catch (err) {
    logger.debug({ err, key }, "Funding cooldown write failed");
    return true;
  }
}

export async function isMasterInsufficient(projectId: string, chainDbId: string): Promise<boolean> {
  return keyExists(masterInsufficientKey(projectId, chainDbId));
}

export async function markMasterInsufficient(projectId: string, chainDbId: string): Promise<boolean> {
  return markKey(masterInsufficientKey(projectId, chainDbId));
}

export async function clearMasterInsufficient(projectId: string, chainDbId: string): Promise<void> {
  try {
    await redis.del(masterInsufficientKey(projectId, chainDbId));
  } catch (err) {
    logger.debug({ err, projectId, chainDbId }, "Funding cooldown clear failed");
  }
}

export async function isRpcBroken(chainDbId: string): Promise<boolean> {
  return keyExists(rpcBrokenKey(chainDbId));
}

export async function markRpcBroken(chainDbId: string): Promise<boolean> {
  return markKey(rpcBrokenKey(chainDbId));
}
