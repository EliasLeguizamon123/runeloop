export function validatePlayerName(raw: string): string {
  const name = raw.trim()
  if (name.length < 2 || name.length > 24) throw new Error('Ingresá un nombre de 2 a 24 caracteres.')
  return name
}

export function admitPlayer(active: Record<string, string>, clientId: string, rawName: string): { active: Record<string, string>; reason?: string } {
  let name: string
  try { name = validatePlayerName(rawName) } catch (error) { return { active, reason: (error as Error).message } }
  if (Object.entries(active).some(([id, value]) => id !== clientId && value === name)) return { active, reason: 'Ese nombre ya está en uso.' }
  if (!(clientId in active) && Object.keys(active).length >= 6) return { active, reason: 'La partida está completa.' }
  return { active: { ...active, [clientId]: name } }
}

export function releasePlayer(active: Record<string, string>, clientId: string): Record<string, string> {
  const next = { ...active }
  delete next[clientId]
  return next
}
