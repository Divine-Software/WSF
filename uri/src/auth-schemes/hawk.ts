import { PasswordCredentials } from '../auth-schemes';

export interface HawkCredentials extends PasswordCredentials {
    algorithm: 'sha1' | 'sha256';
}
