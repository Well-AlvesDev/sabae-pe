const PROFILE_PHOTO_DB_NAME = 'sabae-profile';
const PROFILE_PHOTO_STORE_NAME = 'profile-photo';
const PROFILE_PHOTO_KEY = 'current-user';

export interface ProfilePhotoData {
  dataUrl: string;
  scale: number;
  positionX: number;
  positionY: number;
}

const DEFAULT_PROFILE_PHOTO_DATA: Omit<ProfilePhotoData, 'dataUrl'> = {
  scale: 1,
  positionX: 0,
  positionY: 0,
};

function normalizeProfilePhotoData(value: unknown): ProfilePhotoData | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return {
      dataUrl: value,
      ...DEFAULT_PROFILE_PHOTO_DATA,
    };
  }

  if (value && typeof value === 'object' && 'dataUrl' in value && typeof (value as { dataUrl?: unknown }).dataUrl === 'string') {
    const photo = value as Partial<ProfilePhotoData>;

    return {
      dataUrl: photo.dataUrl!,
      scale: typeof photo.scale === 'number' ? photo.scale : DEFAULT_PROFILE_PHOTO_DATA.scale,
      positionX: typeof photo.positionX === 'number' ? photo.positionX : DEFAULT_PROFILE_PHOTO_DATA.positionX,
      positionY: typeof photo.positionY === 'number' ? photo.positionY : DEFAULT_PROFILE_PHOTO_DATA.positionY,
    };
  }

  return null;
}

function getIndexedDbFactory(): IDBFactory | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.indexedDB;
}

function openProfilePhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const indexedDb = getIndexedDbFactory();
    if (!indexedDb) {
      reject(new Error('indexedDB indisponível neste navegador.'));
      return;
    }

    const request = indexedDb.open(PROFILE_PHOTO_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROFILE_PHOTO_STORE_NAME)) {
        db.createObjectStore(PROFILE_PHOTO_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Não foi possível abrir o banco de fotos do perfil.'));
    };
  });
}

export async function getProfilePhoto(): Promise<ProfilePhotoData | null> {
  const indexedDb = getIndexedDbFactory();
  if (!indexedDb) {
    return null;
  }

  try {
    const db = await openProfilePhotoDb();
    return await new Promise<ProfilePhotoData | null>((resolve) => {
      const transaction = db.transaction(PROFILE_PHOTO_STORE_NAME, 'readonly');
      const store = transaction.objectStore(PROFILE_PHOTO_STORE_NAME);
      const request = store.get(PROFILE_PHOTO_KEY);

      request.onsuccess = () => {
        resolve(normalizeProfilePhotoData(request.result) ?? null);
      };

      request.onerror = () => {
        resolve(null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return null;
  }
}

export async function saveProfilePhoto(photoDataUrl: string, adjustments?: Partial<ProfilePhotoData>): Promise<void> {
  const indexedDb = getIndexedDbFactory();
  if (!indexedDb) {
    return;
  }

  try {
    const db = await openProfilePhotoDb();
    const payload = adjustments
      ? {
          dataUrl: photoDataUrl,
          scale: typeof adjustments.scale === 'number' ? adjustments.scale : DEFAULT_PROFILE_PHOTO_DATA.scale,
          positionX: typeof adjustments.positionX === 'number' ? adjustments.positionX : DEFAULT_PROFILE_PHOTO_DATA.positionX,
          positionY: typeof adjustments.positionY === 'number' ? adjustments.positionY : DEFAULT_PROFILE_PHOTO_DATA.positionY,
        }
      : photoDataUrl;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROFILE_PHOTO_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(PROFILE_PHOTO_STORE_NAME);
      const request = store.put(payload, PROFILE_PHOTO_KEY);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Não foi possível salvar a foto do perfil.'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    // ignore save failures to avoid breaking the profile page
  }
}

export async function clearProfilePhoto(): Promise<void> {
  const indexedDb = getIndexedDbFactory();
  if (!indexedDb) {
    return;
  }

  try {
    const db = await openProfilePhotoDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROFILE_PHOTO_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(PROFILE_PHOTO_STORE_NAME);
      const request = store.delete(PROFILE_PHOTO_KEY);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Não foi possível remover a foto do perfil.'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    // ignore delete failures to avoid breaking the profile page
  }
}
