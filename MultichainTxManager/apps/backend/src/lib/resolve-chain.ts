import { prisma } from "../config/database.js";
import { NotFoundError } from "./errors.js";

/**
 * Resolve a chainId that is either a DB id (cuid string) or a
 * numeric EVM chain ID (number or numeric string) to the chain's
 * database record id.
 *
 * @param projectId - The project the chain must belong to
 * @param chainId   - CUID string **or** numeric chain ID (e.g. 11155111)
 * @returns The chain's database id (cuid)
 */
export async function resolveChainDbId(
  projectId: string,
  chainId: string | number,
): Promise<string> {
  // Numeric → look up by (projectId, chainId)
  if (typeof chainId === "number" || /^\d+$/.test(chainId)) {
    const numericId = typeof chainId === "number" ? chainId : Number(chainId);
    const chain = await prisma.chain.findUnique({
      where: { projectId_chainId: { projectId, chainId: numericId } },
      select: { id: true },
    });
    if (!chain) throw new NotFoundError(`Chain ${numericId} not configured for this project`);
    return chain.id;
  }
  // Otherwise treat as DB id — verify it belongs to the project
  const chain = await prisma.chain.findFirst({
    where: { id: chainId, projectId },
    select: { id: true },
  });
  if (!chain) throw new NotFoundError(`Chain not found or does not belong to this project`);
  return chain.id;
}
