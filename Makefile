.POSIX:

build:
	npm run build

publish: build
	tar -czf ai-pathfinding-project.tgz index.htm main.js style.css
