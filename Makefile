.PHONY: dev test

PORT ?= 8000

# Serve the site locally. index.html loads etf.json, so it does not work from a file:// path.
dev:
	@echo "http://localhost:$(PORT)/"
	python3 -m http.server $(PORT)

# Run the tests. CI runs this too.
test:
	node --test tests/*.test.mjs
