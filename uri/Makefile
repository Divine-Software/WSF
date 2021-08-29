NAME		:= $(shell node -p 'require(`./package.json`).name')
VERSION		:= $(shell node -p 'require(`./package.json`).version')
BASENAME	:= $(notdir $(NAME))

all:		build

prepare:
	$(MAKE) -C .. $@

build:		prepare src/private/dbref.ts
	pnpm exec tsc --build

src/private/dbref.ts:	src/private/dbref.pegjs
	pnpm exec tspegjs $<

docs:	build
	rm -rf ../docs/$(BASENAME)
	pnpm exec typedoc --out ../docs/$(BASENAME) src/index.ts

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

.PHONY:		all prepare build docs test clean distclean publish
