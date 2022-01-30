/**
 * The [[URI]] module includes [[DBDriver]] and [[Parser]].
 *
 * @module
 */

export * from './auth-schemes';
export * from './auth-schemes/basic';
export * from './auth-schemes/bearer';
export * from './auth-schemes/hawk';
export * from './encoders';
export * from './file-utils';
export * from './parsers';
export * from './parsers/csv';
export * from './parsers/event-stream';
export * from './parsers/forms';
export * from './parsers/json';
export * from './parsers/toml';
export * from './parsers/yaml';
export * from './protocols/cache';
export * from './protocols/database';
export * from './protocols/file';
export * from './protocols/http';
export * from './uri';

export * as DBDriver from './database-driver';

// Register all built-in auth-schemes
import './auth-schemes/basic';
import './auth-schemes/bearer';

// Register all built-in protocols
import './protocols/cache';
import './protocols/file';
import './protocols/http';

// Register all built-in parsers
import './parsers';
import './parsers/csv';
import './parsers/event-stream';
import './parsers/forms';
