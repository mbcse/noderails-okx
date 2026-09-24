export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'NodeRails BPC Service',
    version: '0.2.0',
    description: 'Multichain balance and price check API',
  },
  servers: [
    { url: 'https://bpc.example.local', description: 'Production' },
    { url: 'http://localhost:8090', description: 'Local development' },
  ],
  paths: {
    '/health': {
      get: { summary: 'Basic health check', responses: { '200': { description: 'OK' } } },
    },
    '/v1/health/details': {
      get: { summary: 'Detailed health (DB, Redis, RPC, price sources)', responses: { '200': { description: 'Health report' } } },
    },
    '/v1/prices': {
      get: {
        summary: 'Unified price lookup by asset',
        description:
          'Pass any supported asset format in the `asset` query param: symbol (ETH), tokenKey (USDC-137), contract-chainId (0x...-1), or registered token UUID.',
        parameters: [
          { name: 'asset', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'currency', in: 'query', schema: { type: 'string', default: 'USD' } },
          { name: 'amountFiat', in: 'query', schema: { type: 'number' } },
          { name: 'tokenAmount', in: 'query', schema: { type: 'number' } },
        ],
        responses: { '200': { description: 'Price result with resolvedVia metadata' } },
      },
    },
    '/v1/balance': {
      get: {
        summary: 'Get balance for address',
        parameters: [
          { name: 'chainId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'address', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'token', in: 'query', schema: { type: 'string' } },
          { name: 'includePrice', in: 'query', schema: { type: 'boolean' } },
          { name: 'currency', in: 'query', schema: { type: 'string', enum: ['USD', 'EUR'] } },
        ],
        responses: { '200': { description: 'Balance result with optional price enrichment' } },
      },
    },
    '/v1/balance/batch': {
      post: {
        summary: 'Batch balance lookup',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array' },
                  includePrice: { type: 'boolean' },
                  currency: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Balance results' } },
      },
    },
    '/v1/prices/{symbol}': {
      get: {
        summary: 'Get price by symbol',
        parameters: [
          { name: 'symbol', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'currency', in: 'query', schema: { type: 'string', default: 'USD' } },
        ],
        responses: { '200': { description: 'Price result' } },
      },
    },
    '/v1/prices/by-contract': {
      get: {
        summary: 'Get price by contract address',
        parameters: [
          { name: 'chainId', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'address', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'currency', in: 'query', schema: { type: 'string', default: 'USD' } },
        ],
        responses: { '200': { description: 'Price result' } },
      },
    },
    '/v1/prices/convert': {
      get: {
        summary: 'Convert between fiat and token amounts',
        responses: { '200': { description: 'Conversion result' } },
      },
    },
    '/v1/prices/batch': {
      post: { summary: 'Batch price lookup', responses: { '200': { description: 'Price results' } } },
    },
  },
};
