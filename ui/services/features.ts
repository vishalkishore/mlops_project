// services.ts
import axios, { AxiosInstance, AxiosResponse } from "axios";

const defaultBackendUrl = "/api";

const api: AxiosInstance = axios.create({
  baseURL: (import.meta as any).env?.VITE_BACKEND_URL ?? defaultBackendUrl,
  headers: {
    // Adjust content type per route if needed
    "Content-Type": "application/json",
  },
  timeout: 60_000,
});

// Uniform result type
export type ApiResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

// Generic POST wrapper
async function post<T = any>(path: string, body: any): Promise<ApiResult<T>> {
  try {
    const resp: AxiosResponse<T> = await api.post(path, body);
    return { success: true, data: resp.data };
  } catch (err: any) {
    console.error(`Error POST ${path}`, err);
    return {
      success: false,
      error:
        err.response?.data?.detail ??
        err.response?.data?.error ??
        err.message ??
        "Unknown error",
    };
  }
}

// POST wrapper with custom timeout
async function postWithTimeout<T = any>(
  path: string,
  body: any,
  timeoutMs: number
): Promise<ApiResult<T>> {
  try {
    const resp: AxiosResponse<T> = await api.post(path, body, {
      timeout: timeoutMs,
    });
    return { success: true, data: resp.data };
  } catch (err: any) {
    console.error(`Error POST ${path}`, err);
    return {
      success: false,
      error:
        err.response?.data?.detail ??
        err.response?.data?.error ??
        err.message ??
        "Unknown error",
    };
  }
}

// --- API calls ---

export async function setImage(imageBase64: string): Promise<
  ApiResult<{
    message: string;
    image_path: string;
    image_name: string;
    width: number;
    height: number;
  }>
> {
  return await post("/set-image", { image: imageBase64 });
}

export async function setMask(
  imageName: string,
  masks: number[][][] // array of 2D integer arrays (bitmask values 0/1 or 0–255)
): Promise<ApiResult<{ message: string; masks: string[] }>> {
  return await post("/set-masks", { image_name: imageName, masks });
}

export async function move(
  imageName: string,
  maskIds: number[],
  startx: number,
  starty: number,
  endx: number,
  endy: number,
  prompt?: string
): Promise<
  ApiResult<{
    image: string;
    message: string;
    metrics?: Array<{
      timestamp: number;
      cpu: number;
      gpu: number;
      memory: number;
    }>;
  }>
> {
  return await post("/move", {
    image_name: imageName,
    masks_ids: maskIds,
    startx,
    starty,
    endx,
    endy,
    prompt,
  });
}

export async function erase(
  imageName: string,
  masksIds: number[]
): Promise<ApiResult<{ image: string; message: string }>> {
  return await post("/erase", { image_name: imageName, masks_ids: masksIds });
}

export async function inpaint(
  imageName: string,
  masksIds: number[],
  prompt?: string,
  modelType: "FREE" | "PRO" = "FREE"
): Promise<
  ApiResult<{
    image: string;
    message: string;
    metrics?: Array<{
      timestamp: number;
      cpu: number;
      gpu: number;
      memory: number;
    }>;
  }>
> {
  return await post("/inpaint", {
    image_name: imageName,
    masks_ids: masksIds,
    prompt,
    model_type: modelType,
  });
}

export async function imgtoimg(
  imageBase64: string,
  prompt: string
): Promise<ApiResult<{ image: string; message: string }>> {
  return await post("/imgtoimg", { image: imageBase64, prompt });
}

export async function stylize(
  imageBase64: string,
  prompt?: string,
  style?: string,
  targetImage?: string,
  modelType?: string
): Promise<
  ApiResult<{
    image: string;
    message: string;
    metrics?: Array<{
      timestamp: number;
      cpu: number;
      gpu: number;
      memory: number;
    }>;
  }>
> {
  // Use 10 minute timeout for stylize (600 seconds = 600,000 ms)
  return await postWithTimeout(
    "/stylize",
    {
      image: imageBase64,
      prompt,
      style,
      target_image: targetImage,
      model_type: modelType,
    },
    600_000
  );
}
