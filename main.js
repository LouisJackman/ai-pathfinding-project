//
// Utility Functions
//

const { freeze, seal } = Object;

export const fail = msg => {
  throw new Error(`Error: ${msg}`);
};

export const emptyObject = freeze(Object.create(null));

export const listKeys = xs => {
  const keys = [];
  for (let key of xs.keys()) {
    keys.push(key);
  }
  return keys;
};

export const getContext = element => {
  if (element === null) {
    fail("the specified element was not found");
  }

  const context = element.getContext("2d");
  if (context === undefined) {
    fail("2D context could not be acquired");
  }

  return context;
};

export const isDefined = x => x !== undefined;

export const definedOr = (x, alternative) => (isDefined(x) ? x : alternative);

export const identity = x => x;
export const constant = x => () => x;

const upKeyCode = 87;
const downKeyCode = 83;
const leftKeyCode = 65;
const rightKeyCode = 68;

export const keyCodes = (() => {
  const codes = new Map();
  codes.set(upKeyCode, "up");
  codes.set(downKeyCode, "down");
  codes.set(leftKeyCode, "left");
  codes.set(rightKeyCode, "right");
  return codes;
})();

const listenToDirectionalInput = processDirection => {
  addEventListener("keydown", event => {
    const direction = keyCodes.get(event.keyCode);

    if (isDefined(direction)) {
      processDirection(direction);
    }
  });
};

const letterPKeyCode = 80;

const listenToPathfindingRequest = process => {
  addEventListener("keydown", event => {
    if (event.keyCode === letterPKeyCode) {
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

    const neighbours = [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]];

    if (getDiagonals) {
      [[x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]].forEach(
        xy => neighbours.push(xy)
      );
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

  difference({ x, y }) {
    return new Coordinates({
      x: Math.abs(this.x - x),
      y: Math.abs(this.y - y)
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
      case "left":
        --x;
        break;
      case "right":
        ++x;
        break;
      case "up":
        --y;
        break;
      case "down":
        ++y;
        break;
      default:
        fail("invalid direction");
    }

    return new Coordinates({ x, y });
  }
}

export const createCoordinatesFromString = (() => {
  const cache = new Map();

  return string => {
    let result;
    if (cache.has(string)) {
      result = cache.get(string);
    } else {
      const [xString, yString] = string.split(",");
      result = new Coordinates({
        x: Number.parseInt(xString),
        y: Number.parseInt(yString)
      });
      cache.set(string, result);
    }
    return result;
  };
})();

const createColors = ({
  empty = "black",
  wall = "#ccc",
  agent = "blue",
  destination = "green",
  enemy = "red",
  navigated = "yellow"
}) => {
  const colors = new Map();
  colors.set("empty", empty);
  colors.set("wall", wall);
  colors.set("agent", agent);
  colors.set("destination", destination);
  colors.set("enemy", enemy);
  colors.set("navigated", navigated);
  return colors;
};

export class CanvasGrid {
  constructor({
    colors = emptyObject,
    context = getContext(document.querySelector(".area")),
    cellWidth = 20,
    cellHeight = 20,
    width = defaultAreaWidth,
    height = defaultAreaHeight
  }) {
    this.colors = createColors(colors);
    this.context = context;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.width = width;
    this.height = height;

    this.clear();
  }

  drawTile({ x, y }, tileType) {
    const { context, cellWidth, cellHeight } = this;

    context.fillStyle = this.colors.get(tileType);
    context.fillRect(cellWidth * x, cellHeight * y, cellWidth, cellHeight);
  }

  clear() {
    const { context, cellWidth, cellHeight, width, height, colors } = this;

    context.fillStyle = colors.get("empty");
    context.fillRect(0, 0, cellWidth * width, cellHeight * height);
  }
}

export class Area {
  constructor({
    width = defaultAreaWidth,
    height = defaultAreaHeight,
    allowDiagonalsInPaths = false,
    pathfindingAlgorithm = "Djikstra's Algorithm",
    entityToSet = "Wall",
    canvasGrid: maybeCanvasGrid
  }) {
    this.width = width;
    this.height = height;
    this.allowDiagonalsInPaths = allowDiagonalsInPaths;
    this.pathfindingAlgorithm = pathfindingAlgorithm;
    this.entityToSet = entityToSet;

    this.canvasGrid = definedOr(
      maybeCanvasGrid,
      new CanvasGrid({
        height,
        width
      })
    );

    this.entities = new Map();
  }

  addEntity(xy, entityType) {
    const key = String(xy);

    if (this.entities.has(key)) {
      fail("an added entity cannot overlap an existing one");
    }

    if (entityType !== "empty") {
      this.entities.set(key, entityType);
    }

    this.canvasGrid.drawTile(xy, entityType);
  }

  deleteEntity(xy) {
    this.entities.delete(String(xy));
    this.canvasGrid.drawTile(xy, "empty");
  }

  areCoordinatesValid(xy) {
    return 0 <= xy.x && xy.x < this.width && 0 <= xy.y && xy.y < this.height;
  }

  isValidAgentPosition(xy) {
    return (
      this.areCoordinatesValid(xy) && this.entities.get(String(xy)) !== "wall"
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

      this.canvasGrid.drawTile(xy, "empty");
      this.canvasGrid.drawTile(newCoordinates, entities.get(key));

      result = newCoordinates;
    } else {
      result = xy;
    }
    return result;
  }

  addEntitiesFromStrings(strings, args) {
    strings.forEach((string, y) => {
      string.split("").forEach((character, x) => {
        const xy = new Coordinates({ x, y });
        const tile = characterTiles.get(character);
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

    for (let neighbour of unvisitedNeighbours) {
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

  findDepthFirstPathDirectionally(source, destination, maybeVisitedNodes) {
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

    const updateDistance = neighbour => {
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

  findAStarPath(source, destination) {
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
  const tiles = new Map();
  tiles.set("#", "wall");
  tiles.set(" ", "empty");
  tiles.set("O", "agent");
  tiles.set("!", "enemy");
  tiles.set("X", "destination");
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
  let area;
  let agentPosition;
  let enemyPositions;
  let destinationPosition;
  let path;
  let currentLevelIndex = -1;
  let level;

  const ensurePathIsCleared = () => {
    if (isDefined(path)) {
      path.forEach(xy => area.canvasGrid.drawTile(xy, "empty"));
      path = undefined;
    }

    enemyPositions.forEach(position =>
      area.canvasGrid.drawTile(position, "enemy")
    );
  };

  const resetArea = () => {
    area = new Area({
      pathfindingAlgorithm: document.querySelector(
        ".pathfinding-algorithm select"
      ).value
    });

    level = levels[currentLevelIndex];
    agentPosition = level.agent;
    enemyPositions = level.enemies.map(identity);
    destinationPosition = level.destination;

    area.addEntitiesFromStrings(level.layout);
    area.addEntity(agentPosition, "agent");
    area.addEntity(destinationPosition, "destination");

    enemyPositions.forEach(position => area.addEntity(position, "enemy"));

    document.querySelector(".status").firstChild.nodeValue = "Normal";
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

  document
    .querySelector(".allow-diagonals-in-paths input")
    .addEventListener("click", event => {
      area.allowDiagonalsInPaths = event.target.checked;
    });

  document
    .querySelector(".pathfinding-algorithm select")
    .addEventListener("change", event => {
      area.pathfindingAlgorithm = event.target.value;
    });

  document
    .querySelector(".entity-to-set select")
    .addEventListener("change", event => {
      area.entityToSet = event.target.value;
    });

  const entityUiNames = new Map();
  entityUiNames.set("Wall", "wall");
  entityUiNames.set("Empty", "empty");
  entityUiNames.set("Enemy", "enemy");
  entityUiNames.set("Destination (Move)", "destination");
  entityUiNames.set("Agent (Move)", "agent");

  const entityToSetElement = document.querySelector(".entity-to-set select");

  document.querySelector(".area").addEventListener("mousedown", event => {
    const entityType = entityUiNames.get(entityToSetElement.value);

    let baseX;
    let baseY;
    if (isDefined(event.x)) {
      baseX = event.x;
      baseY = event.y;
    } else {
      baseX =
        event.clientX +
        document.body.scrollLeft +
        document.documentElement.scrollLeft;
      baseY =
        event.clientY +
        document.body.scrollTop +
        document.documentElement.scrollTop;
    }

    const x = Math.floor(
      (baseX - event.target.offsetLeft) / area.canvasGrid.cellWidth
    );
    const y = Math.floor(
      (baseY - event.target.offsetTop) / area.canvasGrid.cellHeight
    );

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

        if (isDefined(newPosition)) {
          const entity = area.entities.get(newPosition);
          if (entity !== "enemy" && entity !== "destination") {
            enemyPositions[index] = newPosition;
            area.deleteEntity(position);
            area.addEntity(newPosition, "enemy");

            inPursuit = true;
          }
        }
      }
    });

    document.querySelector(".status").firstChild.nodeValue = inPursuit
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
        fail(
          `invalid pathfinding algorithm selected: ${area.pathfindingAlgorithm}`
        );
        break;
    }

    if (path.length === 0) {
      alert("No path was found.");
    } else {
      path.forEach(xy => area.canvasGrid.drawTile(xy, "navigated"));
    }
  });

  changeLevel();
};

main();
