export function within<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    const finish = (value: T | F) => {
      clearTimeout(timer);
      resolve(value);
    };
    promise.then(finish, () => finish(fallback));
  });
}
