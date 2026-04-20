// segmentService.ts - Service for on-device object detection simulation
import axios, { AxiosInstance, AxiosResponse } from "axios";

const segmentApi: AxiosInstance = axios.create({
  baseURL: (import.meta as any).env?.VITE_SEGMENT_URL ?? "/segment-api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000, // 30 seconds for segmentation
});

export interface SegmentMask {
  index: number;
  path: string;
  png_base64: string;
}

export interface SegmentResponse {
  count: number;
  masks: SegmentMask[];
}

export type SegmentResult = {
  success: boolean;
  data?: SegmentResponse;
  error?: string;
};

/**
 * Send image to segmentation service and get back object masks
 * @param imageBase64 - Base64 encoded image string (without data:image prefix)
 */
export async function segment(imageBase64: string): Promise<SegmentResult> {
  try {
    const resp: AxiosResponse<SegmentResponse> = await segmentApi.post(
      "/segment",
      { image_base64: imageBase64 }
    );
    return { success: true, data: resp.data };
  } catch (err: any) {
    console.error("Error in segment API call:", err);
    return {
      success: false,
      error: err.response?.data?.error ?? err.message ?? "Segmentation failed",
    };
  }
}
