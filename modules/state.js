const STORAGE_KEY = "private-almanac-ui-v1";
const EMPTY_STATE = Object.freeze({ favorites: [], read: [] });

function clean(value) {
  const object = value && typeof value === "object" ? value : {};
  return {
    favorites: Array.isArray(object.favorites)
      ? [...new Set(object.favorites.filter((item) => typeof item === "string"))]
      : [],
    read: Array.isArray(object.read)
      ? [...new Set(object.read.filter((item) => typeof item === "string"))]
      : []
  };
}

export function createLocalState(storage = null) {
  let memory = { ...EMPTY_STATE };
  let available = false;

  try {
    if (storage) {
      const existing = storage.getItem(STORAGE_KEY);
      memory = existing ? clean(JSON.parse(existing)) : { ...EMPTY_STATE };
      storage.setItem(STORAGE_KEY, JSON.stringify(memory));
      available = true;
    }
  } catch {
    memory = { ...EMPTY_STATE };
    available = false;
  }

  return {
    available,
    read() {
      return clean(memory);
    },
    write(next) {
      memory = clean(next);
      if (available) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(memory));
        } catch {
          available = false;
        }
      }
      return clean(memory);
    },
    clear() {
      memory = { ...EMPTY_STATE };
      if (available) {
        try {
          storage.removeItem(STORAGE_KEY);
        } catch {
          available = false;
        }
      }
      return clean(memory);
    }
  };
}
