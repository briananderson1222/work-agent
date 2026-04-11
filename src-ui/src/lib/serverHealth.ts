export function checkServerHealth(url: string): Promise<boolean> {
  return fetch(`${url}/api/system/status`)
    .then((response) => response.ok)
    .catch(() => false);
}
