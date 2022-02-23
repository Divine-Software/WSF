NODE_MODULES	= node_modules/.modules.yaml $(shell awk '/^ *-/ { print $$2 "/node_modules" }' pnpm-workspace.yaml)

all:	build

prepare:	$(NODE_MODULES)

$(NODE_MODULES):package.json */package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc
	pnpm install --frozen-lockfile
	touch $(NODE_MODULES)

build::	prepare
	$(MAKE) -C uri build-deps
	$(MAKE) -C uri-jdbc-protocol build-deps
	pnpm exec tsc --build --verbose

lint:
	-pnpm exec eslint '*/src/**/*.ts'

test::	build lint
	pnpm exec jest

clean::
	rm -rf coverage

distclean::
	rm -rf node_modules

version:	pristine
	pnpm exec changeset version
	pnpm install
	git commit --amend --reuse-message=HEAD pnpm-lock.yaml

publish:	pristine clean build test
	pnpm publish -r --access public
	GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=tag.gpgSign GIT_CONFIG_VALUE_0=true pnpm exec changeset tag

pristine:
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)

clean distclean::
	$(MAKE) -C commons $@
	$(MAKE) -C headers $@
	$(MAKE) -C uri $@
	$(MAKE) -C uri-image-parser $@
	$(MAKE) -C uri-jdbc-protocol $@
	$(MAKE) -C uri-mysql-protocol $@
	$(MAKE) -C uri-postgres-protocol $@
	$(MAKE) -C uri-sqlite-protocol $@
	$(MAKE) -C uri-tds-protocol $@
	$(MAKE) -C uri-x4e-parser $@
	$(MAKE) -C web-service $@
	$(MAKE) -C x4e $@

.PHONY:		all prepare build lint test clean distclean version publish pristine
