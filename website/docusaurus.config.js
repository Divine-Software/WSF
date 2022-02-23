// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');
const yaml = require('yaml');
const { readFileSync } = require('fs');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'The Divine Web Service Framework',
  tagline: 'A divine collection of awesome web-related Node.js modules',
  url: 'https://divine-software.github.io/',
  baseUrl: '/WSF/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  favicon: 'img/favicon.png',
  organizationName: 'Divine-Software',
  projectName: 'WSF',
  trailingSlash: true,
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Divine WSF',
        logo: {
          alt: 'The Divine Web Service Framework',
          src: 'img/logo.png',
        },
        items: [
          {
            to: 'blog/',
            label: 'News',
            position: 'left'},
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: 'https://github.com/Divine-Software/WSF',
            label: 'Fork me on GitHub!',
            position: 'right',
          },
        ],
        hideOnScroll: false,
      },
      hideableSidebar: true,
      footer: {
        style: 'dark',
        links: [
          {
            title: 'More Divine Software™',
            items: [
              {
                label: 'Ghostly',
                href: 'https://divine-software.github.io/ghostly/',
              },
              {
                label: 'Synchronization Library',
                to: 'https://github.com/Divine-Software/divine-synchronization',
              },
              {
                label: 'Syslog Console',
                href: 'https://github.com/Divine-Software/sysconsole',
              },
            ],
          },
          {
            title: 'Projects we ❤️',
            items: [
              {
                label: 'CockroachDB',
                href: 'https://www.cockroachlabs.com/',
              },
              {
                label: 'Knative',
                href: 'https://knative.dev/',
              },
              /*{
                label: 'TypeDoc',
                href: 'https://typedoc.org/',
              },*/
              {
                label: 'TypeScript',
                href: 'https://www.typescriptlang.org//',
              },
            ],
          },
          {
            title: 'Get in touch',
            items: [
              {
                label: 'Ask a question',
                href: 'https://github.com/Divine-Software/WSF/discussions'
              },
              {
                label: 'Contribute code or docs',
                href: 'https://github.com/Divine-Software/WSF/pulls'
              },
              {
                label: 'Report an issue',
                href: 'https://github.com/Divine-Software/WSF/issues'
              },
            ]
          },
        ],
        copyright: `Copyright © 2007-${new Date().getFullYear()} Martin Blom. A Divine Software™ production.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
  plugins: [
    [
      'docusaurus-plugin-typedoc', {
        entryPointStrategy: "packages",
        entryPoints: yaml.parse(readFileSync('../pnpm-workspace.yaml').toString()).packages.map((pkg) => `../${pkg}`),
        excludePrivate: true,
        excludeInternal: true,
        tsconfig: '../tsconfig.json',
        watch: typeof process !== 'undefined' && process.env.TYPEDOC_WATCH === 'true',
        readme: 'none',
        sidebar: {
          categoryLabel: 'Framework APIs',
          fullNames: false,
          position: 10,
          sidebarFile: null,
        },
      },
    ],
  ],
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/Divine-Software/WSF/tree/master/website/',
        },
        blog: {
          showReadingTime: true,
          editUrl:
            'https://github.com/Divine-Software/WSF/tree/master/website/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],
};

module.exports = config;
