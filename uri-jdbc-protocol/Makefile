NAME		:= $(shell node -p 'require(`./package.json`).name')
VERSION		:= $(shell node -p 'require(`./package.json`).version')
BASENAME	:= $(notdir $(NAME))

all:		build

prepare:
	$(MAKE) -C .. $@

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

publish:	distclean build test
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)
	git tag -s $(BASENAME)-v$(VERSION) -m "$(NAME) v$(VERSION)"
	pnpm publish --access public

.PHONY:		all prepare build test clean distclean publish
