//
// Utility Functions
//

const { freeze } = Object;

export const emptyObject = freeze(Object.create(null));

export const listKeys = <T, U>(xs: Map<T, U>) => {
  const keys = [];
  for (const key of xs.keys()) {
    keys.push(key);
  }
  return keys;
};

export const getContext = (
  element: HTMLCanvasElement
): CanvasRenderingContext2D => {
  if (element === null) {
    throw new Error("the specified element was not found");
  }

  const context = element.getContext("2d");
  if (context === null) {
    throw new Error("2D context could not be acquired");
  }

  return context;
};

export const definedOr = <T, U>(x: T | undefined, alternative: U) =>
  x === undefined ? alternative : x;

export const identity = <T>(x: T) => x;
export const constant = <T>(x: T) => () => x;

const upKeyCode = 87;
const downKeyCode = 83;
const leftKeyCode = 65;
const rightKeyCode = 68;

enum Direction {
  up,
  down,
  left,
  right
}

export const keyCodes = (() => {
  const codes = new Map<number, Direction>();
  codes.set(upKeyCode, Direction.up);
  codes.set(downKeyCode, Direction.down);
  codes.set(leftKeyCode, Direction.left);
  codes.set(rightKeyCode, Direction.right);
  return codes;
})();

const listenToDirectionalInput = (
  processDirection: (direction: Direction) => void
) => {
  addEventListener("keydown", event => {
    const direction = keyCodes.get(event.keyCode);

    if (direction !== undefined) {
      processDirection(direction);
    }
  });
};

const letterPKeyCode = 80;

const listenToPathfindingRequest = (process: () => void) => {
  addEventListener("keydown", event => {
    if (event.keyCode === letterPKeyCode) {
      process();
    }
  });
};

interface CoordinatesArgs {
  x: number;
  y: number;
}

export class Coordinates {
  readonly x: number;
  readonly y: number;

  constructor({ x, y }: CoordinatesArgs) {
    this.x = x;
    this.y = y;
  }

  toString() {
    return `${this.x},${this.y}`;
  }

  equals(other: Coordinates) {
    return this.x === other.x && this.y === other.y;
  }

  getNeighbours(getDiagonals = false) {
    const { x, y } = this;

    const neighbours = [
      [x, y - 1],
      [x - 1, y],
      [x + 1, y],
      [x, y + 1]
    ];

    if (getDiagonals) {
      [
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x - 1, y + 1],
        [x + 1, y + 1]
      ].forEach(xy => neighbours.push(xy));
    }

    return freeze(
      neighbours.map(
        neighbour =>
          new Coordinates({
            x: neighbour[0],
            y: neighbour[1]
          })
      )
    );
  }

  difference({ x, y }: Coordinates) {
    return new Coordinates({
      x: Math.abs(this.x - x),
      y: Math.abs(this.y - y)
    });
  }

  get magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  withinProximity(radius: number, xy: Coordinates) {
    return this.difference(xy).magnitude <= radius;
  }

  move(direction: Direction) {
    let { x, y } = this;

    switch (direction) {
      case Direction.left:
        --x;
        break;
      case Direction.right:
        ++x;
        break;
      case Direction.up:
        --y;
        break;
      case Direction.down:
        ++y;
        break;
      default:
        throw new Error(`invalid direction: ${direction}`);
    }

    return new Coordinates({ x, y });
  }
}

export const createCoordinatesFromString = (() => {
  const cache = new Map();

  return (s: string) => {
    let result;
    if (cache.has(s)) {
      result = cache.get(s);
    } else {
      const [xString, yString] = s.split(",");
      result = new Coordinates({
        x: Number.parseInt(xString),
        y: Number.parseInt(yString)
      });
      cache.set(s, result);
    }
    return result;
  };
})();

enum Tile {
  empty,
  wall,
  agent,
  destination,
  enemy,
  navigated
}

const createColorGetter = ({
  empty = "black",
  wall = "#ccc",
  agent = "blue",
  destination = "green",
  enemy = "red",
  navigated = "yellow"
}) => {
  const colors = new Map<Tile, string>();
  colors.set(Tile.empty, empty);
  colors.set(Tile.wall, wall);
  colors.set(Tile.agent, agent);
  colors.set(Tile.destination, destination);
  colors.set(Tile.enemy, enemy);
  colors.set(Tile.navigated, navigated);

  return (tile: Tile): string => {
    const color = colors.get(tile);
    if (color === undefined) {
      console.log(colors);
      throw new Error(`tile type ${tile} unknown`);
    }
    return color;
  };
};

const querySelectorOrThrow = (query: string): Element => {
  const element = document.querySelector(query);
  if (element === null) {
    throw new Error(`element "${query}" not found`);
  }
  return element;
};

export class CanvasGrid {
  readonly cellWidth: number;
  readonly cellHeight: number;

  private readonly getColor: (tile: Tile) => string;
  private readonly context: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;

  constructor({
    colors = emptyObject,
    context = getContext(querySelectorOrThrow(".area") as HTMLCanvasElement),
    cellWidth = 20,
    cellHeight = 20,
    width = defaultAreaWidth,
    height = defaultAreaHeight
  }) {
    this.getColor = createColorGetter(colors);
    this.context = context;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.width = width;
    this.height = height;

    this.clear();
  }

  drawTile({ x, y }: Coordinates, tile: Tile) {
    const { context, cellWidth, cellHeight } = this;

    context.fillStyle = this.getColor(tile);
    context.fillRect(cellWidth * x, cellHeight * y, cellWidth, cellHeight);
  }

  clear() {
    const { context, cellWidth, cellHeight, width, height, getColor } = this;

    context.fillStyle = getColor(Tile.empty);
    context.fillRect(0, 0, cellWidth * width, cellHeight * height);
  }
}

interface AreaArgs {
  width?: number;
  height?: number;
  allowDiagonalsInPaths?: false;
  pathfindingAlgorithm?: string;
  canvasGrid?: CanvasGrid;
}

export class Area {
  readonly canvasGrid: CanvasGrid;
  readonly entities: Map<string, Tile>;
  allowDiagonalsInPaths: boolean;
  pathfindingAlgorithm?: string;

  private readonly width: number;
  private readonly height: number;

  constructor({
    width = defaultAreaWidth,
    height = defaultAreaHeight,
    allowDiagonalsInPaths = false,
    pathfindingAlgorithm = "Djikstra's Algorithm",
    canvasGrid: maybeCanvasGrid
  }: AreaArgs) {
    this.width = width;
    this.height = height;
    this.allowDiagonalsInPaths = allowDiagonalsInPaths;
    this.pathfindingAlgorithm = pathfindingAlgorithm;

    this.canvasGrid = definedOr(
      maybeCanvasGrid,
      new CanvasGrid({
        height,
        width
      })
    );

    this.entities = new Map();
  }

  addEntity(xy: Coordinates, entityType: Tile) {
    const key = String(xy);

    if (this.entities.has(key)) {
      throw new Error("an added entity cannot overlap an existing one");
    }

    if (entityType !== Tile.empty) {
      this.entities.set(key, entityType);
    }

    this.canvasGrid.drawTile(xy, entityType);
  }

  deleteEntity(xy: Coordinates) {
    this.entities.delete(String(xy));
    this.canvasGrid.drawTile(xy, Tile.empty);
  }

  areCoordinatesValid(xy: Coordinates) {
    return 0 <= xy.x && xy.x < this.width && 0 <= xy.y && xy.y < this.height;
  }

  isValidAgentPosition(xy: Coordinates) {
    return (
      this.areCoordinatesValid(xy) &&
      this.entities.get(String(xy)) !== Tile.wall
    );
  }

  moveEntity(xy: Coordinates, direction: Direction) {
    const newCoordinates = xy.move(direction);

    let result;
    if (this.isValidAgentPosition(newCoordinates)) {
      const { entities } = this;

      const oldKey = String(xy);
      const key = String(newCoordinates);

      entities.set(String(key), entities.get(oldKey)!);
      entities.delete(oldKey);

      this.canvasGrid.drawTile(xy, Tile.empty);
      this.canvasGrid.drawTile(newCoordinates, entities.get(key)!);

      result = newCoordinates;
    } else {
      result = xy;
    }
    return result;
  }

  addEntitiesFromStrings(strings: string[]) {
    strings.forEach((string, y) => {
      string.split("").forEach((character, x) => {
        const xy = new Coordinates({ x, y });
        const tile = characterTiles.get(character);
        if (tile === undefined) {
          throw new Error("unknown character tile: " + character);
        }
        this.addEntity(xy, tile);
      });
    });
  }

  findDepthFirstPath(
    source: Coordinates,
    destination: Coordinates,
    visitedNodes = new Set<string>(),
    sortNeighbours: (neighbours: Coordinates[]) => Coordinates[] = identity,
    navigated: Coordinates[] = []
  ): Coordinates[] {
    navigated.push(source);

    if (source.equals(destination)) {
      navigated.shift();
      navigated.pop();
      return navigated;
    }

    visitedNodes.add(String(source));

    const neighbours = source.getNeighbours(this.allowDiagonalsInPaths);

    const unvisitedNeighbours = sortNeighbours(
      neighbours.filter(neighbour => {
        return (
          this.isValidAgentPosition(neighbour) &&
          !visitedNodes.has(String(neighbour))
        );
      })
    );

    if (unvisitedNeighbours.length === 0) {
      return [];
    }

    for (const neighbour of unvisitedNeighbours) {
      const path = this.findDepthFirstPath(
        neighbour,
        destination,
        visitedNodes,
        sortNeighbours,
        navigated
      );

      if (path.length !== 0) {
        return path;
      }
    }
    return [];
  }

  findDepthFirstPathDirectionally(
    source: Coordinates,
    destination: Coordinates,
    maybeVisitedNodes: Set<string> = new Set()
  ) {
    return this.findDepthFirstPath(
      source,
      destination,
      maybeVisitedNodes,

      neighbours =>
        neighbours.sort((a, b) => {
          const aDelta = destination.difference(a).magnitude;
          const bDelta = destination.difference(b).magnitude;

          return aDelta < bDelta ? -1 : bDelta < aDelta ? 1 : 0;
        })
    );
  }

  findDijkstraPath(
    source: Coordinates,
    destination: Coordinates,
    getHeuristic: (neighbour: Coordinates) => number = constant(0)
  ) {
    const unvisitedNodes = new Map();
    const distances = new Map();
    const previousDistances = new Map();
    const navigated = [];
    let current: Coordinates;

    const compareDistances = (a: Coordinates, b: Coordinates) => {
      const aKey = String(a);
      const bKey = String(b);

      return distances.get(aKey) < distances.get(bKey)
        ? -1
        : distances.get(bKey) < distances.get(aKey)
        ? 1
        : 0;
    };

    const updateDistance = (neighbour: Coordinates) => {
      const distance =
        distances.get(String(current)) + 1 + getHeuristic(neighbour);

      const neighbourKey = String(neighbour);
      if (distance < distances.get(neighbourKey)) {
        previousDistances.set(neighbourKey, current);
        distances.set(neighbourKey, distance);
      }
    };

    const sourceKey = String(source);
    distances.set(sourceKey, 0);
    unvisitedNodes.set(sourceKey, true);

    for (let y = 0; y < this.height; ++y) {
      for (let x = 0; x < this.width; ++x) {
        const xy = new Coordinates({ x, y });

        if (this.isValidAgentPosition(xy) && !source.equals(xy)) {
          const key = String(xy);
          unvisitedNodes.set(key, true);
          distances.set(key, Infinity);
        }
      }
    }

    while (unvisitedNodes.size !== 0) {
      const sorted = listKeys(unvisitedNodes)
        .sort(compareDistances)
        .map(key => createCoordinatesFromString(key));

      current = sorted[0];
      const currentKey = String(current);

      unvisitedNodes.delete(currentKey);

      if (current.equals(destination)) {
        let previous = previousDistances.get(currentKey);
        let previousKey = String(previous);

        while (previousDistances.has(previousKey)) {
          navigated.push(previous);
          previous = previousDistances.get(previousKey);
          previousKey = String(previous);
        }
        return navigated;
      }

      current.getNeighbours(this.allowDiagonalsInPaths).forEach(updateDistance);
    }

    return [];
  }

  findAStarPath(source: Coordinates, destination: Coordinates) {
    return this.findDijkstraPath(
      source,
      destination,

      neighbour => neighbour.difference(destination).magnitude
    );
  }
}

//
// Utility Data
//

export const enemyDetectionProximity = 6;

export const defaultAreaWidth = 30;
export const defaultAreaHeight = 20;

export const characterTiles = (() => {
  const tiles = new Map<string, Tile>();
  tiles.set("#", Tile.wall);
  tiles.set(" ", Tile.empty);
  tiles.set("O", Tile.agent);
  tiles.set("!", Tile.enemy);
  tiles.set("X", Tile.destination);
  return tiles;
})();

export const levels = [
  {
    layout: [
      "##############################",
      "#                 #     #    #",
      "#                 #     #    #",
      "##########        #     #    #",
      "#               # #     #    #",
      "#  ############## #     #    #",
      "#   #           # #     #    #",
      "#   #           # #     #    #",
      "#   #    ##########     #    #",
      "#   #                   #    #",
      "#   #                        #",
      "#   ##########               #",
      "#   #  #    #    #############",
      "#   #  #    #                #",
      "#      #    #     ############",
      "#      #    #                #",
      "#                   #        #",
      "#  ##########       #        #",
      "#           #       #        #",
      "##############################"
    ],
    agent: new Coordinates({ x: 11, y: 2 }),
    destination: new Coordinates({ x: 25, y: 17 }),
    enemies: [
      new Coordinates({ x: 7, y: 8 }),
      new Coordinates({ x: 27, y: 5 }),
      new Coordinates({ x: 11, y: 18 })
    ]
  },
  {
    layout: [
      "##############################",
      "#                            #",
      "#     ########################",
      "#     #            #         #",
      "#     #            #         #",
      "#     #            #    #    #",
      "#     #            #    #    #",
      "#     #            #    #    #",
      "#     ####         #    #    #",
      "#           #      #    #    #",
      "#           #      #    #    #",
      "#           # ######    #    #",
      "#           #           #    #",
      "#     ####  #           #    #",
      "#     #                 #    #",
      "#     #     ########    #    #",
      "#     #            #    #    #",
      "#     #            #    #    #",
      "#                  #    #    #",
      "##############################"
    ],
    agent: new Coordinates({ x: 2, y: 2 }),
    destination: new Coordinates({ x: 27, y: 17 }),
    enemies: [
      new Coordinates({ x: 2, y: 14 }),
      new Coordinates({ x: 14, y: 9 })
    ]
  },
  {
    layout: [
      "##############################",
      "#   #                 #      #",
      "#   #                 #      #",
      "#   #                 #      #",
      "#   #  ############   #      #",
      "#   #                 #      #",
      "#   #                        #",
      "#         #                  #",
      "#         #       ############",
      "#         #                  #",
      "#         #                  #",
      "#         #                  #",
      "#         #    ############  #",
      "#         #                  #",
      "#                     #      #",
      "#                     #      #",
      "#   ############      #      #",
      "#                     #      #",
      "#                     #      #",
      "##############################"
    ],
    agent: new Coordinates({ x: 2, y: 1 }),
    destination: new Coordinates({ x: 25, y: 17 }),
    enemies: [
      new Coordinates({ x: 2, y: 17 }),
      new Coordinates({ x: 25, y: 5 }),
      new Coordinates({ x: 12, y: 10 })
    ]
  },
  {
    layout: [
      "##############################",
      "#                 #          #",
      "#                 #          #",
      "#    #####        #          #",
      "#                 #          #",
      "#  ################          #",
      "#   #                        #",
      "#   #                        #",
      "#   #########    ########    #",
      "#                       #    #",
      "#                            #",
      "#   ####    ##               #",
      "#   #  #    #    #############",
      "#   #  #    #                #",
      "#      #    #     ##         #",
      "#      #    #     #          #",
      "#      #    #######          #",
      "#      ######                #",
      "#                            #",
      "##############################"
    ],
    agent: new Coordinates({ x: 11, y: 2 }),
    destination: new Coordinates({ x: 25, y: 17 }),
    enemies: [
      new Coordinates({ x: 7, y: 7 }),
      new Coordinates({ x: 27, y: 7 }),
      new Coordinates({ x: 11, y: 18 })
    ]
  }
];

//
// Main Program
//

const main = () => {
  let area: Area;
  let agentPosition: Coordinates;
  let enemyPositions: Coordinates[];
  let destinationPosition: Coordinates;
  let path: Coordinates[] | undefined;
  let currentLevelIndex = -1;
  let level;

  const ensurePathIsCleared = () => {
    if (path !== undefined) {
      path.forEach(xy => area.canvasGrid.drawTile(xy, Tile.empty));
      path = undefined;
    }

    enemyPositions.forEach(position =>
      area.canvasGrid.drawTile(position, Tile.enemy)
    );
  };

  const resetArea = () => {
    const algorithmSelection = querySelectorOrThrow(
      ".pathfinding-algorithm select"
    ) as HTMLInputElement;

    area = new Area({
      pathfindingAlgorithm: algorithmSelection.value
    });

    level = levels[currentLevelIndex];
    agentPosition = level.agent;
    enemyPositions = level.enemies.map(identity);
    destinationPosition = level.destination;

    area.addEntitiesFromStrings(level.layout);
    area.addEntity(agentPosition, Tile.agent);
    area.addEntity(destinationPosition, Tile.destination);

    enemyPositions.forEach(position => area.addEntity(position, Tile.enemy));

    const statusText = document.querySelector(
      ".status"
    ) as HTMLTableCellElement;
    statusText.firstChild!.nodeValue = "Normal";
  };

  const changeLevel = () => {
    ++currentLevelIndex;
    if (levels.length <= currentLevelIndex) {
      currentLevelIndex = 0;
    }

    resetArea();
  };

  const onDestinationArrival = () => {
    alert("Level Complete");
    changeLevel();
  };

  const onDeath = () => {
    alert("You Died");
    resetArea();
  };

  querySelectorOrThrow(".allow-diagonals-in-paths input").addEventListener(
    "click",
    event => {
      const target = event.target as HTMLInputElement;
      area.allowDiagonalsInPaths = target.checked;
    }
  );

  querySelectorOrThrow(".pathfinding-algorithm select").addEventListener(
    "change",
    event => {
      const target = event.target as HTMLInputElement;
      area.pathfindingAlgorithm = target.value;
    }
  );

  const entityUiNames = new Map();
  entityUiNames.set("Wall", "wall");
  entityUiNames.set("Empty", "empty");
  entityUiNames.set("Enemy", "enemy");
  entityUiNames.set("Destination (Move)", "destination");
  entityUiNames.set("Agent (Move)", "agent");

  const entityToSetElement = document.querySelector(
    ".entity-to-set select"
  ) as HTMLInputElement;

  const canvasElement = querySelectorOrThrow(".area") as HTMLCanvasElement;
  canvasElement.addEventListener("mousedown", (event: MouseEvent) => {
    const entityType = entityUiNames.get(entityToSetElement.value);

    const x = Math.floor(event.offsetX / area.canvasGrid.cellWidth);
    const y = Math.floor(event.offsetY / area.canvasGrid.cellHeight);

    const xy = new Coordinates({ x, y });

    area.deleteEntity(xy);
    switch (entityType) {
      case "destination":
        area.deleteEntity(destinationPosition);
        destinationPosition = xy;
        break;
      case "agent":
        area.deleteEntity(agentPosition);
        agentPosition = xy;
        break;
      case "enemy":
        enemyPositions.push(xy);
        break;
    }
    area.addEntity(xy, entityType);
  });

  listenToDirectionalInput(direction => {
    let inPursuit = false;

    ensurePathIsCleared();

    enemyPositions.forEach((position, index) => {
      if (position.equals(agentPosition)) {
        onDeath();
      } else if (
        agentPosition.withinProximity(enemyDetectionProximity, position)
      ) {
        const newPosition = area.findDijkstraPath(agentPosition, position)[0];

        if (newPosition !== undefined) {
          const entity = area.entities.get(newPosition);
          if (entity !== Tile.enemy && entity !== Tile.destination) {
            enemyPositions[index] = newPosition;
            area.deleteEntity(position);
            area.addEntity(newPosition, Tile.enemy);

            inPursuit = true;
          }
        }
      }
    });

    querySelectorOrThrow(".status").firstChild!.nodeValue = inPursuit
      ? "Enemy Pursuing"
      : "Normal";

    agentPosition = area.moveEntity(agentPosition, direction);

    if (agentPosition.equals(destinationPosition)) {
      onDestinationArrival();
    }
  });

  listenToPathfindingRequest(() => {
    ensurePathIsCleared();

    switch (area.pathfindingAlgorithm) {
      case "Random Depth-First":
        path = area.findDepthFirstPath(agentPosition, destinationPosition);
        break;
      case "Directional Depth-First":
        path = area.findDepthFirstPathDirectionally(
          agentPosition,
          destinationPosition
        );
        break;
      case "Djikstra's Algorithm":
        path = area.findDijkstraPath(agentPosition, destinationPosition);
        break;
      case "A*":
        path = area.findAStarPath(agentPosition, destinationPosition);
        break;
      default:
        throw new Error(
          `invalid pathfinding algorithm selected: ${area.pathfindingAlgorithm}`
        );
        break;
    }

    if (path.length === 0) {
      alert("No path was found.");
    } else {
      path.forEach(xy => area.canvasGrid.drawTile(xy, Tile.navigated));
    }
  });

  changeLevel();
};

main();
