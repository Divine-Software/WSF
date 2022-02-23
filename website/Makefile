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

clean:	prepare
	-pnpm run clear
	rm -rf build docs/api

distclean:	clean
	rm -rf node_modules

publish:	pristine clean
	GIT_USER=LeviticusMB USE_SSH=true pnpm run deploy

pristine:
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)

.PHONY:		all prepare build watch build-deps test clean distclean publish
