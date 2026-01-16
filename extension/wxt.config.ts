import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Shopii - AI Shopping Assistant',
    description: 'Find products people actually love. AI-powered ratings from real user opinions.',
    version: '0.1.0',
    permissions: [
      'sidePanel',
      'storage',
      'activeTab',
      'tabs',
      'identity',
    ],
    host_permissions: [
      'https://api.shopii.com/*',
      'https://*.amazon.com/*',
      'https://*.bestbuy.com/*',
      'https://*.walmart.com/*',
      'https://*.target.com/*',
    ],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open Shopii',
    },
    icons: {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
      '48': 'icon/48.png',
      '128': 'icon/128.png',
    },
  },
});
