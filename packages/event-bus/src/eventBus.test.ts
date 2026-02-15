import { test, describe } from 'node:test';
import assert from 'node:assert';
import { EventBus } from './eventBus.js';

describe('EventBus RPC', () => {
  test('registerService and call for successful RPC', async () => {
    const bus = new EventBus();
    const serviceName = 'calculator';
    
    bus.rpcService(serviceName, {
      add: (a: number, b: number) => a + b,
      multiply: (a: number, b: number) => a * b,
    });

    const sum = await bus.rpcCall<number>(serviceName, 'add', 5, 3);
    assert.strictEqual(sum, 8, 'Add operation should return correct sum');

    const product = await bus.rpcCall<number>(serviceName, 'multiply', 4, 2);
    assert.strictEqual(product, 8, 'Multiply operation should return correct product');
  });

  test('RPC error handling (service throws error)', async () => {
    const bus = new EventBus();
    const serviceName = 'errorService';
    const errorMessage = 'Internal Service Error';

    bus.rpcService(serviceName, {
      fail: () => {
        throw new Error(errorMessage);
      },
    });

    await assert.rejects(
      async () => {
        await bus.rpcCall(serviceName, 'fail');
      },
      (err: Error) => {
        assert.strictEqual(err.message, errorMessage);
        return true;
      },
      'Should reject with the error message thrown by service'
    );
  });

  test('async RPC methods', async () => {
    const bus = new EventBus();
    const serviceName = 'asyncService';
    
    bus.rpcService(serviceName, {
      delayedEcho: async (msg: string, delay: number) => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(msg), delay);
        });
      },
    });

    const start = Date.now();
    const delay = 50;
    const message = 'Hello Async';
    
    const result = await bus.rpcCall<string>(serviceName, 'delayedEcho', message, delay);
    const duration = Date.now() - start;

    assert.strictEqual(result, message, 'Should return the correct message');
    assert.ok(duration >= delay, 'Should wait for the async operation to complete');
  });
});
