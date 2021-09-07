NODE_MODULES	= node_modules/.modules.yaml $(shell awk '/^ *-/ { print $$2 "/node_modules" }' pnpm-workspace.yaml)

all:	build

prepare:	$(NODE_MODULES)

$(NODE_MODULES):package.json */package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc
	pnpm install --frozen-lockfile
	touch $(NODE_MODULES)

build::	prepare
	pnpm exec tsc --build --verbose

docs::	build

test::	build
	pnpm exec jest

clean::
	rm -rf coverage

distclean::
	rm -rf node_modules

docs clean distclean::
	$(MAKE) -C headers $@
	$(MAKE) -C uri $@
	$(MAKE) -C uri-image-parser $@
	$(MAKE) -C uri-mysql-protocol $@
	$(MAKE) -C uri-postgres-protocol $@
	$(MAKE) -C uri-sqlite-protocol $@
	$(MAKE) -C uri-tds-protocol $@
	$(MAKE) -C uri-x4e-parser $@
	$(MAKE) -C web-service $@
	$(MAKE) -C x4e $@

.PHONY:		all prepare build docs test clean distclean
