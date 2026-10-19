/**
 * Optional AI image-to-3D (Meshy, https://docs.meshy.ai). Turned on by setting MESHY_API_KEY.
 * The CRM's "Photo → 3D" uses it for full-geometry models; without a key the CRM builds the model
 * on the device from the photo's vector outline instead.
 */
import { env } from "../env.js";

const BASE = "https://api.meshy.ai/openapi/v1/image-to-3d";

export const meshyEnabled = () => !!env.MESHY_API_KEY;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.MESHY_API_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `3D service error (${res.status})`);
  return body as T;
}

/** Start a task from an image (https URL or data: URI). Returns the task id. */
export async function startImageTo3D(imageUrl: string): Promise<string> {
  const r = await call<{ result: string }>("", {
    method: "POST",
    body: JSON.stringify({
      image_url: imageUrl,
      should_texture: true,
      enable_pbr: true,          // metallic / roughness maps — matters for gold
      should_remesh: true,
      target_polycount: 60000,   // fine enough for prongs and settings
      remove_lighting: true,
      target_formats: ["glb"],
    }),
  });
  return r.result;
}

export interface MeshyTask {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED" | string;
  progress: number;
  model_urls?: { glb?: string };
  task_error?: { message?: string };
}

export const getTask = (id: string) => call<MeshyTask>(`/${encodeURIComponent(id)}`);

export async function downloadGlb(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download the model (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString("latin1") !== "glTF") throw new Error("The 3D service didn't return a .glb file");
  return buf;
}
