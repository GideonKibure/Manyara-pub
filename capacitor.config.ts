import type { CapacitorConfig } from '@capacitor/cli'

// iOS: on a Mac with Xcode, run `npx cap add ios` then `npm run cap:sync`.
const config: CapacitorConfig = {
  appId: 'com.manyara.pub',
  appName: 'Manyara Pub',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
