// ── Credentials Module Exports ──────────────────────────────────

export {
  // Types
  CredentialProvider,
  CredentialSourceType,
  CredentialEntry,
  CredentialPool,
  CredentialSource,
  CredentialConfig,
  LoadBalancingStrategy,
  KeyHealthStatus,
  DEFAULT_CREDENTIAL_CONFIG,
  PROVIDER_ENV_MAP,
  maskKey,
  generateCredentialId,
} from './types';

export {
  // Credential Pool
  CredentialPoolManager,
  createCredentialPool,
} from './pool';

export {
  // Credential Sources
  getCredentialSource,
  getAvailableSources,
  loadAllCredentials,
} from './sources';

export {
  // Encrypted Persistence
  CredentialPersistence,
  createCredentialPersistence,
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  getMachineIdentifier,
} from './persistence';
