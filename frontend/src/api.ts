// Typed API client. Every server call goes through `api()` so auth and errors are handled once.

export type Me = { email: string; name: string; is_admin: boolean; demo_mode: boolean; email_live: boolean };
export type Option = { code: string; label: string };
export type Lookups = {
  request_types: Option[];
  job_numbers: Option[];
  cost_centers: Option[];
  vendor_categories: Option[];
  expense_types: Option[];
  currencies: string[];
  billing_types: string[];
  statuses: string[];
};

export type RequestSummary = {
  request_number: string;
  submitted_at: string;
  requester_name: string;
  requester_email: string;
  request_type: string;
  title: string;
  job_number: string;
  cost_center: string;
  vendor_name: string;
  expense_class: "OpEx" | "CapEx";
  amount: number;
  currency: string;
  needed_by: string | null;
  status: string;
  email_status: "Pending" | "Sent" | "Failed";
};

export type RequestDetail = RequestSummary & {
  department: string | null;
  job_description: string | null;
  cost_center_name: string | null;
  is_new_vendor: boolean;
  vendor_category: string;
  vendor_contact_name: string | null;
  vendor_contact_email: string | null;
  expense_type: string;
  capex_project_number: string | null;
  billing_type: string;
  start_date: string | null;
  end_date: string | null;
  is_budgeted: boolean;
  nda_in_place: boolean;
  vendor_data_access: boolean;
  description: string;
  email_error: string | null;
  email_sent_at: string | null;
  admin_notes: string | null;
  updated_at: string;
  attachments: { id: number; file_name: string; size_bytes: number; uploaded_at: string }[];
  history: { old_status: string | null; new_status: string; changed_by: string; changed_at: string; note: string | null }[];
};

export type LookupStatus = {
  counts: Record<string, number>;
  sheets: Record<string, string>;
  refreshes: { started_at: string; ok: boolean; source: string; message: string; triggered_by: string }[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });

  if (res.status === 401) {
    // Easy Auth session expired: send the user through SSO and back to this page.
    const back = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${back}`;
    throw new ApiError(401, "Signing you in…");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const detail = body?.detail;
    const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => d.msg).join("; ") : res.statusText;
    throw new ApiError(res.status, msg || "Request failed");
  }
  if (!isJson) throw new ApiError(res.status, "Unexpected response from server");
  return body as T;
}

export const getMe = () => api<Me>("/api/me");
export const getLookups = () => api<Lookups>("/api/lookups");
export const listRequests = (scope: "mine" | "all") => api<RequestSummary[]>(`/api/requests?scope=${scope}`);
export const getRequest = (n: string) => api<RequestDetail>(`/api/requests/${encodeURIComponent(n)}`);
export const submitRequest = (payload: object, files: File[]) => {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  files.forEach((f) => fd.append("files", f));
  return api<RequestDetail>("/api/requests", { method: "POST", body: fd });
};
export const updateStatus = (n: string, status: string, note: string) =>
  api<RequestDetail>(`/api/requests/${encodeURIComponent(n)}/status`, { method: "PATCH", body: JSON.stringify({ status, note: note || null }) });
export const updateNotes = (n: string, admin_notes: string) =>
  api<RequestDetail>(`/api/requests/${encodeURIComponent(n)}/notes`, { method: "PUT", body: JSON.stringify({ admin_notes }) });
export const resendEmail = (n: string) => api<RequestDetail>(`/api/requests/${encodeURIComponent(n)}/resend-email`, { method: "POST" });
export const getLookupStatus = () => api<LookupStatus>("/api/admin/lookups");
export const refreshLookups = () => api<LookupStatus>("/api/admin/lookups/refresh", { method: "POST" });
export const attachmentUrl = (n: string, id: number) => `/api/requests/${encodeURIComponent(n)}/attachments/${id}`;
