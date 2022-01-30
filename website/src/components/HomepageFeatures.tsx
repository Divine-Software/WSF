import useBaseUrl from '@docusaurus/useBaseUrl';
import React from 'react';
import clsx from 'clsx';
import styles from './HomepageFeatures.module.css';
import Link from '@docusaurus/Link';

type FeatureItem = {
  title: string;
  image?: string;
  href?: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Connect',
    href: 'docs/connect/',
    description: (
      <>
        Out of the box, local files and web resources are supported, plus several database protocols.
        Use the built-in <var>username/password</var> and <var>bearer token</var>&nbsp; authentication schemes,
        or provide your own.
      </>
    ),
  },
  {
    title: 'Parse',
    href: 'docs/parse/',
    description: (
      <>
        Effortlessly read and write any common formats, including CSV, JSON, TOML, YAML, XML
        and MIME multi-part messages.
      </>
    ),
  },
  {
    title: 'Query',
    href: 'docs/query/',
    description: (
      <>
        With database drivers for H2/JDBC, MySQL/MariaDB, PostgreSQL/CockroachDB, SQLite and SQL Server,
        persistence should not be a problem. Injection-safe queries, transactiton deadlock handling and
        CRUD row operations for less pain and more gain.
      </>
    ),
  },
  {
    title: 'Serve',
    href: 'docs/serve/',
    description: (
      <>
        Build advanced REST and streaming Web APIs with automatic content negotiation, ETag/precondition handling
        (coming soon).
      </>
    ),
  },
];

const ModuleList: FeatureItem[] = [
  {
    title: '@divine/headers',
    href: 'docs/api/modules/divine_headers',
    description: (
      <>
        Parse and generate common HTTP headers, such as authorization and content headers. This module also works in
        the browser!
      </>
    ),
  },
  {
    title: '@divine/uri',
    href: 'docs/api/modules/divine_uri',
    description: (
      <>
        Read, write, modify, query or watch anything that can be referenced by an URL or URI, including local files,
        Web Services and SQL databases.
      </>
    ),
  },
  {
    title: '@divine/web-service',
    href: 'docs/api/modules/divine_web_service',
    description: (
      <>
        A framework for building REST and RPC Web Services, with support for event streams.
      </>
    ),
  },
  {
    title: '@divine/x4e',
    href: 'docs/api/modules/divine_x4e',
    description: (
      <>
        A powerful, E4X-like approach to HTML and XML documents, using JSX/TSX or tagged template literals.
      </>
    ),
  },
];

function Feature({title, image, href, description}: FeatureItem) {
  return (
    <div className={clsx('col col--3', 'position--relative')}>
      { !!href && <Link href={href} className="div-link"></Link> }
      { !!image &&
      <div className="text--center">
        <img
          className={styles.featureSvg}
          alt={title}
          src={useBaseUrl(image)}
        />
      </div>
      }
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
        <hr></hr>
        <div className="row">
          {ModuleList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
