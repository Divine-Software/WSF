help:
	@awk -F ':.*## ' '/^[^\t]+:.*## / { printf "\033[1m%-16s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

all:		build								## Build website (alias for build)

prepare:									## Build and install all dependencies
	pnpm install --frozen-lockfile
	$(MAKE) -C .. $@

build:		prepare build-deps						## Build production website
	pnpm run build

watch:		prepare build-deps						## Start website in development server
	pnpm run start

build-deps:									## Build all dependencies
	$(MAKE) -C .. build

test:

clean:	prepare									## Clean all build artifacts (but not dependencies)
	-pnpm run clear
	rm -rf build docs/api

distclean:	clean								## Like clean, but also remove all dependencies
	rm -rf node_modules

publish:	pristine clean							## Publish website to GitHub Pages
	GIT_USER=LeviticusMB USE_SSH=true pnpm run deploy

pristine:
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)

.PHONY:		all prepare build watch build-deps test clean distclean publish
