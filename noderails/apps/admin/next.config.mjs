import { applyNextDevWatchOptions } from '../../scripts/next-dev-watch.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      accounts: false,
      '@metamask/connect-evm': false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@metamask/connect-evm': false,
      porto: false,
      'porto/internal': false,
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    return applyNextDevWatchOptions(config);
  },
};

export default nextConfig;
