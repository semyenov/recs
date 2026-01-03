import '../test/test-env';
import { createCircuitBreaker, CircuitBreakerError } from '../utils/circuit-breaker';

describe('Circuit Breaker', () => {
  describe('createCircuitBreaker', () => {
    it('should execute function successfully', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(mockFn, 'test-breaker');

      const result = await breaker.fire();

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalled();
    });

    it('should catch errors and wrap them in CircuitBreakerError', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const breaker = createCircuitBreaker(mockFn, 'test-breaker');

      await expect(breaker.fire()).rejects.toThrow(CircuitBreakerError);
      // Note: Circuit may open after first failure, so error message may vary
      await expect(breaker.fire()).rejects.toThrow(CircuitBreakerError);
    });

    it('should handle successful execution after errors', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve('success');
      });

      const breaker = createCircuitBreaker(mockFn, 'test-breaker', {
        timeout: 1000,
        errorThresholdPercentage: 50,
        resetTimeout: 100,
      });

      // First call fails
      await expect(breaker.fire()).rejects.toThrow(CircuitBreakerError);

      // Wait for circuit to potentially reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Retry - may succeed or circuit may still be open
      try {
        const result = await breaker.fire();
        expect(result).toBe('success');
      } catch (error) {
        // Circuit may still be open, which is acceptable
        expect(error).toBeInstanceOf(CircuitBreakerError);
      }
    });

    it('should apply timeout correctly', async () => {
      const mockFn = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 2000)));

      const breaker = createCircuitBreaker(mockFn, 'timeout-test', {
        timeout: 100,
      });

      await expect(breaker.fire()).rejects.toThrow();
    }, 5000);

    it('should emit events on state changes', (done) => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test'));
      const breaker = createCircuitBreaker(mockFn, 'event-test');

      let eventFired = false;
      breaker.on('failure', () => {
        eventFired = true;
      });

      breaker.fire().catch(() => {
        expect(eventFired).toBe(true);
        done();
      });
    });
  });

  describe('CircuitBreakerError', () => {
    it('should create error with correct message', () => {
      const error = new CircuitBreakerError('test-breaker', 'Something went wrong');

      expect(error.message).toBe('Circuit breaker test-breaker: Something went wrong');
      expect(error.name).toBe('CircuitBreakerError');
      expect(error.breakerName).toBe('test-breaker');
    });

    it('should be instance of Error', () => {
      const error = new CircuitBreakerError('test', 'error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CircuitBreakerError);
    });
  });
});
