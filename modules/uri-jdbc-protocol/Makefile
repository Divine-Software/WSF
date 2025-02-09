all:		build

prepare:
	$(MAKE) -C ../.. $@

build:		prepare build-deps
	pnpm exec tsc --build

build-deps:	build/src/DBConnectionBridge.class

build/%.class:	%.java
	mkdir -p $(dir $@) && javac -d $(dir $@) $<

test:		build
	pnpm exec jest

clean:
	rm -rf build coverage

distclean:	clean
	rm -rf node_modules

.PHONY:		all prepare build test clean distclean
