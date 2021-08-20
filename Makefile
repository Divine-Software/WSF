all:	build

prepare:
	yarn

build::	prepare
	yarn run tsc --build

docs::	build

test::	build
	yarn run jest

clean::
	rm -rf coverage

distclean::
	rm -rf node_modules

docs clean distclean::
	$(MAKE) -C headers $@
	$(MAKE) -C uri $@
	$(MAKE) -C uri-image-parser $@
	$(MAKE) -C uri-postgres-protocol $@
	$(MAKE) -C uri-x4e-parser $@
	$(MAKE) -C web-service $@
	$(MAKE) -C x4e $@

.PHONY:		all prepare build docs test clean distclean
