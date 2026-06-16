# ai-pathfinding-project - AI Coding Agent Instructions

Canonical instructions for AI coding agents working in this repository. Tool-specific entrypoints symlink to this file where supported:
- `CLAUDE.md`
- `.cursorrules`
- `.github/copilot-instructions.md`

## Project Overview

A web-based interactive game demonstrating pathfinding algorithms (DFS, directional DFS, Dijkstra's, A*) on a 2D grid. Pure TypeScript compiled to ES modules, rendered via HTML5 Canvas with no frameworks or bundlers.

**Live demo:** https://volatilethunk.com/projects/ai-pathfinding-project/index.html

## Build Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript (`tsc`) |
| `npm run publish` | Build + package into `.tar.xz` for deployment |

To test locally: run `npm run build` then open `index.html` in a browser. There is no dev server or watch mode.

**No test runner is configured.** There are no unit or integration tests.

## Architecture

All application logic lives in a single file: `main.ts` (~925 lines). There is no module splitting.

### Key types and classes

- **`Tile`** -- Union type: `"empty" | "wall" | "agent" | "destination" | "enemy" | "navigated"`
- **`Coordinates`** -- Immutable 2D grid position. Methods: `getNeighbours(getDiagonals)`, `difference()`, `withinProximity()`, `move(direction)`. Serialises to `"x,y"` string for use as map keys.
- **`createCoordinatesFromString`** -- Memoised factory that parses `"x,y"` strings back to `Coordinates`.
- **`CanvasGrid`** -- Wraps the Canvas 2D context. Fixed 20px cell size, 30x20 grid (600x400px canvas). Draws tiles by colour via `drawTile()`.
- **`Area`** -- Central game state. Holds a `Map<string, Tile>` of entities, manages movement/collision, and hosts all four pathfinding algorithms as methods.

### Pathfinding algorithms (all methods on `Area`)

1. **`findDepthFirstPath`** -- Recursive DFS with random neighbour ordering.
2. **`findDepthFirstPathDirectionally`** -- DFS with neighbours sorted by Euclidean distance to destination (greedy heuristic).
3. **`findDijkstraPath`** -- Dijkstra's shortest path. Accepts an optional heuristic parameter (defaults to constant 0).
4. **`findAStarPath`** -- Thin wrapper around `findDijkstraPath` with Euclidean distance heuristic.

### Game loop and levels

- `main()` (line ~724) initialises state, binds keyboard/mouse events, and starts the game loop.
- 4 predefined levels defined as ASCII art strings (`#` = wall, `O` = agent, `!` = enemy, `X` = destination).
- Enemies pursue the agent using Dijkstra's when within detection radius of 6 cells.
- WASD to move, P to visualise the selected pathfinding algorithm, click to place/remove tiles.

## Code Patterns

- **Strict TypeScript**: all strict checks enabled, plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`.
- **Immutability**: liberal use of `Object.freeze()` on arrays and objects.
- **Functional style**: pure functions, const bindings, map-based state.
- **`unreachable()` helper**: used for exhaustive switch/match checks.
- **Entity storage**: `Map<string, Tile>` keyed by `Coordinates.toString()` (`"x,y"`).

## Dependencies

- **Runtime:** `tslib` (TypeScript helpers)
- **Dev:** `typescript` (^4.9.5), `prettier` (^2.8.3)

No linter configuration file exists. The GitLab CI pipeline runs an ESLint-based SAST scan.

## CI/CD

GitLab CI (`.gitlab-ci.yml`) runs a SAST security scan using ESLint. No build or test stages in CI.
