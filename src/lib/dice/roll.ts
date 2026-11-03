export const DICE = [4, 6, 8, 10, 12, 20, 100] as const
export type Die = typeof DICE[number]

export function rollDice(count: number, die: number, fill: (bytes: Uint8Array) => Uint8Array = bytes => crypto.getRandomValues(bytes)): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 20 || !DICE.includes(die as Die)) throw new Error('Tirada inválida')
  const values: number[] = []
  const limit = Math.floor(256 / die) * die
  while (values.length < count) {
    const bytes = fill(new Uint8Array(count - values.length))
    for (const byte of bytes) {
      if (byte < limit) values.push(byte % die + 1)
      if (values.length === count) break
    }
  }
  return values
}
