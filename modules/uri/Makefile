all:		build

prepare:
	$(MAKE) -C ../.. $@

build:		prepare build-deps
	pnpm exec tsc --build

build-deps:	src/private/dbref.ts

src/private/dbref.ts:	src/private/dbref.pegjs
	pnpm exec peggy --plugin ./node_modules/ts-pegjs/dist/tspegjs.js $< -o $@

test:		build
	pnpm exec jest

clean:
	rm -rf build coverage

distclean:	clean
	rm -rf node_modules

.PHONY:		all prepare build test clean distclean
