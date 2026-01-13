// Knowledge errors tests

import { describe, it, expect } from 'vitest';
import { APIError, NetworkError, handleAPIResponse } from './errors';

describe('APIError', () => {
  it('should create APIError with all parameters', () => {
    const error = new APIError('Test error', 500, 'INTERNAL_ERROR', { code: 'TEST123' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(APIError);
    expect(error.name).toBe('APIError');
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.errorCode).toBe('INTERNAL_ERROR');
    expect(error.details).toEqual({ code: 'TEST123' });
  });

  it('should create APIError without optional parameters', () => {
    const error = new APIError('Test error', 404);

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(404);
    expect(error.errorCode).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  describe('isRetryable', () => {
    it('should return true for 5xx errors', () => {
      expect(new APIError('Error', 500).isRetryable).toBe(true);
      expect(new APIError('Error', 502).isRetryable).toBe(true);
      expect(new APIError('Error', 503).isRetryable).toBe(true);
      expect(new APIError('Error', 504).isRetryable).toBe(true);
    });

    it('should return true for 429 rate limit errors', () => {
      expect(new APIError('Rate limited', 429).isRetryable).toBe(true);
    });

    it('should return false for 4xx client errors except 429', () => {
      expect(new APIError('Error', 400).isRetryable).toBe(false);
      expect(new APIError('Error', 401).isRetryable).toBe(false);
      expect(new APIError('Error', 403).isRetryable).toBe(false);
      expect(new APIError('Error', 404).isRetryable).toBe(false);
    });

    it('should return false for 2xx success codes', () => {
      expect(new APIError('Error', 200).isRetryable).toBe(false);
      expect(new APIError('Error', 201).isRetryable).toBe(false);
    });
  });

  describe('isClientError', () => {
    it('should return true for 4xx errors', () => {
      expect(new APIError('Error', 400).isClientError).toBe(true);
      expect(new APIError('Error', 401).isClientError).toBe(true);
      expect(new APIError('Error', 403).isClientError).toBe(true);
      expect(new APIError('Error', 404).isClientError).toBe(true);
      expect(new APIError('Error', 429).isClientError).toBe(true);
    });

    it('should return false for non-4xx errors', () => {
      expect(new APIError('Error', 200).isClientError).toBe(false);
      expect(new APIError('Error', 399).isClientError).toBe(false);
      expect(new APIError('Error', 500).isClientError).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should return true for 5xx errors', () => {
      expect(new APIError('Error', 500).isServerError).toBe(true);
      expect(new APIError('Error', 502).isServerError).toBe(true);
      expect(new APIError('Error', 503).isServerError).toBe(true);
    });

    it('should return false for non-5xx errors', () => {
      expect(new APIError('Error', 400).isServerError).toBe(false);
      expect(new APIError('Error', 499).isServerError).toBe(false);
      expect(new APIError('Error', 200).isServerError).toBe(false);
    });
  });
});

describe('NetworkError', () => {
  it('should create NetworkError with message only', () => {
    const error = new NetworkError('Network failed');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.name).toBe('NetworkError');
    expect(error.message).toBe('Network failed');
    expect(error.cause).toBeUndefined();
  });

  it('should create NetworkError with cause', () => {
    const cause = new Error('Connection timeout');
    const error = new NetworkError('Network failed', cause);

    expect(error.message).toBe('Network failed');
    expect(error.cause).toBe(cause);
    expect(error.cause?.message).toBe('Connection timeout');
  });
});

describe('handleAPIResponse', () => {
  it('should not throw for successful response (2xx)', async () => {
    const response = new Response(null, { status: 200 });

    await expect(handleAPIResponse(response)).resolves.not.toThrow();
  });

  it('should not throw for 201 created', async () => {
    const response = new Response(null, { status: 201 });

    await expect(handleAPIResponse(response)).resolves.not.toThrow();
  });

  it('should throw APIError for 4xx errors', async () => {
    const response = new Response(null, { status: 404, statusText: 'Not Found' });

    await expect(handleAPIResponse(response)).rejects.toThrow(APIError);
  });

  it('should throw APIError for 5xx errors', async () => {
    const response = new Response(null, { status: 500, statusText: 'Internal Server Error' });

    await expect(handleAPIResponse(response)).rejects.toThrow(APIError);
  });

  it('should parse error message from detail field', async () => {
    const errorBody = JSON.stringify({ detail: 'Custom error message' });
    const response = new Response(errorBody, {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      await handleAPIResponse(response);
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe('Custom error message');
      expect((error as APIError).statusCode).toBe(400);
    }
  });

  it('should parse error message from message field', async () => {
    const errorBody = JSON.stringify({ message: 'Error message' });
    const response = new Response(errorBody, {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      await handleAPIResponse(response);
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe('Error message');
    }
  });

  it('should parse error message from error field', async () => {
    const errorBody = JSON.stringify({ error: 'Error text' });
    const response = new Response(errorBody, {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      await handleAPIResponse(response);
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe('Error text');
    }
  });

  it('should use default message when JSON parsing fails', async () => {
    const response = new Response('Not JSON', {
      status: 500,
      statusText: 'Internal Server Error',
    });

    try {
      await handleAPIResponse(response, 'Custom default message');
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe('Custom default message');
    }
  });

  it('should use default message when response body is empty', async () => {
    const response = new Response(null, { status: 500 });

    try {
      await handleAPIResponse(response, 'Default error');
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe('Default error');
    }
  });

  it('should use built-in default message when no custom default provided', async () => {
    const response = new Response(null, { status: 500 });

    try {
      await handleAPIResponse(response);
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe('API request failed');
    }
  });

  it('should include error details in APIError', async () => {
    const errorData = {
      detail: 'Validation failed',
      field: 'email',
      code: 'INVALID_EMAIL',
    };
    const response = new Response(JSON.stringify(errorData), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      await handleAPIResponse(response);
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).details).toEqual(errorData);
      expect((error as APIError).details?.field).toBe('email');
    }
  });

  it('should handle 429 rate limit errors', async () => {
    const response = new Response(JSON.stringify({ detail: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      await handleAPIResponse(response);
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).statusCode).toBe(429);
      expect((error as APIError).isRetryable).toBe(true);
    }
  });

  it('should handle 401 unauthorized errors', async () => {
    const response = new Response(JSON.stringify({ detail: 'Unauthorized' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      await handleAPIResponse(response);
      expect.fail('Should have thrown APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).statusCode).toBe(401);
      expect((error as APIError).isClientError).toBe(true);
      expect((error as APIError).isRetryable).toBe(false);
    }
  });
});
