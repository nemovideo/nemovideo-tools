import assert from 'node:assert/strict';

import { GatewayError } from '../src/core/client.js';
import {
  isRetryableRenderPollError,
  pollRenderStatus,
} from '../src/core/render.js';

async function testPollRetriesTransientFailure(): Promise<void> {
  const requestedRenderIds: string[] = [];
  const progressMessages: string[] = [];
  let attempt = 0;

  const result = await pollRenderStatus(
    'draft-cli-existing-task',
    (message) => progressMessages.push(message),
    {
      getStatus: async (renderId) => {
        requestedRenderIds.push(renderId);
        attempt += 1;
        if (attempt === 1) {
          throw new TypeError('fetch failed');
        }
        return {
          status: 'completed',
          outputUrl: 'https://static.example/render.mp4',
        };
      },
      sleep: async () => undefined,
    },
  );

  assert.deepEqual(requestedRenderIds, [
    'draft-cli-existing-task',
    'draft-cli-existing-task',
  ]);
  assert.equal(result.status, 'completed');
  assert.equal(result.output?.url, 'https://static.example/render.mp4');
  assert.match(progressMessages[0] ?? '', /retrying same task/i);
}

async function testTerminalFailureIsPreserved(): Promise<void> {
  await assert.rejects(
    pollRenderStatus('draft-cli-failed-task', undefined, {
      getStatus: async () => ({ status: 'failed', error: 'invalid draft' }),
      sleep: async () => undefined,
    }),
    /Render failed: invalid draft/,
  );
}

function testRetryClassification(): void {
  assert.equal(isRetryableRenderPollError(new TypeError('fetch failed')), true);
  assert.equal(isRetryableRenderPollError(new GatewayError(-1, 'upstream', 502)), true);
  assert.equal(isRetryableRenderPollError(new GatewayError(1010, 'unauthorized', 401)), false);
  assert.equal(isRetryableRenderPollError(new GatewayError(-1, 'bad request', 400)), false);
}

await testPollRetriesTransientFailure();
await testTerminalFailureIsPreserved();
testRetryClassification();
console.log('render polling regression tests passed');
