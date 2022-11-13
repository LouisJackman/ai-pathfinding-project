//
// Utility Functions
//

const { freeze } = Object;

export const emptyObject = freeze(Object.create(null));

const unreachable = () => {
  throw new Error("unreachable code unexpectedly reached");
};

export const listKeys = (xs) => {
  const keys = [];
  for (const key of xs.keys()) {
    keys.push(key);
  }
  return keys;
};

export const getContext = (element) => {
  if (element === null) {
    throw new Error("the specified element was not found");
  }

  const context = element.getContext("2d");
  if (context === null) {
    throw new Error("2D context could not be acquired");
  }

  return context;
};

export const definedOr = (x, alternative) =>
  x === undefined ? alternative : x;

export const identity = (x) => x;
export const constant = (x) => () => x;

const directions = "up down left right".split(" ").reduce((o, d) => {
  o[d] = Symbol(d);
  return o;
}, Object.create(null));

export const keyCodes = freeze({
  w: directions.up,
  s: directions.down,
  a: directions.left,
  d: directions.right,
});

const listenToDirectionalInput = (processDirection) => {
  addEventListener("keydown", (event) => {
    const direction = keyCodes[event.key];

    if (direction !== undefined) {
      processDirection(direction);
    }
  });
};

const listenToPathfindingRequest = (process) => {
  addEventListener("keydown", (event) => {
    if (event.key === "p") {
      process();
    }
  });
};

export class Coordinates {
  constructor({ x, y }) {
    this.x = x;
    this.y = y;
  }

  toString() {
    return `${this.x},${this.y}`;
  }

  equals(other) {
    return this.x === other.x && this.y === other.y;
  }

  getNeighbours(getDiagonals = false) {
    const { x, y } = this;

    const neighbours = [
      [x, y - 1],
      [x - 1, y],
      [x + 1, y],
      [x, y + 1],
    ];

    if (getDiagonals) {
      const diagonals = freeze([
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x - 1, y + 1],
        [x + 1, y + 1],
      ]);
      for (const xy of diagonals) {
        neighbours.push(xy);
      }
    }

    return freeze(
      neighbours.map(
        (neighbour) =>
          new Coordinates({
            x: neighbour[0],
            y: neighbour[1],
          })
      )
    );
  }

  difference({ x, y }) {
    return new Coordinates({
      x: Math.abs(this.x - x),
      y: Math.abs(this.y - y),
    });
  }

  get magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  withinProximity(radius, xy) {
    return this.difference(xy).magnitude <= radius;
  }

  move(direction) {
    let { x, y } = this;

    switch (direction) {
      case directions.left:
        --x;
        break;
      case directions.right:
        ++x;
        break;
      case directions.up:
        --y;
        break;
      case directions.down:
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

  return (s) => {
    let result;
    if (cache.has(s)) {
      result = cache.get(s);
    } else {
      const [xString, yString] = s.split(",");
      if (xString == undefined || yString === undefined) {
        unreachable();
      }

      result = new Coordinates({
        x: Number.parseInt(xString),
        y: Number.parseInt(yString),
      });
      cache.set(s, result);
    }
    return result;
  };
})();

const tiles = "empty wall agent destination enemy navigated"
  .split(" ")
  .reduce((o, d) => {
    o[d] = Symbol(d);
    return o;
  }, Object.create(null));

const createColorGetter = ({
  empty = "black",
  wall = "#ccc",
  agent = "blue",
  destination = "green",
  enemy = "red",
  navigated = "yellow",
}) => {
  const colors = freeze({
    [tiles.empty]: empty,
    [tiles.wall]: wall,
    [tiles.agent]: agent,
    [tiles.destination]: destination,
    [tiles.enemy]: enemy,
    [tiles.navigated]: navigated,
  });

  return (tile) => {
    const color = colors[tile];
    if (color === undefined) {
      throw new Error(`tile type ${tile} unknown`);
    }
    return color;
  };
};

const querySelectorOrThrow = (query) => {
  const element = document.querySelector(query);
  if (element === null) {
    throw new Error(`element "${query}" not found`);
  }
  return element;
};

export class CanvasGrid {
  #getColor;
  #context;
  #width;
  #height;

  constructor({
    colors = emptyObject,
    context = getContext(querySelectorOrThrow(".area")),
    cellWidth = 20,
    cellHeight = 20,
    width = defaultAreaDimensions.width,
    height = defaultAreaDimensions["height"],
  }) {
    this.#getColor = createColorGetter(colors);
    this.#context = context;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.#width = width;
    this.#height = height;

    this.clear();
  }

  drawTile({ x, y }, tile) {
    const { cellWidth, cellHeight } = this;

    this.#context.fillStyle = this.#getColor(tile);
    this.#context.fillRect(
      cellWidth * x,
      cellHeight * y,
      cellWidth,
      cellHeight
    );
  }

  clear() {
    const { cellWidth, cellHeight } = this;

    this.#context.fillStyle = this.#getColor(tiles.empty);
    this.#context.fillRect(
      0,
      0,
      cellWidth * this.#width,
      cellHeight * this.#height
    );
  }
}

export class Area {
  #width;
  #height;

  constructor({
    width = defaultAreaDimensions.width,
    height = defaultAreaDimensions.height,
    allowDiagonalsInPaths = false,
    pathfindingAlgorithm = "Djikstra's Algorithm",
    canvasGrid: maybeCanvasGrid,
  }) {
    this.#width = width;
    this.#height = height;
    this.allowDiagonalsInPaths = allowDiagonalsInPaths;
    this.pathfindingAlgorithm = pathfindingAlgorithm;

    this.canvasGrid = definedOr(
      maybeCanvasGrid,
      new CanvasGrid({
        height,
        width,
      })
    );

    this.entities = new Map();
  }

  addEntity(xy, entityType) {
    const key = String(xy);

    if (this.entities.has(key)) {
      throw new Error("an added entity cannot overlap an existing one");
    }

    if (entityType !== tiles.empty) {
      this.entities.set(key, entityType);
    }

    this.canvasGrid.drawTile(xy, entityType);
  }

  deleteEntity(xy) {
    this.entities.delete(String(xy));
    this.canvasGrid.drawTile(xy, tiles.empty);
  }

  areCoordinatesValid(xy) {
    return 0 <= xy.x && xy.x < this.#width && 0 <= xy.y && xy.y < this.#height;
  }

  isValidAgentPosition(xy) {
    return (
      this.areCoordinatesValid(xy) &&
      this.entities.get(String(xy)) !== tiles.wall
    );
  }

  moveEntity(xy, direction) {
    const newCoordinates = xy.move(direction);

    let result;
    if (this.isValidAgentPosition(newCoordinates)) {
      const { entities } = this;

      const oldKey = String(xy);
      const key = String(newCoordinates);

      entities.set(String(key), entities.get(oldKey));
      entities.delete(oldKey);

      this.canvasGrid.drawTile(xy, tiles.empty);
      this.canvasGrid.drawTile(newCoordinates, entities.get(key));

      result = newCoordinates;
    } else {
      result = xy;
    }
    return result;
  }

  addEntitiesFromStrings(strings) {
    strings.forEach((string, y) => {
      string.split("").forEach((character, x) => {
        const xy = new Coordinates({ x, y });
        const tile = characterTiles[character];
        if (tile === undefined) {
          throw new Error("unknown character tile: " + character);
        }
        this.addEntity(xy, tile);
      });
    });
  }

  findDepthFirstPath(
    source,
    destination,
    visitedNodes = new Set(),
    sortNeighbours = identity,
    navigated = []
  ) {
    navigated.push(source);

    if (source.equals(destination)) {
      navigated.shift();
      navigated.pop();
      return navigated;
    }

    visitedNodes.add(String(source));

    const neighbours = source.getNeighbours(this.allowDiagonalsInPaths);

    const unvisitedNeighbours = sortNeighbours(
      neighbours.filter((neighbour) => {
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
    source,
    destination,
    maybeVisitedNodes = new Set()
  ) {
    return this.findDepthFirstPath(
      source,
      destination,
      maybeVisitedNodes,

      (neighbours) =>
        neighbours.sort((a, b) => {
          const aDelta = destination.difference(a).magnitude;
          const bDelta = destination.difference(b).magnitude;

          return aDelta < bDelta ? -1 : bDelta < aDelta ? 1 : 0;
        })
    );
  }

  findDijkstraPath(source, destination, getHeuristic = constant(0)) {
    const unvisitedNodes = new Map();
    const distances = new Map();
    const previousDistances = new Map();
    const navigated = [];
    let current;

    const compareDistances = (a, b) => {
      const aKey = String(a);
      const bKey = String(b);

      return distances.get(aKey) < distances.get(bKey)
        ? -1
        : distances.get(bKey) < distances.get(aKey)
        ? 1
        : 0;
    };

    const updateDistance = (neighbour) => {
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

    for (let y = 0; y < this.#height; ++y) {
      for (let x = 0; x < this.#width; ++x) {
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
        .map((key) => createCoordinatesFromString(key));

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

      for (const neighbour of current.getNeighbours(
        this.allowDiagonalsInPaths
      )) {
        updateDistance(neighbour);
      }
    }

    return [];
  }

  findAStarPath(source, destination) {
    return this.findDijkstraPath(
      source,
      destination,

      (neighbour) => neighbour.difference(destination).magnitude
    );
  }
}

//
// Utility Data
//

export const enemyDetectionProximity = 6;

const defaultAreaDimensions = freeze({
  width: 30,
  height: 20,
});

export const characterTiles = freeze({
  ["#"]: tiles.wall,
  [" "]: tiles.empty,
  ["O"]: tiles.agent,
  ["!"]: tiles.enemy,
  ["X"]: tiles.destination,
});

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
      "##############################",
    ],
    agent: new Coordinates({ x: 11, y: 2 }),
    destination: new Coordinates({ x: 25, y: 17 }),
    enemies: [
      new Coordinates({ x: 7, y: 8 }),
      new Coordinates({ x: 27, y: 5 }),
      new Coordinates({ x: 11, y: 18 }),
    ],
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
      "##############################",
    ],
    agent: new Coordinates({ x: 2, y: 2 }),
    destination: new Coordinates({ x: 27, y: 17 }),
    enemies: [
      new Coordinates({ x: 2, y: 14 }),
      new Coordinates({ x: 14, y: 9 }),
    ],
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
      "##############################",
    ],
    agent: new Coordinates({ x: 2, y: 1 }),
    destination: new Coordinates({ x: 25, y: 17 }),
    enemies: [
      new Coordinates({ x: 2, y: 17 }),
      new Coordinates({ x: 25, y: 5 }),
      new Coordinates({ x: 12, y: 10 }),
    ],
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
      "##############################",
    ],
    agent: new Coordinates({ x: 11, y: 2 }),
    destination: new Coordinates({ x: 25, y: 17 }),
    enemies: [
      new Coordinates({ x: 7, y: 7 }),
      new Coordinates({ x: 27, y: 7 }),
      new Coordinates({ x: 11, y: 18 }),
    ],
  },
];

//
// Main Program
//

const main = () => {
  let area;
  let agentPosition;
  let enemyPositions;
  let destinationPosition;
  let path;
  let currentLevelIndex = -1;
  let level;

  const ensurePathIsCleared = () => {
    if (path !== undefined) {
      for (const xy of path) {
        area.canvasGrid.drawTile(xy, tiles.empty);
      }
      path = undefined;
    }

    for (const position of enemyPositions) {
      area.canvasGrid.drawTile(position, tiles.enemy);
    }
  };

  const resetArea = () => {
    const algorithmSelection = querySelectorOrThrow(
      ".pathfinding-algorithm select"
    );

    area = new Area({
      pathfindingAlgorithm: algorithmSelection.value,
    });

    level = levels[currentLevelIndex];
    if (level === undefined) {
      unreachable();
    }

    agentPosition = level.agent;
    enemyPositions = level.enemies.map(identity);
    destinationPosition = level.destination;

    area.addEntitiesFromStrings(level.layout);
    area.addEntity(agentPosition, tiles.agent);
    area.addEntity(destinationPosition, tiles.destination);

    for (const position of enemyPositions) {
      area.addEntity(position, tiles.enemy);
    }

    const statusText = document.querySelector(".status");
    statusText.firstChild.nodeValue = "Normal";
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
    (event) => {
      const target = event.target;
      area.allowDiagonalsInPaths = target.checked;
    }
  );

  querySelectorOrThrow(".pathfinding-algorithm select").addEventListener(
    "change",
    (event) => {
      const target = event.target;
      area.pathfindingAlgorithm = target.value;
    }
  );

  const entityUiNames = new Map();
  entityUiNames.set("Wall", tiles.wall);
  entityUiNames.set("Empty", tiles.empty);
  entityUiNames.set("Enemy", tiles.enemy);
  entityUiNames.set("Destination (Move)", tiles.destination);
  entityUiNames.set("Agent (Move)", tiles.agent);

  const entityToSetElement = document.querySelector(".entity-to-set select");

  const canvasElement = querySelectorOrThrow(".area");
  canvasElement.addEventListener("mousedown", (event) => {
    const entityType = entityUiNames.get(entityToSetElement.value);

    const x = Math.floor(event.offsetX / area.canvasGrid.cellWidth);
    const y = Math.floor(event.offsetY / area.canvasGrid.cellHeight);

    const xy = new Coordinates({ x, y });

    area.deleteEntity(xy);
    switch (entityType) {
      case tiles.destination:
        area.deleteEntity(destinationPosition);
        destinationPosition = xy;
        break;
      case tiles.agent:
        area.deleteEntity(agentPosition);
        agentPosition = xy;
        break;
      case tiles.enemy:
        enemyPositions.push(xy);
        break;
    }
    area.addEntity(xy, entityType);
  });

  listenToDirectionalInput((direction) => {
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
          if (entity !== tiles.enemy && entity !== tiles.destination) {
            enemyPositions[index] = newPosition;
            area.deleteEntity(position);
            area.addEntity(newPosition, tiles.enemy);

            inPursuit = true;
          }
        }
      }
    });

    querySelectorOrThrow(".status").firstChild.nodeValue = inPursuit
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
    }

    if (path.length === 0) {
      alert("No path was found.");
    } else {
      for (const xy of path) {
        area.canvasGrid.drawTile(xy, tiles.navigated);
      }
    }
  });

  changeLevel();
};

main();
