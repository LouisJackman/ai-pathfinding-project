.POSIX:

build:
	npm run build

publish: build
	tar -czf ai-pathfinding-project.tgz index.html main.js style.css
