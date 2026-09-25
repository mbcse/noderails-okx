import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_ORIGIN}/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  const authorization = req.headers.get('authorization');
  const contentType = req.headers.get('content-type');
  const cookie = req.headers.get('cookie');
  if (authorization) headers.set('authorization', authorization);
  if (contentType) headers.set('content-type', contentType);
  if (cookie) headers.set('cookie', cookie);

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  const upstream = await fetch(target, init);
  const out = new Headers();
  const responseType = upstream.headers.get('content-type');
  if (responseType) out.set('content-type', responseType);
  for (const cookieValue of upstream.headers.getSetCookie()) {
    out.append('set-cookie', cookieValue);
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: out,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
