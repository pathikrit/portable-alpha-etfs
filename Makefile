.PHONY: build dev test

PORT ?= 8000

# Write _site/index.html: index.html with etf.json baked in.
build:
	node build.mjs

# Build, serve _site, and rebuild when index.html or etf.json changes.
dev:
	node build.mjs --dev $(PORT)

# Run the tests. CI runs this too.
test:
	node --test tests/*.test.mjs
