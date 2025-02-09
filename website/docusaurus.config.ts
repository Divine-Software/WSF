import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import type { PluginOptions } from 'docusaurus-plugin-typedoc';
import { themes as prismThemes } from 'prism-react-renderer';
import type { TypeDocOptions } from 'typedoc';
import { parse as yamlParse } from 'yaml';
import { readFileSync } from 'fs';

const config: Config = {
  title: 'The Divine Web Service Framework',
  tagline: 'A divine collection of awesome web-related Node.js modules',
  favicon: 'img/favicon.png',

  url: 'https://divine-software.github.io/',
  baseUrl: '/WSF/',
  projectName: 'WSF',
  trailingSlash: true,

  onBrokenAnchors: 'warn',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  onDuplicateRoutes: 'throw',
  organizationName: 'Divine-Software',

  future: {
    experimental_faster: true,
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    format: 'detect',
  },

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true
      }
    },
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
          position: 'left'
        },
        {
          type: 'doc',
          docId: 'intro',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/Divine-Software/WSF',
          'aria-label': 'Fork me on GitHub!',
          className: 'header-github-link',
          position: 'right',
        },
      ],
      hideOnScroll: false,
    },
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
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    algolia: {
      appId: 'XMAD25WICF',
      apiKey: '1076277ef839336ff30f0c27fc348a69',
      indexName: 'divine-web-service',
    }
  } satisfies Preset.ThemeConfig,
  plugins: [
    [
      'docusaurus-plugin-typedoc', {
        entryPointStrategy: "packages",
        entryPoints: yamlParse(readFileSync('../pnpm-workspace.yaml').toString()).packages.map((pkg) => `../${pkg}`),
        excludePrivate: true,
        excludeInternal: true,
        excludeExternals: true,

        tsconfig: '../tsconfig.json',
        watch: typeof process !== 'undefined' && process.env.TYPEDOC_WATCH === 'true',
        readme: 'none',
        disableSources: true,
        membersWithOwnFile: ['Enum', 'Class', 'Interface' ],

        classPropertiesFormat: 'htmlTable',
        enumMembersFormat: 'htmlTable',
        interfacePropertiesFormat: 'htmlTable',
        parametersFormat: 'htmlTable',
        propertyMembersFormat: 'htmlTable',
        typeDeclarationFormat: 'htmlTable',
      } satisfies Partial<PluginOptions & TypeDocOptions>,
    ],
  ],
  presets: [
    [
      'classic', {
        docs: {
          sidebarPath: './sidebars.ts',
          sidebarItemsGenerator: async function({ defaultSidebarItemsGenerator, ...args }) {
            const typedocSidebar = await import('./docs/api/typedoc-sidebar.cjs');

            return (await defaultSidebarItemsGenerator(args)).map((item) =>
              item.type === 'category' && 'id' in item.link && item.link.id === 'api/index'
                ? { ...item, label: 'Framework APIs', items: typedocSidebar }
                : item
            );
          },
          editUrl: 'https://github.com/Divine-Software/WSF/tree/master/website/',
        },
        blog: {
          showReadingTime: true,
          editUrl: 'https://github.com/Divine-Software/WSF/tree/master/website/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        gtag: {
          trackingID: 'G-46S2DN7V61',
        },
      } satisfies Preset.Options,
    ],
  ],
};

export default config;

