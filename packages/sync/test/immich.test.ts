import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImmichClient, type ImmichAsset, type ImmichAlbum } from '../src/immich';

// ── Helpers ────────────────────────────────────────────────────────────────

const API_URL = 'https://immich.example.com';
const API_KEY = 'test-api-key';

function makeAsset(override: Partial<ImmichAsset> = {}): ImmichAsset {
  return {
    id: 'asset-1',
    deviceAssetId: 'device-asset-1',
    type: 'IMAGE',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    originalFileName: 'photo.jpg',
    thumbhash: 'thumbhash123',
    exifInfo: { make: 'Canon', model: 'EOS R5' },
    ...override,
  };
}

function makeAlbum(override: Partial<ImmichAlbum> = {}): ImmichAlbum {
  return {
    id: 'album-1',
    albumName: 'My Album',
    assetCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...override,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ImmichClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: ImmichClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new ImmichClient(API_URL, API_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('uploadAsset', () => {
    it('uploads a file as multipart form data', async () => {
      fetchMock.mockResolvedValue(
        Response.json(makeAsset()),
      );

      const file = new File(['binary-data'], 'photo.jpg', { type: 'image/jpeg' });
      const result = await client.uploadAsset(file, 'device-1');

      expect(result.id).toBe('asset-1');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/assets`);
      expect(options.method).toBe('POST');
      expect(options.headers['x-api-key']).toBe(API_KEY);
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('includes the file in the form data', async () => {
      fetchMock.mockResolvedValue(Response.json(makeAsset()));

      const file = new File(['data'], 'test.png', { type: 'image/png' });
      await client.uploadAsset(file, 'device-1');

      const formData = fetchMock.mock.calls[0][1].body as FormData;
      expect(formData.get('file')).toBeInstanceOf(File);
    });

    it('throws on server error', async () => {
      fetchMock.mockResolvedValue(
        new Response('Server error', { status: 500 }),
      );

      const file = new File(['data'], 'photo.jpg');
      await expect(client.uploadAsset(file, 'device-1')).rejects.toThrow();
    });
  });

  describe('getAsset', () => {
    it('fetches an asset by id', async () => {
      const asset = makeAsset({ id: 'asset-42' });
      fetchMock.mockResolvedValue(Response.json(asset));

      const result = await client.getAsset('asset-42');

      expect(result).toEqual(asset);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/assets/asset-42`);
      expect(options.method).toBe('GET');
      expect(options.headers['x-api-key']).toBe(API_KEY);
    });

    it('returns null for 404', async () => {
      fetchMock.mockResolvedValue(
        new Response('Not found', { status: 404 }),
      );
      expect(await client.getAsset('missing')).toBeNull();
    });
  });

  describe('deleteAsset', () => {
    it('sends DELETE request', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await client.deleteAsset('asset-1');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/assets/asset-1`);
      expect(options.method).toBe('DELETE');
      expect(options.headers['x-api-key']).toBe(API_KEY);
    });

    it('throws on error', async () => {
      fetchMock.mockResolvedValue(
        new Response('Forbidden', { status: 403 }),
      );
      await expect(client.deleteAsset('asset-1')).rejects.toThrow();
    });
  });

  describe('searchAssets', () => {
    it('searches with query parameter', async () => {
      const assets = [makeAsset({ id: 'a1' }), makeAsset({ id: 'a2' })];
      fetchMock.mockResolvedValue(Response.json(assets));

      const results = await client.searchAssets('vacation');

      expect(results).toHaveLength(2);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/assets/search?vacation`);
    });

    it('returns empty array for no results', async () => {
      fetchMock.mockResolvedValue(Response.json([]));
      const results = await client.searchAssets('nothing');
      expect(results).toEqual([]);
    });
  });

  describe('getAssetThumbnail', () => {
    it('fetches thumbnail blob', async () => {
      const thumbnailBlob = new Blob(['thumb-data'], { type: 'image/jpeg' });
      fetchMock.mockResolvedValue(new Response(thumbnailBlob));

      const result = await client.getAssetThumbnail('asset-1');

      expect(result).toBeInstanceOf(Blob);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/assets/asset-1/thumbnail`);
      expect(options.method).toBe('GET');
      expect(options.headers['x-api-key']).toBe(API_KEY);
    });
  });

  describe('listAlbums', () => {
    it('fetches all albums', async () => {
      const albums = [makeAlbum({ id: 'album-1' }), makeAlbum({ id: 'album-2' })];
      fetchMock.mockResolvedValue(Response.json(albums));

      const results = await client.listAlbums();

      expect(results).toHaveLength(2);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/albums`);
      expect(options.method).toBe('GET');
      expect(options.headers['x-api-key']).toBe(API_KEY);
    });
  });

  describe('addToAlbum', () => {
    it('adds assets to an album', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

      await client.addToAlbum('album-1', ['asset-1', 'asset-2']);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/albums/album-1/assets`);
      expect(options.method).toBe('POST');
      expect(options.headers['x-api-key']).toBe(API_KEY);

      const body = JSON.parse(options.body as string);
      expect(body).toEqual({ ids: ['asset-1', 'asset-2'] });
    });

    it('throws on error', async () => {
      fetchMock.mockResolvedValue(
        new Response('Bad request', { status: 400 }),
      );
      await expect(client.addToAlbum('album-1', ['asset-1'])).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('throws on network failure', async () => {
      fetchMock.mockRejectedValue(new TypeError('Network error'));
      await expect(client.getAsset('asset-1')).rejects.toThrow('Network error');
    });

    it('handles non-JSON error responses gracefully', async () => {
      fetchMock.mockResolvedValue(
        new Response('Service Unavailable', { status: 503 }),
      );
      await expect(client.getAsset('asset-1')).rejects.toThrow();
    });
  });

  describe('API key security', () => {
    it('never logs the API key', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const consoleDebugSpy = vi.spyOn(console, 'debug');
      const consoleErrorSpy = vi.spyOn(console, 'error');
      fetchMock.mockResolvedValue(Response.json(makeAsset()));

      await client.getAsset('asset-1');

      const allLogs = [
        ...consoleSpy.mock.calls.map((c) => c.join(' ')),
        ...consoleDebugSpy.mock.calls.map((c) => c.join(' ')),
        ...consoleErrorSpy.mock.calls.map((c) => c.join(' ')),
      ].join(' ');
      expect(allLogs).not.toContain(API_KEY);

      consoleSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
