import type { Asset } from '@/lib/game/types'
import { validateAsset } from './validation'
import { createId } from '@/lib/id'

export async function processImage(file: File, kind: 'map' | 'token'): Promise<{ asset: Asset; width: number; height: number }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Formato inválido. Usá JPG, PNG o WebP.')
  const maxOriginal = (kind === 'map' ? 20 : 4) * 1024 * 1024
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > maxOriginal) throw new Error(`Archivo original demasiado grande. Máximo ${kind === 'map' ? 20 : 4} MB.`)
  const image = await createImageBitmap(file)
  try {
    const maxSide = kind === 'map' ? 2560 : 512
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    canvas.getContext('2d')!.drawImage(image, 0, 0, width, height)
    const prefix = 'data:image/webp;base64,'
    let dataUrl = canvas.toDataURL('image/webp', .82)
    if (!dataUrl.startsWith(prefix)) dataUrl = canvas.toDataURL('image/png')
    const mimeType = dataUrl.startsWith(prefix) ? 'image/webp' : 'image/png'
    const asset = { id: createId(), mimeType, data: dataUrl.split(',')[1] } as Asset
    validateAsset(asset, kind)
    return { asset, width, height }
  } finally { image.close() }
}
