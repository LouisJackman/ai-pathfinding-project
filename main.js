/*jslint browser: true */

var game = (function () {
    "use strict";

    //
    // Utility Functions
    //

    var freeze = Object.freeze;
    var seal = Object.seal;

    var fail = function (msg) {
        throw new Error("Error: " + msg);
    };

    var getContext = function (element) {
        var context;

        if (element === null) {
            fail("the specified element was not found");
        }

        context = element.getContext("2d");

        if (element === undefined) {
            fail("2D context could not be acquired");
        }

        return context;
    };

    var isDefined = function (x) { return x !== undefined; };

    var definedOr = function (x, alternative) {
        return isDefined(x) ? x : alternative;
    };

    var listenToDirectionalInput = function (processDirection) {

        addEventListener("keydown", function (event) {
            var direction = keyCodes[event.keyCode];

            if (isDefined(direction)) {
                processDirection(direction);
            }
        });
    };

    var listenToPathfindingRequest = function (process) {

        addEventListener("keydown", function (event) {
            if (event.keyCode === 80) {
                process();
            }
        });
    };

    var identity = function (x) { return x; };
    var constant = function (x) { return function () { return x; }; };

    //
    // Coordinates
    //

    var coordinates = (function () {

        var toString = function () {
            return [this.x, this.y].join(",");
        };

        var equals = function (other) {
            return (this.x === other.x) && (this.y === other.y);
        };

        var getNeighbours = function (maybeGetDiagonals) {
            var getDiagonals = definedOr(maybeGetDiagonals, false);

            var x = this.x;
            var y = this.y;

            var neighbours = [
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
                ].forEach(function (xy) {
                    neighbours.push(xy);
                });
            }

            return freeze(neighbours.map(function (neighbour) {
                return createCoordinates({
                    x: neighbour[0],
                    y: neighbour[1]
                });
            }));
        };

        var difference = function (other) {
            return createCoordinates({
                x: Math.abs(this.x - other.x),
                y: Math.abs(this.y - other.y)
            });
        };

        var getMagnitude = function () {
            return Math.sqrt((this.x * this.x) + (this.y * this.y));
        };

        var withinProximity = function (radius, xy) {
            return this.difference(xy).getMagnitude() <= radius;
        };

        var move = function (direction) {
            var x = this.x;
            var y = this.y;

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

            return createCoordinates({ x: x, y: y });
        };

        return freeze({
            toString: toString,
            equals: equals,
            getNeighbours: getNeighbours,
            getMagnitude: getMagnitude,
            withinProximity: withinProximity,
            difference: difference,
            move: move
        });
    }());

    var createCoordinates = function (args) {
        var obj = Object.create(coordinates);

        obj.x = args.x;
        obj.y = args.y;
        return freeze(obj);
    };

    var createCoordinatesFromString = (function () {
        var cache = Object.create(null);

        return function (string) {
            var splitted;
            var result;

            if (cache[string] === undefined) {
                splitted = string.split(",");
                result = createCoordinates({
                    x: ~~splitted[0],
                    y: ~~splitted[1]
                });
                cache[string] = result;
            } else {
                result = cache[string];
            }
            return result;
        };
    }());

    //
    // Canvas Grid
    //

    var canvasGrid = (function () {

        var drawTile = function (xy, tileType) {
            var context = this.context;
            var cellWidth = this.cellWidth;
            var cellHeight = this.cellHeight;

            context.fillStyle = this.colors[tileType];
            context.fillRect(
                cellWidth * xy.x,
                cellHeight * xy.y,
                cellWidth,
                cellHeight
            );
        };

        var clear = function () {
            var context = this.context;

            context.fillStyle = this.colors.empty;
            context.fillRect(
                0,
                0,
                this.cellWidth * this.width,
                this.cellHeight * this.height
            );
        };

        return freeze({
            drawTile: drawTile,
            clear: clear
        });
    }());

    var createCanvasGrid = function (maybeArgs) {
        var obj = Object.create(canvasGrid);
        var args = definedOr(maybeArgs, emptyObject);
        var colors = definedOr(args.colors, emptyObject);

        obj.context = definedOr(
            args.context,
            getContext(document.querySelector(".area"))
        );
        obj.cellWidth = definedOr(args.cellWidth, 20);
        obj.cellHeight = definedOr(args.cellHeight, 20);
        obj.width = definedOr(args.width, defaultAreaWidth);
        obj.height = definedOr(args.height, defaultAreaHeight);
        obj.colors = Object.create(null);
        obj.colors.empty = definedOr(colors.empty, "black");
        obj.colors.wall = definedOr(colors.wall, "#ccc");
        obj.colors.agent = definedOr(colors.agent, "blue");
        obj.colors.destination = definedOr(colors.destination, "green");
        obj.colors.enemy = definedOr(colors.enemy, "red");
        obj.colors.navigated = definedOr(colors.navigated, "yellow");

        obj.clear();

        return freeze(obj);
    };

    //
    // Area
    //

    var area = (function () {

        var addEntity = function (xy, entityType) {
            if (isDefined(this.entities[xy])) {
                fail("an added entity cannot overlap an existing one");
            }

            if (entityType !== "empty") {
                this.entities[xy] = entityType;
            }

            this.canvasGrid.drawTile(xy, entityType);
        };

        var deleteEntity = function (xy) {
            delete this.entities[xy];
            this.canvasGrid.drawTile(xy, "empty");
        };

        var areCoordinatesValid = function (xy) {
            return (
                (0 <= xy.x)
                    && (xy.x < this.width)
                    && (0 <= xy.y)
                    && (xy.y < this.height)
            );
        };

        var isValidAgentPosition = function (xy) {
            return (
                this.areCoordinatesValid(xy)
                        && (this.entities[xy] !== "wall")
            );
        };

        var moveEntity = function (xy, direction) {
            var newCoordinates = xy.move(direction);
            var entities;

            if (this.isValidAgentPosition(newCoordinates)) {
                entities = this.entities;

                entities[newCoordinates] = entities[xy];
                delete entities[xy];

                this.canvasGrid.drawTile(xy, "empty");
                this.canvasGrid.drawTile(
                    newCoordinates,
                    entities[newCoordinates]
                );

                return newCoordinates;
            } else {
                return xy;
            }
        };

        var addEntitiesFromStrings = function (strings, args) {
            var that = this;

            strings.forEach(function (string, y) {
                string.split("").forEach(function (character, x) {
                    var xy = createCoordinates({ x: x, y: y });
                    var tile = characterTiles[character];

                    that.addEntity(xy, tile);
                });
            });
        };

        var findDepthFirstPath = function (
            source,
            destination,
            maybeVisitedNodes,
            maybeSortNeighbours,
            maybeNavigated
        ) {
            var visitedNodes = definedOr(
                maybeVisitedNodes,
                Object.create(null)
            );
            var sortNeighbours = definedOr(maybeSortNeighbours, identity);
            var navigated = definedOr(maybeNavigated, []);

            var that = this;
            var neighbours;
            var unvisitedNeighbours;
            var neighbouringResult;

            navigated.push(source);

            if (source.equals(destination)) {
                navigated.shift();
                navigated.pop();
                return navigated;
            }

            visitedNodes[source] = true;

            neighbours = source.getNeighbours(this.allowDiagonalsInPaths);
            unvisitedNeighbours = sortNeighbours(neighbours
                .filter(function (neighbour) {
                    return (
                        that.isValidAgentPosition(neighbour)
                                && (visitedNodes[neighbour] === undefined)
                    );
                })
            );

            if (unvisitedNeighbours.length === 0) {
                return [];
            }

            neighbouringResult = (function () {
                var i;
                var path;
                var neighbour;

                for (i = 0; i < unvisitedNeighbours.length; i += 1) {
                    neighbour = unvisitedNeighbours[i];
                    path = that.findDepthFirstPath(
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
            }());

            return neighbouringResult;
        };

        var findDepthFirstPathDirectionally = function (
            source,
            destination,
            maybeVisitedNodes
        ) {
            var that = this;

            return this.findDepthFirstPath(
                source,
                destination,
                maybeVisitedNodes,
                function (neighbours) {

                    return neighbours.sort(function (a, b) {
                        var aDelta = destination.difference(a).getMagnitude();
                        var bDelta = destination.difference(b).getMagnitude();

                        return aDelta < bDelta ?
                            -1 :
                            bDelta < aDelta ?
                                1 :
                                0;
                    });
                }
            );
        };

        var findDijkstraPath = function (
            source,
            destination,
            maybeGetHeuristic
        ) {
            var getHeuristic = definedOr(maybeGetHeuristic, constant(0));

            var that = this;
            var unvisitedNodes = Object.create(null);
            var distances = Object.create(null);
            var previousDistances = Object.create(null);
            var current;
            var previous;
            var navigated = [];
            var x;
            var y;
            var xy;
            var sorted;

            var compareDistances = function (a, b) {
                return ((distances[a] < distances[b])
                    ?
                        -1
                        : ((distances[b] < distances[a])
                            ?  1
                            : 0
                        )
                );
            };

            var updateDistance = function (neighbour) {
                var distance = (
                    distances[current]
                        + 1
                        + getHeuristic(neighbour)
                );

                if (distance < distances[neighbour]) {
                    previousDistances[neighbour] = current;
                    distances[neighbour] = distance;
                }
            };

            distances[source] = 0;
            unvisitedNodes[source] = true;

            for (y = 0; y < this.height; y += 1) {
                for (x = 0; x < this.width; x += 1) {
                    xy = createCoordinates({ x: x, y: y });

                    if (
                        that.isValidAgentPosition(xy)
                            && !source.equals(xy)
                    ) {
                        unvisitedNodes[xy] = true;
                        distances[xy] = Infinity;
                    }
                }
            }

            while (unvisitedNodes.length !== 0) {

                sorted = Object
                    .keys(unvisitedNodes)
                    .sort(compareDistances)
                    .map(createCoordinatesFromString);

                current = sorted[0];

                delete unvisitedNodes[current];

                if (current.equals(destination)) {
                    previous = previousDistances[current];

                    while (isDefined(previousDistances[previous])) {
                        navigated.push(previous);
                        previous = previousDistances[previous];
                    }
                    return navigated;
                }

                current
                    .getNeighbours(this.allowDiagonalsInPaths)
                    .forEach(updateDistance);
            }

            return [];
        };

        var findAStarPath = function (source, destination) {
            return this.findDijkstraPath(
                source,
                destination,
                function (neighbour) {
                    return neighbour.difference(destination).getMagnitude();
                });
        };

        return freeze({
            addEntity: addEntity,
            deleteEntity: deleteEntity,
            areCoordinatesValid: areCoordinatesValid,
            isValidAgentPosition: isValidAgentPosition,
            moveEntity: moveEntity,
            addEntitiesFromStrings: addEntitiesFromStrings,
            findDepthFirstPath: findDepthFirstPath,
            findDepthFirstPathDirectionally: findDepthFirstPathDirectionally,
            findDijkstraPath: findDijkstraPath,
            findAStarPath: findAStarPath
        });
    }());

    var createArea = function (maybeArgs) {
        var obj = Object.create(area);
        var args = definedOr(maybeArgs, emptyObject);

        obj.width = definedOr(args.width, defaultAreaWidth);
        obj.height = definedOr(args.height, defaultAreaHeight);

        obj.allowDiagonalsInPaths = definedOr(args.allowDiagonalsInPaths, false);
        obj.pathfindingAlgorithm = definedOr(
            args.pathfindingAlgorithm,
            "Djikstra's Algorithm"
        );
        obj.entityToSet = definedOr(args.entityToSet, "Wall");

        obj.canvasGrid = definedOr(args.canvasGrid, createCanvasGrid({
            width: obj.width,
            height: obj.height
        }));

        obj.entities = Object.create(null);

        return seal(obj);
    };

    //
    // Utility Data
    //

    var emptyObject = freeze(Object.create(null));

    var defaultAreaWidth = 30;
    var defaultAreaHeight = 20;

    var keyCodes = {
        87: "up",
        83: "down",
        65: "left",
        68: "right"
    };

    var characterTiles = (function () {
        var obj = Object.create(null);

        obj["#"] = "wall";
        obj[" "] = "empty";
        obj["O"] = "agent";
        obj["!"] = "enemy";
        obj["X"] = "destination";
        return obj;
    }());

    var levels = [
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
            agent: createCoordinates({ x: 11, y: 2 }),
            destination: createCoordinates({ x: 25, y: 17 }),
            enemies: [
                createCoordinates({ x: 7, y: 8 }),
                createCoordinates({ x: 27, y: 5 }),
                createCoordinates({ x: 11, y: 18 })
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
            agent: createCoordinates({ x: 2, y: 2 }),
            destination: createCoordinates({ x: 27, y: 17 }),
            enemies: [
                createCoordinates({ x: 2, y: 14 }),
                createCoordinates({ x: 14, y: 9 })
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
            agent: createCoordinates({ x: 2, y: 1 }),
            destination: createCoordinates({ x: 25, y: 17 }),
            enemies: [
                createCoordinates({ x: 2, y: 17 }),
                createCoordinates({ x: 25, y: 5 }),
                createCoordinates({ x: 12, y: 10 })
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
            agent: createCoordinates({ x: 11, y: 2 }),
            destination: createCoordinates({ x: 25, y: 17 }),
            enemies: [
                createCoordinates({ x: 7, y: 7 }),
                createCoordinates({ x: 27, y: 7 }),
                createCoordinates({ x: 11, y: 18 })
            ]
        },
    ];

    //
    // Main Program
    //

    var main = function () {
        var area;
        var agentPosition;
        var enemyPositions;
        var destinationPosition;
        var path;
        var currentLevelIndex = -1;
        var level;

        var ensurePathIsCleared = function () {
            if (isDefined(path)) {
                path.forEach(function (xy) {
                    area.canvasGrid.drawTile(xy, "empty");
                });
                path = undefined;
            }

            enemyPositions.forEach(function (position) {
                area.canvasGrid.drawTile(position, "enemy");
            });
        };

        var resetArea = function () {
            area = createArea({
                pathfindingAlgorithm: document
                    .querySelector(".pathfinding-algorithm select")
                    .value
            });

            level = levels[currentLevelIndex];
            agentPosition = level.agent;
            enemyPositions = level.enemies.map(function (x) { return x; });
            destinationPosition = level.destination;

            area.addEntitiesFromStrings(level.layout);
            area.addEntity(agentPosition, "agent");
            area.addEntity(destinationPosition, "destination");

            enemyPositions.forEach(function (position) {
                area.addEntity(position, "enemy");
            });

            document.querySelector(".status").firstChild.nodeValue = "Normal"
        };

        var changeLevel = function () {
            currentLevelIndex += 1;
            if (levels.length <= currentLevelIndex) {
                currentLevelIndex = 0;
            }

            resetArea();
        };

        var onDestinationArrival = function () {
            alert("Level Complete");
            changeLevel();
        };

        var onDeath = function () {
            alert("You Died");
            resetArea();
        };

        document
            .querySelector(".allow-diagonals-in-paths input")
            .addEventListener("click", function (event) {
                area.allowDiagonalsInPaths = event.target.checked;
            });

        document
            .querySelector(".pathfinding-algorithm select")
            .addEventListener("change", function (event) {
                area.pathfindingAlgorithm = event.target.value;
            });

        document
            .querySelector(".entity-to-set select")
            .addEventListener("change", function (event) {
                area.entityToSet = event.target.value;
            });

        document
            .querySelector(".area")
            .addEventListener("mousedown", function (event) {
                var screenX;
                var screenY;
                var x;
                var y;

                var entityType = {
                    Wall: "wall",
                    Empty: "empty",
                    Enemy: "enemy",
                    "Destination (Move)": "destination",
                    "Agent (Move)": "agent"
                }[document.querySelector(".entity-to-set select").value];

                var xy;

                if (isDefined(event.x)) {
                    x = event.x;
                    y = event.y;
                } else {
                    x = (
                        event.clientX
                            + document.body.scrollLeft
                            + document.documentElement.scrollLeft
                    );
                    y = (
                        event.clientY
                            + document.body.scrollTop
                            + document.documentElement.scrollTop
                    );
                }

                x = Math.floor(
                    (x - event.target.offsetLeft)
                        / area.canvasGrid.cellWidth
                );
                y = Math.floor(
                    (y - event.target.offsetTop)
                        / area.canvasGrid.cellHeight
                );

                xy = createCoordinates({ x: x, y: y });

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

        listenToDirectionalInput(function (direction) {
            var inPursuit = false;

            ensurePathIsCleared();

            enemyPositions.forEach(function (position, index) {
                var newPosition;
                var entity;

                if (position.equals(agentPosition)) {
                    onDeath();
                    return;
                }

                if (agentPosition.withinProximity(6, position)) {
                    newPosition = area.findDijkstraPath(
                        agentPosition,
                        position
                    )[0];

                    if (isDefined(newPosition)) {
                        entity = area.entities[newPosition];
                        if (
                            (entity !== "enemy")
                                && (entity !== "destination")
                        ) {
                            enemyPositions[index] = newPosition;
                            area.deleteEntity(position);
                            area.addEntity(newPosition, "enemy");

                            inPursuit = true;
                        }
                    }
                }
            });

            document.querySelector(".status").firstChild.nodeValue = (
                inPursuit
                    ? "Enemy Pursuing"
                    : "Normal"
            );

            agentPosition = area.moveEntity(agentPosition, direction);

            if (agentPosition.equals(destinationPosition)) {
                onDestinationArrival();
            }
        });

        listenToPathfindingRequest(function () {
            ensurePathIsCleared();

            switch (area.pathfindingAlgorithm) {
                case "Random Depth-First":
                    path = area.findDepthFirstPath(
                        agentPosition,
                        destinationPosition
                    );
                    break;
                case "Directional Depth-First":
                    path = area.findDepthFirstPathDirectionally(
                        agentPosition,
                        destinationPosition
                    );
                    break;
                case "Djikstra's Algorithm":
                    path = area.findDijkstraPath(
                        agentPosition,
                        destinationPosition
                    );
                    break;
                case "A*":
                    path = area.findAStarPath(
                        agentPosition,
                        destinationPosition
                    );
                    break;
                default:
                    fail(
                        "invalid pathfinding algorithm selected: "
                            + area.pathfindingAlgorithm
                    );
                    break;
            }

            if (path.length === 0) {
                alert("No path was found.");
            } else {
                path.forEach(function (xy) {
                    area.canvasGrid.drawTile(xy, "navigated");
                });
            }
        });

        changeLevel();
    };

    main();

    return freeze({
        emptyObject: emptyObject,
        defaultAreaWidth: defaultAreaWidth,
        defaultAreaHeight: defaultAreaHeight,
        keyCodes: keyCodes,
        characterTiles: characterTiles,
        getContext: getContext,
        isDefined: isDefined,
        definedOr: definedOr,
        listenToDirectionalInput: listenToDirectionalInput,
        listenToPathfindingRequest: listenToPathfindingRequest,
        levels: levels,
        main: main,
        coordinates: coordinates,
        createCoordinates: createCoordinates,
        createCoordinatesFromString: createCoordinatesFromString,
        canvasGrid: canvasGrid,
        createCanvasGrid: createCanvasGrid,
        area: area,
        createArea: createArea
    });
}());

