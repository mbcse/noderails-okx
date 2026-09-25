import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PROPOSAL_PUBLIC_PATH = join(
  process.cwd(),
  'public/openpayments-interledger/index.html',
);

export async function GET() {
  try {
    const html = await readFile(PROPOSAL_PUBLIC_PATH, 'utf8');

    return new Response(html, {
      headers: {
        'cache-control': 'public, max-age=300',
        'content-type': 'text/html; charset=utf-8',
      },
    });
  } catch {
    return new Response('Open Payments proposal HTML not found.', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }
}
