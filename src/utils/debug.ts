import createDebug from 'debug';

export const debug = {
  api: createDebug('mimo:api'),
  agent: createDebug('mimo:agent'),
  tool: createDebug('mimo:tool'),
  config: createDebug('mimo:config'),
  memory: createDebug('mimo:memory'),
  security: createDebug('mimo:security'),
  dispatch: createDebug('mimo:dispatch'),
  compress: createDebug('mimo:compress'),
  session: createDebug('mimo:session'),
  feature: createDebug('mimo:feature'),
  workflow: createDebug('mimo:workflow'),
  plugin: createDebug('mimo:plugin'),
  i18n: createDebug('mimo:i18n'),
};
