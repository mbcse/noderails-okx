import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient } = pkg as any;

const prisma = new PrismaClient();

async function main() {
  const contractId = process.argv[2];
  if (!contractId) {
    console.error('Usage: tsx src/scripts/print-contract-info.ts <contractId>');
    process.exit(1);
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { indexStates: true, eventSubscriptions: true, chain: true },
  });

  if (!contract) {
    console.log('Contract not found:', contractId);
    process.exit(2);
  }

  console.log('Contract:', { id: contract.id, address: contract.address, protocol: contract.protocol, isActive: contract.isActive });
  console.log('Chain:', contract.chain ? { id: contract.chain.id, chainId: contract.chain.chainId, name: contract.chain.name } : null);

  console.log('\nIndexStates:');
  for (const s of contract.indexStates) {
    console.log(' -', { id: s.id, chainId: s.chainId, lastIndexedBlock: s.lastIndexedBlock?.toString(), lastFinalizedBlock: s.lastFinalizedBlock?.toString() });
  }

  console.log('\nEvent Subscriptions:');
  for (const e of contract.eventSubscriptions) {
    console.log(' -', { id: e.id, eventName: e.eventName, isActive: e.isActive });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
