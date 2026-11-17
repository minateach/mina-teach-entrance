const databaseName = "mina-teach-assistant-images";
const storeName = "attachments";
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser cannot save image attachments locally."));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Local image storage is unavailable."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Close other Mina Teach tabs and try saving the image again."));
    };
  });
  return databasePromise;
}

export async function saveLocalImage(id, blob, name = "image.jpg") {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({
      id,
      blob,
      name: String(name).slice(0, 180),
      savedAt: new Date().toISOString(),
    });
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("The image could not be saved on this device."));
    transaction.onabort = () => reject(transaction.error || new Error("The image could not be saved on this device."));
  });
}

export async function getLocalImage(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("The saved image could not be loaded."));
  });
}
