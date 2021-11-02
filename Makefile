.POSIX:

build:
	npm run build

publish: build
	tar -cJf ai-pathfinding-project.tar.xz index.html main.js style.css
