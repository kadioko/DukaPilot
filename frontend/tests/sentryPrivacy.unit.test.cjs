const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function initialize(file) {
  let options;
  const sentry = {
    init(value) { options = value; },
    replayIntegration(value) { return { value }; },
    captureRouterTransitionStart() {},
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(javascript, {
    require(name) { assert.equal(name, '@sentry/nextjs'); return sentry; },
    exports: {},
    process: { env: { NODE_ENV: 'test', SENTRY_DSN: 'https://public@example.invalid/1', NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1' } },
  });
  return options;
}

for (const file of ['instrumentation-client.ts', 'sentry.server.config.ts']) {
  test(`${file} disables sensitive automatic collection`, () => {
    const data = initialize(file).dataCollection;
    assert.equal(data.userInfo, false);
    assert.equal(data.cookies, false);
    assert.equal(data.httpHeaders.request, false);
    assert.equal(data.httpHeaders.response, false);
    assert.equal(data.httpBodies.length, 0);
    assert.equal(data.urlQueryParams, false);
    assert.equal(data.genAI.inputs, false);
    assert.equal(data.genAI.outputs, false);
    assert.equal(data.databaseQueryData, false);
    assert.equal(data.queues, false);
    assert.equal(data.graphQL.document, false);
    assert.equal(data.graphQL.variables, false);
  });
}

test('browser replay remains masked and injected Android bridge errors remain filtered', () => {
  const options = initialize('instrumentation-client.ts');
  assert.equal(options.integrations[0].value.maskAllText, true);
  assert.equal(options.integrations[0].value.blockAllMedia, true);
  const injected = { exception: { values: [{ value: 'Error invoking postMessage: Java object is gone', stacktrace: { frames: [{ filename: 'app://navigation_performance_logger_android' }] } }] } };
  assert.equal(options.beforeSend(injected), null);
  const normal = { exception: { values: [{ value: 'normal error' }] } };
  assert.equal(options.beforeSend(normal), normal);
});
