build:
	tsc "@compileropts"

test: build
	./node_modules/.bin/mocha --reporter list

.PHONY: build test
