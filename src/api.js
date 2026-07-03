const jsonHeaders = { "Content-Type": "application/json" };

export async function apiGet(path, params = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return request(url.pathname + url.search);
}

export async function apiPost(path, body) {
  return request(path, { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) });
}

export async function apiPut(path, body) {
  return request(path, { method: "PUT", headers: jsonHeaders, body: JSON.stringify(body) });
}

export async function apiDelete(path) {
  const response = await fetch(path, { method: "DELETE" });
  if (!response.ok) throw new Error(await errorMessage(response));
  if (response.status === 204) return null;
  return response.json();
}

export async function uploadExcel(file, { mode = "replace", ledgerId, ledgerName } = {}) {
  const form = new FormData();
  form.append("file", file);
  const params = new URLSearchParams({ mode });
  if (ledgerName) params.set("ledgerName", ledgerName);
  if (ledgerId) params.set("ledgerId", ledgerId);
  const response = await fetch(`/api/import/excel?${params}`, { method: "POST", body: form });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

async function errorMessage(response) {
  try {
    const payload = await response.json();
    return payload.error || response.statusText;
  } catch {
    return response.statusText;
  }
}
