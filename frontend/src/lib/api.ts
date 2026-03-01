const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

type JsonObject = Record<string, unknown>;

function buildApiUrl(route: string): string {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${apiBaseUrl}${normalizedRoute}`;
}

async function doFetch<TResponse>(
  route: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const response = await fetch(buildApiUrl(route), init);
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as JsonObject).error === "string"
        ? ((payload as JsonObject).error as string)
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as TResponse;
}

export type Coordinates = {
  lat: number;
  lon: number;
};

export type AnalyzePropertyRequest = {
  address?: string;
  url?: string;
  userNeeds: string;
};

export type AnalyzePropertyResponse = {
  message: string;
  sessionId: string;
};

export type SessionImageResult = {
  image_url: string;
  trigger_found: string[] | string | null;
  pixel_coordinates?: [number, number] | number[] | string | null;
};

export type SpecialtyResult = {
  category: string;
  findings: string;
};

export type PropertySession = {
  id: string;
  address: string;
  user_needs: string;
  status: "processing" | "completed" | "error" | string;
  accessibility_checklist?: string | null;
  image_results?: SessionImageResult[] | null;
  specialty_results?: SpecialtyResult[] | null;
  final_score?: number | null;
  final_summary?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type GetImagesRequest = {
  address?: string;
  url?: string;
};

export type GetImagesResponse = {
  imagesArray: string[];
  targetUrl: string;
};

export type ListFromListResponse = {
  analysis: string;
};

export async function analyzeProperty(
  body: AnalyzePropertyRequest,
): Promise<AnalyzePropertyResponse> {
  return doFetch<AnalyzePropertyResponse>("/api/analyzeProperty", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getSessionById(sessionId: string): Promise<PropertySession> {
  return doFetch<PropertySession>(
    `/api/evaluationUpdate/${encodeURIComponent(sessionId)}`,
  );
}

export async function getEvaluationUpdateById(
  evaluationId: string,
): Promise<PropertySession> {
  return doFetch<PropertySession>(
    `/api/evaluationUpdate/${encodeURIComponent(evaluationId)}`,
  );
}

export async function getEvaluationUpdate(
  evaluationId: string,
): Promise<PropertySession> {
  return getEvaluationUpdateById(evaluationId);
}

export async function getImages(
  body: GetImagesRequest,
): Promise<GetImagesResponse> {
  return doFetch<GetImagesResponse>("/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function checkAddress(address: string): Promise<GetImagesResponse> {
  return getImages({ address });
}

export async function listFromList(
  userNeeds: string,
): Promise<ListFromListResponse> {
  return doFetch<ListFromListResponse>("/api/listfromlist/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userNeeds }),
  });
}

export async function triggersFromImmage<TResponse = unknown>(
  body: JsonObject = {},
): Promise<TResponse> {
  return doFetch<TResponse>("/api/triggersFromImmage/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
