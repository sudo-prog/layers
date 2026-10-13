/**
 * Immich HTTP API client (no SDK dependency).
 *
 * Implements the minimal Immich v1.x API surface needed for LAYERS:
 * asset upload, search, thumbnail fetch, and album management.
 *
 * Uses the `x-api-key` header for authentication.
 */

export interface ImmichAsset {
  id: string;
  deviceAssetId: string;
  type: 'IMAGE' | 'VIDEO';
  createdAt: string;
  updatedAt: string;
  originalFileName: string;
  thumbhash: string;
  exifInfo?: Record<string, unknown>;
}

export interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export class ImmichClient {
  private readonly serverUrl: string;
  private readonly apiKey: string;

  constructor(serverUrl: string, apiKey: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, { ...options, method, headers });

    if (!response.ok) {
      throw new Error(`Immich API error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204 || response.status === 200) {
      const text = await response.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    }

    return response.json() as Promise<T>;
  }

  async uploadAsset(file: File | Blob, _deviceId: string): Promise<ImmichAsset> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<ImmichAsset>('/api/assets', {
      method: 'POST',
      body: formData,
    });
  }

  async getAsset(assetId: string): Promise<ImmichAsset | null> {
    try {
      return await this.request<ImmichAsset>(`/api/assets/${assetId}`);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.request<void>(`/api/assets/${assetId}`, {
      method: 'DELETE',
    });
  }

  async searchAssets(query: string): Promise<ImmichAsset[]> {
    return this.request<ImmichAsset[]>(`/api/assets/search?${query}`);
  }

  async getAssetThumbnail(assetId: string): Promise<Blob> {
    const url = `${this.serverUrl}/api/assets/${assetId}/thumbnail`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Immich API error: ${response.status} ${response.statusText}`);
    }

    return response.blob();
  }

  async listAlbums(): Promise<ImmichAlbum[]> {
    return this.request<ImmichAlbum[]>('/api/albums');
  }

  async addToAlbum(albumId: string, assetIds: string[]): Promise<void> {
    await this.request<void>(`/api/albums/${albumId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: assetIds }),
    });
  }
}
