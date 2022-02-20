all:		build

prepare:
	pnpm install --frozen-lockfile
	$(MAKE) -C .. $@

build:		prepare build-deps
	pnpm run build

watch:		prepare build-deps
	pnpm run start

build-deps:
	$(MAKE) -C .. build

test:

clean:
	-pnpm run clear
	rm -rf build docs/api

distclean:	clean
	rm -rf node_modules

publish:	prepare clean
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)
	GIT_USER=LeviticusMB USE_SSH=true pnpm run deploy

.PHONY:		all prepare build watch build-deps test clean distclean publish
