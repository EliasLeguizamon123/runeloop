export type Point = { x: number; y: number }
export type Asset = { id: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
export type MapState = Point & { assetId: string; width: number; height: number }
export type DrawingStroke = { id: string; points: Point[]; color: string; width: number }
export type BoardImage = Point & { id: string; assetId: string; width: number; height: number }
export type PlayerToken = Point & { id: string; name: string; assetId?: string }
export type MonsterToken = Point & { id: string; name: string; assetId?: string }
export type GameState = {
  version: 2
  metadata: { name?: string }
  board: { map: MapState | null; drawings: DrawingStroke[]; images: BoardImage[] }
  players: PlayerToken[]
  monsters: MonsterToken[]
  assets: Asset[]
}
export type ViewportState = { zoom: number; panX: number; panY: number }
export type DiceRoll = { id: string; name: string; die: 4 | 6 | 8 | 10 | 12 | 20 | 100; values: number[] }
export type SessionState = { diceHistory: DiceRoll[]; pings: (Point & { id: string; name: string })[]; pointers: (Point & { clientId: string; name: string })[] }

export type GameAction =
  | { type: 'player:created'; token: PlayerToken }
  | { type: 'player:moved'; id: string; x: number; y: number }
  | { type: 'player:image'; id: string; assetId?: string }
  | { type: 'monster:created'; token: MonsterToken }
  | { type: 'monster:moved'; id: string; x: number; y: number }
  | { type: 'monster:deleted'; id: string }
  | { type: 'monster:image'; id: string; assetId?: string }
  | { type: 'map:updated'; map: MapState | null }
  | { type: 'drawing:added'; stroke: DrawingStroke }
  | { type: 'drawing:removed'; id: string }
  | { type: 'board-image:created'; image: BoardImage }
  | { type: 'board-image:moved'; id: string; x: number; y: number }
  | { type: 'board-image:deleted'; id: string }
  | { type: 'asset:added'; asset: Asset }
  | { type: 'asset:deleted'; id: string }
