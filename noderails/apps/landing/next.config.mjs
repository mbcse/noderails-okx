import { applyNextDevWatchOptions } from '../../scripts/next-dev-watch.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config) => applyNextDevWatchOptions(config),
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'flagcdn.com', pathname: '/**' },
			{ protocol: 'https', hostname: 'cdn.jsdelivr.net', pathname: '/**' },
			{ protocol: 'https', hostname: 'cryptologos.cc', pathname: '/**' },
		],
	},
	async redirects() {
		return [
			{
				source: '/:path*',
				has: [{ type: 'host', value: 'example.local' }],
				destination: 'https://www.example.local/:path*',
				permanent: true,
			},
		];
	},
};

export default nextConfig;
