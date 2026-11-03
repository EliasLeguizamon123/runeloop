export type AssetChunk = { assetId: string; index: number; total: number; data: string }

export function chunkAsset(assetId: string, data: string, chunkSize = 65536): AssetChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Chunk inválido')
  const total = Math.ceil(data.length / chunkSize)
  return Array.from({ length: total }, (_, index) => ({ assetId, index, total, data: data.slice(index * chunkSize, (index + 1) * chunkSize) }))
}

export function assembleAsset(chunks: AssetChunk[], expectedLength: number): string {
  if (!chunks.length) throw new Error('Transferencia incompleta')
  const [first] = chunks
  if (chunks.length !== first.total || new Set(chunks.map(c => c.index)).size !== first.total || chunks.some(c => c.assetId !== first.assetId || c.total !== first.total || c.index < 0 || c.index >= first.total)) throw new Error('Transferencia incompleta')
  const data = [...chunks].sort((a, b) => a.index - b.index).map(c => c.data).join('')
  if (data.length !== expectedLength) throw new Error('Tamaño incorrecto')
  return data
}
