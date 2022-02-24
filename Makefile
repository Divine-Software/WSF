SUB_PACKAGES	= $(shell awk '/^ *-/ { print $$2 }' pnpm-workspace.yaml)
NODE_MODULES	= node_modules/.modules.yaml $(foreach package,$(SUB_PACKAGES),$(package)/node_modules)

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

commit:
	pnpm changeset

release:	pristine
	pnpm exec changeset version
	pnpm install
	git commit --amend --reuse-message=HEAD pnpm-lock.yaml

publish:	pristine clean build test
	pnpm publish -r --access public
	GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=tag.gpgSign GIT_CONFIG_VALUE_0=true pnpm exec changeset tag

pristine:
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)

clean distclean::
	@for package in $(SUB_PACKAGES); do echo "► $${package} ► $@"; $(MAKE) -C $${package} $@; done

.PHONY:		all prepare build lint test clean distclean commit release publish pristine
