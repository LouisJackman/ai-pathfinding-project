import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  Coordinates,
  createCoordinatesFromString,
  definedOr,
  identity,
  constant,
  emptyObject,
  characterTiles,
  keyCodes,
  CanvasGrid,
  Area,
} from "./main.js";

//
// Test Helpers
//

const stubContext = {
  fillStyle: "",
  fillRect() {},
};

const createCanvasGrid = () =>
  new CanvasGrid({ context: stubContext, width: 10, height: 10 });

const createArea = (opts = {}) =>
  new Area({ canvasGrid: createCanvasGrid(), width: 10, height: 10, ...opts });

/**
 * Build a small walled area from ASCII strings and return the Area.
 * '#' = wall, ' ' = empty.
 */
const createAreaFromLayout = (layout, opts = {}) => {
  const height = layout.length;
  const width = layout[0].length;
  const area = createArea({ width, height, ...opts });

  layout.forEach((row, y) => {
    row.split("").forEach((ch, x) => {
      if (ch === "#") {
        area.addEntity(new Coordinates({ x, y }), "wall");
      }
    });
  });

  return area;
};

//
// Utility Functions
//

describe("definedOr", () => {
  it("returns the value when defined", () => {
    assert.equal(definedOr(42, 0), 42);
    assert.equal(definedOr("hello", "default"), "hello");
    assert.equal(definedOr(false, true), false);
    assert.equal(definedOr(0, 99), 0);
    assert.equal(definedOr(null, "fallback"), null);
  });

  it("returns the alternative when undefined", () => {
    assert.equal(definedOr(undefined, 0), 0);
    assert.equal(definedOr(undefined, "fallback"), "fallback");
  });
});

describe("identity", () => {
  it("returns its argument unchanged", () => {
    assert.equal(identity(1), 1);
    assert.equal(identity("a"), "a");
    const obj = { x: 1 };
    assert.equal(identity(obj), obj);
  });
});

describe("constant", () => {
  it("returns a function that always returns the given value", () => {
    const five = constant(5);
    assert.equal(five(), 5);
    assert.equal(five(), 5);

    const obj = { a: 1 };
    const getObj = constant(obj);
    assert.equal(getObj(), obj);
  });
});

describe("emptyObject", () => {
  it("is frozen and has no properties", () => {
    assert.equal(Object.isFrozen(emptyObject), true);
    assert.deepEqual(Object.keys(emptyObject), []);
  });
});

describe("keyCodes", () => {
  it("maps WASD to directions", () => {
    assert.equal(keyCodes["w"], "up");
    assert.equal(keyCodes["a"], "left");
    assert.equal(keyCodes["s"], "down");
    assert.equal(keyCodes["d"], "right");
  });

  it("is frozen", () => {
    assert.equal(Object.isFrozen(keyCodes), true);
  });
});

describe("characterTiles", () => {
  it("maps ASCII characters to tile types", () => {
    assert.equal(characterTiles["#"], "wall");
    assert.equal(characterTiles[" "], "empty");
    assert.equal(characterTiles["O"], "agent");
    assert.equal(characterTiles["!"], "enemy");
    assert.equal(characterTiles["X"], "destination");
  });

  it("is frozen", () => {
    assert.equal(Object.isFrozen(characterTiles), true);
  });
});

//
// Coordinates
//

describe("Coordinates", () => {
  describe("constructor", () => {
    it("stores x and y", () => {
      const c = new Coordinates({ x: 3, y: 7 });
      assert.equal(c.x, 3);
      assert.equal(c.y, 7);
    });
  });

  describe("toString", () => {
    it("serialises as 'x,y'", () => {
      assert.equal(new Coordinates({ x: 0, y: 0 }).toString(), "0,0");
      assert.equal(new Coordinates({ x: 5, y: 12 }).toString(), "5,12");
      assert.equal(new Coordinates({ x: -1, y: -3 }).toString(), "-1,-3");
    });
  });

  describe("equals", () => {
    it("returns true for equal coordinates", () => {
      const a = new Coordinates({ x: 1, y: 2 });
      const b = new Coordinates({ x: 1, y: 2 });
      assert.equal(a.equals(b), true);
    });

    it("returns false for different coordinates", () => {
      const a = new Coordinates({ x: 1, y: 2 });
      assert.equal(a.equals(new Coordinates({ x: 2, y: 2 })), false);
      assert.equal(a.equals(new Coordinates({ x: 1, y: 3 })), false);
    });
  });

  describe("getNeighbours", () => {
    it("returns 4 cardinal neighbours by default", () => {
      const c = new Coordinates({ x: 5, y: 5 });
      const neighbours = c.getNeighbours();
      assert.equal(neighbours.length, 4);

      const positions = neighbours.map((n) => n.toString()).sort();
      assert.deepEqual(positions, ["4,5", "5,4", "5,6", "6,5"]);
    });

    it("returns 8 neighbours when diagonals enabled", () => {
      const c = new Coordinates({ x: 5, y: 5 });
      const neighbours = c.getNeighbours(true);
      assert.equal(neighbours.length, 8);

      const positions = new Set(neighbours.map((n) => n.toString()));
      for (const expected of [
        "5,4", "4,5", "6,5", "5,6",
        "4,4", "6,4", "4,6", "6,6",
      ]) {
        assert.equal(positions.has(expected), true, `missing ${expected}`);
      }
    });

    it("returns a frozen array", () => {
      const neighbours = new Coordinates({ x: 0, y: 0 }).getNeighbours();
      assert.equal(Object.isFrozen(neighbours), true);
    });
  });

  describe("difference", () => {
    it("returns absolute coordinate differences", () => {
      const a = new Coordinates({ x: 1, y: 2 });
      const b = new Coordinates({ x: 4, y: 6 });
      const diff = a.difference(b);
      assert.equal(diff.x, 3);
      assert.equal(diff.y, 4);
    });

    it("is always non-negative regardless of order", () => {
      const a = new Coordinates({ x: 10, y: 10 });
      const b = new Coordinates({ x: 3, y: 7 });
      const diff = a.difference(b);
      assert.equal(diff.x, 7);
      assert.equal(diff.y, 3);
    });
  });

  describe("magnitude", () => {
    it("computes Euclidean magnitude", () => {
      assert.equal(new Coordinates({ x: 3, y: 4 }).magnitude, 5);
      assert.equal(new Coordinates({ x: 0, y: 0 }).magnitude, 0);
      assert.equal(new Coordinates({ x: 1, y: 0 }).magnitude, 1);
    });
  });

  describe("withinProximity", () => {
    it("returns true when within radius", () => {
      const a = new Coordinates({ x: 0, y: 0 });
      const b = new Coordinates({ x: 1, y: 1 });
      assert.equal(a.withinProximity(2, b), true);
    });

    it("returns false when outside radius", () => {
      const a = new Coordinates({ x: 0, y: 0 });
      const b = new Coordinates({ x: 10, y: 10 });
      assert.equal(a.withinProximity(2, b), false);
    });

    it("returns true when exactly at radius", () => {
      const a = new Coordinates({ x: 0, y: 0 });
      const b = new Coordinates({ x: 3, y: 4 });
      assert.equal(a.withinProximity(5, b), true);
    });
  });

  describe("move", () => {
    const origin = new Coordinates({ x: 5, y: 5 });

    it("moves up (y - 1)", () => {
      const moved = origin.move("up");
      assert.equal(moved.x, 5);
      assert.equal(moved.y, 4);
    });

    it("moves down (y + 1)", () => {
      const moved = origin.move("down");
      assert.equal(moved.x, 5);
      assert.equal(moved.y, 6);
    });

    it("moves left (x - 1)", () => {
      const moved = origin.move("left");
      assert.equal(moved.x, 4);
      assert.equal(moved.y, 5);
    });

    it("moves right (x + 1)", () => {
      const moved = origin.move("right");
      assert.equal(moved.x, 6);
      assert.equal(moved.y, 5);
    });

    it("returns a new Coordinates instance", () => {
      const moved = origin.move("up");
      assert.notEqual(moved, origin);
    });
  });
});

//
// createCoordinatesFromString
//

describe("createCoordinatesFromString", () => {
  it("parses 'x,y' strings into Coordinates", () => {
    const c = createCoordinatesFromString("3,7");
    assert.equal(c.x, 3);
    assert.equal(c.y, 7);
  });

  it("returns the same instance for repeated calls (memoisation)", () => {
    const a = createCoordinatesFromString("10,20");
    const b = createCoordinatesFromString("10,20");
    assert.equal(a, b);
  });

  it("handles zero coordinates", () => {
    const c = createCoordinatesFromString("0,0");
    assert.equal(c.x, 0);
    assert.equal(c.y, 0);
  });
});

//
// Pathfinding (Area)
//

describe("Area pathfinding", () => {
  // Open 5x5 area with walls on the border:
  //   #####
  //   #   #
  //   #   #
  //   #   #
  //   #####
  const openLayout = [
    "#####",
    "#   #",
    "#   #",
    "#   #",
    "#####",
  ];

  // Area with an internal wall creating a corridor:
  //   #######
  //   #     #
  //   # ### #
  //   #   # #
  //   # ### #
  //   #     #
  //   #######
  const corridorLayout = [
    "#######",
    "#     #",
    "# ### #",
    "#   # #",
    "# ### #",
    "#     #",
    "#######",
  ];

  describe("findDijkstraPath", () => {
    it("finds a path in an open area", () => {
      const area = createAreaFromLayout(openLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 3, y: 3 });

      const path = area.findDijkstraPath(source, dest);
      assert.ok(path.length > 0, "path should not be empty");
    });

    it("returns an empty path when no route exists", () => {
      // Completely walled off destination.
      const blocked = [
        "#####",
        "# # #",
        "#####",
      ];
      const area = createAreaFromLayout(blocked);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 3, y: 1 });

      const path = area.findDijkstraPath(source, dest);
      assert.equal(path.length, 0);
    });

    it("finds a path through a corridor", () => {
      const area = createAreaFromLayout(corridorLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 5, y: 5 });

      const path = area.findDijkstraPath(source, dest);
      assert.ok(path.length > 0, "path should not be empty");
    });

    it("path nodes are all valid positions", () => {
      const area = createAreaFromLayout(corridorLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 5, y: 5 });

      const path = area.findDijkstraPath(source, dest);
      for (const node of path) {
        assert.equal(area.isValidAgentPosition(node), true,
          `path node ${node} should be a valid position`);
      }
    });
  });

  describe("findAStarPath", () => {
    it("finds a path in an open area", () => {
      const area = createAreaFromLayout(openLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 3, y: 3 });

      const path = area.findAStarPath(source, dest);
      assert.ok(path.length > 0, "path should not be empty");
    });

    it("finds a path through a corridor", () => {
      const area = createAreaFromLayout(corridorLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 5, y: 5 });

      const path = area.findAStarPath(source, dest);
      assert.ok(path.length > 0, "path should not be empty");
    });

    it("returns an empty path when blocked", () => {
      const blocked = [
        "#####",
        "# # #",
        "#####",
      ];
      const area = createAreaFromLayout(blocked);
      const path = area.findAStarPath(
        new Coordinates({ x: 1, y: 1 }),
        new Coordinates({ x: 3, y: 1 }),
      );
      assert.equal(path.length, 0);
    });
  });

  describe("findDepthFirstPath", () => {
    it("finds a path in an open area", () => {
      const area = createAreaFromLayout(openLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 3, y: 3 });

      const path = area.findDepthFirstPath(source, dest);
      assert.ok(path.length > 0, "path should not be empty");
    });

    it("is deterministic with the same layout", () => {
      const area = createAreaFromLayout(openLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 3, y: 3 });

      const path1 = area.findDepthFirstPath(source, dest);
      const path2 = area.findDepthFirstPath(source, dest);
      assert.deepEqual(
        path1.map((c) => c.toString()),
        path2.map((c) => c.toString()),
      );
    });

    it("returns an empty path when blocked", () => {
      const blocked = [
        "#####",
        "# # #",
        "#####",
      ];
      const area = createAreaFromLayout(blocked);
      const path = area.findDepthFirstPath(
        new Coordinates({ x: 1, y: 1 }),
        new Coordinates({ x: 3, y: 1 }),
      );
      assert.equal(path.length, 0);
    });
  });

  describe("findDepthFirstPathDirectionally", () => {
    it("finds a path in an open area", () => {
      const area = createAreaFromLayout(openLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 3, y: 3 });

      const path = area.findDepthFirstPathDirectionally(source, dest);
      assert.ok(path.length > 0, "path should not be empty");
    });

    it("finds a path through a corridor", () => {
      const area = createAreaFromLayout(corridorLayout);
      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 5, y: 5 });

      const path = area.findDepthFirstPathDirectionally(source, dest);
      assert.ok(path.length > 0, "path should not be empty");
    });
  });

  describe("diagonal pathfinding", () => {
    it("Dijkstra finds shorter paths with diagonals enabled", () => {
      const area = createAreaFromLayout(openLayout, {
        allowDiagonalsInPaths: false,
      });
      const areaDiag = createAreaFromLayout(openLayout);
      areaDiag.allowDiagonalsInPaths = true;

      const source = new Coordinates({ x: 1, y: 1 });
      const dest = new Coordinates({ x: 3, y: 3 });

      const pathNoDiag = area.findDijkstraPath(source, dest);
      const pathDiag = areaDiag.findDijkstraPath(source, dest);

      assert.ok(
        pathDiag.length <= pathNoDiag.length,
        "diagonal path should be no longer than cardinal-only path",
      );
    });
  });
});
