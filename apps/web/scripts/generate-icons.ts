/**
 * Generate PWA icons from the SVG source.
 *
 * Prerequisites:
 *   npm install sharp --save-dev
 *
 * Usage:
 *   npx tsx scripts/generate-icons.ts
 *
 * This generates all required PNG icons in public/icons/ from the SVG source.
 */

import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

const ICONS_DIR = path.resolve(__dirname, '../public/icons')
const SVG_SOURCE = path.resolve(ICONS_DIR, 'icon.svg')

interface IconConfig {
  name: string
  size: number
  /** Extra padding ratio for maskable icons (safe zone = 80%) */
  maskable?: boolean
}

const ICONS: IconConfig[] = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'scan-shortcut.png', size: 96 },
  { name: 'invoice-shortcut.png', size: 96 },
]

async function generateIcons(): Promise<void> {
  if (!fs.existsSync(SVG_SOURCE)) {
    console.error(`SVG source not found at ${SVG_SOURCE}`)
    process.exit(1)
  }

  const svgBuffer = fs.readFileSync(SVG_SOURCE)

  for (const icon of ICONS) {
    const outputPath = path.join(ICONS_DIR, icon.name)

    if (icon.maskable) {
      // Maskable icons need 10% padding on each side (safe zone is 80% center)
      const innerSize = Math.round(icon.size * 0.8)
      const padding = Math.round(icon.size * 0.1)

      const innerPng = await sharp(svgBuffer)
        .resize(innerSize, innerSize)
        .png()
        .toBuffer()

      await sharp({
        create: {
          width: icon.size,
          height: icon.size,
          channels: 4,
          background: { r: 139, g: 92, b: 246, alpha: 1 }, // violet-500
        },
      })
        .composite([{ input: innerPng, left: padding, top: padding }])
        .png()
        .toFile(outputPath)
    } else {
      await sharp(svgBuffer)
        .resize(icon.size, icon.size)
        .png()
        .toFile(outputPath)
    }

    console.log(`  Generated ${icon.name} (${icon.size}x${icon.size})`)
  }

  console.log('\nAll icons generated successfully.')
}

generateIcons().catch((err) => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})
