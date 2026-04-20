import React, { useState, useRef, useEffect } from "react";
import { Upload, X, Terminal, Move, Download } from "lucide-react";
import SystemUsageChart from "./SystemUsageChart";
import WorkflowGraph from "./WorkflowGraph";
import * as api from "../services/features";
import * as segmentApi from "../services/segmentService";
import {
  convertMaskImageToArray,
  createRectangularMask,
} from "../services/maskUtils";

// Random blob paths normalized for objectBoundingBox (0..1)
const BLOB_PATHS = [
  "M0.5,0.1 C0.75,0.1,0.9,0.3,0.9,0.5 C0.9,0.7,0.7,0.95,0.5,0.95 C0.3,0.95,0.1,0.7,0.1,0.5 C0.1,0.3,0.25,0.1,0.5,0.1 Z",
  "M0.45,0.1 C0.7,0.05,0.9,0.25,0.9,0.55 C0.9,0.8,0.65,0.95,0.4,0.9 C0.2,0.85,0.05,0.6,0.1,0.35 C0.15,0.15,0.3,0.1,0.45,0.1 Z",
  "M0.5,0.05 C0.8,0.05,0.95,0.3,0.85,0.6 C0.75,0.9,0.5,0.95,0.35,0.85 C0.1,0.7,0.05,0.4,0.2,0.15 C0.3,0.05,0.4,0.05,0.5,0.05 Z",
];

interface BlobDef {
  id: string;
  path: string;
  transform: string; // SVG transform for the path
  offset: { x: number; y: number }; // UI drag offset
}

const ImageAnalyzer: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMask, setSelectedMask] = useState<string | null>(null);
  const [backendImageName, setBackendImageName] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [uploadedMasksCount, setUploadedMasksCount] = useState<number>(0);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [showingResult, setShowingResult] = useState<boolean>(true);
  const [mimeType, setMimeType] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [maskingStatus, setMaskingStatus] = useState<
    "idle" | "processing" | "done"
  >("idle");
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] = useState<
    "move" | "inpaint" | "erase" | null
  >(null);
  const [imgAspectRatio, setImgAspectRatio] = useState<number | undefined>(
    undefined
  );
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [displayedImageSize, setDisplayedImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [inpaintModel, setInpaintModel] = useState<"FREE" | "PRO">("FREE");
  const [metrics, setMetrics] = useState<Array<{
    timestamp: number;
    cpu: number;
    gpu: number;
    memory: number;
  }> | null>(null);

  // State for on-device segmentation
  const [detectedMasks, setDetectedMasks] = useState<segmentApi.SegmentMask[]>(
    []
  );
  const [isSegmenting, setIsSegmenting] = useState<boolean>(false);
  const [showMaskModal, setShowMaskModal] = useState<boolean>(false);
  const [selectedMaskIndex, setSelectedMaskIndex] = useState<number | null>(
    null
  );
  const [showInpaintModal, setShowInpaintModal] = useState<boolean>(false);
  const [inpaintPrompt, setInpaintPrompt] = useState<string>(
    "Fill the masked region naturally"
  );

  // Multi-blob state
  const [maskBlobs, setMaskBlobs] = useState<BlobDef[]>([]);
  // Keep mask bounding boxes corresponding to uploaded/simulated masks
  const [maskRects, setMaskRects] = useState<
    { x: number; y: number; width: number; height: number }[]
  >([]);
  // Drag State
  const [draggingBlobId, setDraggingBlobId] = useState<string | null>(null);
  // When a drag ends this stores the blob id to trigger auto-execute
  const [droppedBlobId, setDroppedBlobId] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  // Store drag coords in refs so they survive async executeAnalysis call
  const dragStartRef_ = useRef<{ x: number; y: number } | null>(null);
  const dragEndRef = useRef<{ x: number; y: number } | null>(null);
  // Pointer where the drag started (client coords) — used as initial point for move
  const [startDragClient, setStartDragClient] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Current drag pointer (client coords) used to render arrow
  const [dragCurrentClient, setDragCurrentClient] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Final drop client coords captured on mouseup (for move computation)
  const [finalDropClient, setFinalDropClient] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Global mouse listeners for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingBlobId) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Track current drag position
      setDragCurrentClient({ x: e.clientX, y: e.clientY });

      // Update blob offsets for visual feedback
      setMaskBlobs((prev) =>
        prev.map((blob) => {
          if (blob.id === draggingBlobId) {
            return {
              ...blob,
              offset: {
                x: blob.offset.x + deltaX,
                y: blob.offset.y + deltaY,
              },
            };
          }
          return blob;
        })
      );

      // Reset drag start to current to avoid accumulating large deltas
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      // if in move mode capture final pointer and mark dropped blob
      if (draggingBlobId && selectedAction === "move") {
        // record final client position from the event itself (not stale dragCurrentClient state)
        const finalPos = { x: e.clientX, y: e.clientY };
        setFinalDropClient(finalPos);
        dragEndRef.current = finalPos;
        setDroppedBlobId(draggingBlobId);
      }

      // clear temporary drag position
      setDragCurrentClient(null);
      setDraggingBlobId(null);
    };

    if (draggingBlobId) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingBlobId]);

  const addLog = (message: string) => {
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ]);
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setMimeType(file.type);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        setSelectedImage(dataUrl);
        setResultImage(null);
        setLogs([]);
        setMaskingStatus("idle");
        setSelectedAction(null);
        setMaskBlobs([]);
        setSelectedMask(null);
        setImgAspectRatio(undefined);
        setDetectedMasks([]);
        setSelectedMaskIndex(null);
        addLog(`Image loaded: ${file.name}`);

        // Upload to backend
        addLog("Uploading image to backend...");
        const base64Data = dataUrl.split(",")[1];
        const response = await api.setImage(base64Data);

        if (response.success && response.data) {
          setBackendImageName(response.data.image_name);
          setImageDimensions({
            width: response.data.width,
            height: response.data.height,
          });
          addLog(`✓ Image uploaded: ${response.data.image_name}`);
          addLog(`Dimensions: ${response.data.width}x${response.data.height}`);

          // Automatically trigger on-device segmentation
          addLog("Starting on-device object detection...");
          setIsSegmenting(true);
          const segmentResponse = await segmentApi.segment(base64Data);
          setIsSegmenting(false);

          if (segmentResponse.success && segmentResponse.data) {
            setDetectedMasks(segmentResponse.data.masks);
            addLog(`✓ Detected ${segmentResponse.data.count} objects`);

            // Send all detected masks to backend immediately
            addLog("Sending masks to backend...");
            const allMaskArrays: number[][][] = [];

            for (const mask of segmentResponse.data.masks) {
              const maskUrl = `data:image/png;base64,${mask.png_base64}`;
              const maskArr = await convertMaskImageToArray(maskUrl);
              allMaskArrays.push(maskArr);
            }

            const maskResponse = await api.setMask(
              response.data.image_name,
              allMaskArrays
            );

            if (maskResponse.success) {
              setUploadedMasksCount(segmentResponse.data.masks.length);
              addLog(
                `✓ All ${segmentResponse.data.masks.length} masks sent to backend`
              );
              addLog("Click 'Simulate Mask' to select and apply a mask.");
            } else {
              addLog(
                `✗ Failed to send masks: ${
                  maskResponse.error || "Unknown error"
                }`
              );
            }
          } else {
            addLog(
              `✗ Segmentation failed: ${
                segmentResponse.error || "Unknown error"
              }`
            );
            addLog("You can still upload a mask manually.");
          }
        } else {
          addLog(`✗ Upload failed: ${response.error || "Unknown error"}`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const simulateMasking = () => {
    // Check if masks have been detected
    if (isSegmenting) {
      addLog("Segmentation in progress, please wait...");
      return;
    }

    if (detectedMasks.length === 0) {
      addLog(
        "No masks detected yet. Please wait for segmentation to complete."
      );
      return;
    }

    // Show mask selection modal
    addLog("Opening mask selection tray...");
    setShowMaskModal(true);
  };

  const handleMaskSelection = async (maskIndex: number) => {
    const selectedMask = detectedMasks[maskIndex];
    if (!selectedMask || !backendImageName || !imageDimensions) {
      addLog("✗ Error: Cannot apply mask");
      return;
    }

    setShowMaskModal(false);
    setSelectedMaskIndex(maskIndex);
    setMaskingStatus("processing");
    addLog(`Applying mask ${maskIndex + 1}...`);

    try {
      // Convert the selected mask from base64 PNG to mask array
      const maskDataUrl = `data:image/png;base64,${selectedMask.png_base64}`;
      setSelectedMask(maskDataUrl);

      addLog("Converting mask to array format...");
      const maskArray = await convertMaskImageToArray(maskDataUrl);

      // Compute bounding box of mask
      const computeBBox = (mask: number[][]) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let y = 0; y < mask.length; y++) {
          for (let x = 0; x < (mask[0] || []).length; x++) {
            if (mask[y][x]) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (minX === Infinity) {
          return {
            x: 0,
            y: 0,
            width: mask[0]?.length || 0,
            height: mask.length,
          };
        }
        return {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        };
      };

      const bbox = computeBBox(maskArray as number[][]);
      setMaskRects([bbox]);

      // Create a draggable blob for the selected mask
      const tx = bbox.x / imageDimensions.width;
      const ty = bbox.y / imageDimensions.height;
      const sx = bbox.width / imageDimensions.width;
      const sy = bbox.height / imageDimensions.height;

      const maskBlob: BlobDef = {
        id: `detected-mask-${maskIndex}`,
        path: "M0 0 H1 V1 H0 Z",
        transform: `translate(${tx}, ${ty}) scale(${sx}, ${sy})`,
        offset: { x: 0, y: 0 },
      };

      setMaskBlobs([maskBlob]);

      setMaskingStatus("done");
      addLog(`✓ Mask ${maskIndex + 1} applied successfully`);
      addLog("Mask ready. Select an action (move/inpaint/erase).");
    } catch (error: any) {
      setMaskingStatus("idle");
      addLog(`✗ Error applying mask: ${error.message}`);
    }
  };

  const handleActionClick = (action: "move" | "inpaint" | "erase") => {
    if (!selectedImage) return;

    setSelectedAction(action);

    // Reset offsets when switching back to move (optional, but cleaner)
    if (action !== "move") {
      setMaskBlobs((prev) =>
        prev.map((b) => ({ ...b, offset: { x: 0, y: 0 } }))
      );
    }

    // Set model to FREE for move/erase, keep current for inpaint
    if (action === "move" || action === "erase") {
      setInpaintModel("FREE");
    }

    if (action === "move") {
      addLog(
        "Independent object manipulation enabled. Drag any highlighted object."
      );
    } else if (action === "inpaint") {
      addLog("Masked regions selected for inpainting analysis.");
    } else if (action === "erase") {
      addLog("Masked regions selected for removal.");
    }
  };

  const handleMouseDown = (e: React.MouseEvent, blobId: string) => {
    if (selectedAction !== "move") return;
    e.preventDefault();
    e.stopPropagation();

    setDraggingBlobId(blobId);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setStartDragClient({ x: e.clientX, y: e.clientY });
    dragStartRef_.current = { x: e.clientX, y: e.clientY };
    setDragCurrentClient({ x: e.clientX, y: e.clientY });
  };

  const confirmAction = () => {
    if (selectedAction) {
      executeAnalysis(selectedAction);
    }
  };

  const handleInpaintSubmit = () => {
    setShowInpaintModal(false);
    setIsProcessingAction(true);
    executeAnalysis("inpaint-execute" as any);
  };

  const handleInpaintCancel = () => {
    setShowInpaintModal(false);
    addLog("Inpaint cancelled by user.");
  };

  // When a blob has been dropped (drag ended) and we're in move mode,
  // automatically run the move pipeline using the existing executeAnalysis logic.
  useEffect(() => {
    if (!droppedBlobId) return;
    if (selectedAction !== "move") {
      setDroppedBlobId(null);
      return;
    }

    // Trigger move execution. executeAnalysis will look at maskBlobs offsets
    // and compute start/end coordinates accordingly.
    (async () => {
      addLog("Drop detected — executing move pipeline...");
      await executeAnalysis("move");
      setDroppedBlobId(null);
    })();
  }, [droppedBlobId]);

  const executeAnalysis = async (action: "move" | "inpaint" | "erase") => {
    if (!selectedImage) {
      addLog("✗ Error: No image selected");
      return;
    }

    // For mask-based actions, check backend image
    if (["move", "inpaint", "erase"].includes(action)) {
      if (!backendImageName) {
        addLog("✗ Error: Image not uploaded to backend");
        return;
      }

      if (uploadedMasksCount === 0) {
        addLog(
          "✗ Error: No masks uploaded. Please upload or simulate masks first."
        );
        return;
      }
    }

    setIsProcessingAction(true);
    addLog(`Executing ${action.toUpperCase()} pipeline...`);

    try {
      let response;

      switch (action) {
        case "move":
          {
            // For the move action we compute coordinates from the mask rect and the final drop client position
            if (!droppedBlobId || !finalDropClient) {
              addLog(
                "✗ No drop detected. Please drag and release an object to move."
              );
              setIsProcessingAction(false);
              return;
            }

            // Use refs to get drag start/end coords (survive async closure)
            const dragStart = dragStartRef_.current || startDragClient;
            const dragEnd = dragEndRef.current || finalDropClient;

            addLog(
              `DEBUG: dragStart=${
                dragStart ? `(${dragStart.x},${dragStart.y})` : "null"
              }, dragEnd=${dragEnd ? `(${dragEnd.x},${dragEnd.y})` : "null"}`
            );
            addLog(
              `DEBUG: dragStartRef_.current=${
                dragStartRef_.current
                  ? `(${dragStartRef_.current.x},${dragStartRef_.current.y})`
                  : "null"
              }`
            );
            addLog(
              `DEBUG: dragEndRef.current=${
                dragEndRef.current
                  ? `(${dragEndRef.current.x},${dragEndRef.current.y})`
                  : "null"
              }`
            );

            if (!dragStart || !dragEnd) {
              addLog("✗ Drag coordinates missing.");
              setIsProcessingAction(false);
              return;
            }

            // Determine mask index from droppedBlobId
            const idx = maskBlobs.findIndex((b) => b.id === droppedBlobId);
            const maskIndex = idx >= 0 ? idx : 0;

            // compute start and end (image pixels) from drag client positions relative to the displayed image
            const imgEl = imageRef.current;
            if (!imgEl || !imageDimensions) {
              addLog("✗ Cannot compute coordinates (missing image element)");
              setIsProcessingAction(false);
              return;
            }
            const imgRect = imgEl.getBoundingClientRect();

            // start: use dragStart mapped to image pixels
            const startRelX = dragStart.x - imgRect.left;
            const startRelY = dragStart.y - imgRect.top;
            let startx = Math.round(
              startRelX * (imageDimensions.width / imgRect.width)
            );
            let starty = Math.round(
              startRelY * (imageDimensions.height / imgRect.height)
            );
            // clamp
            startx = Math.max(0, Math.min(startx, imageDimensions.width - 1));
            starty = Math.max(0, Math.min(starty, imageDimensions.height - 1));

            addLog(
              `DEBUG START: rel=(${startRelX},${startRelY}), scale=${
                imageDimensions.width
              }/${imgRect.width}=${
                imageDimensions.width / imgRect.width
              }, computed=({startx},${starty})`
            );

            // end: use dragEnd mapped to image pixels
            const relX = dragEnd.x - imgRect.left;
            const relY = dragEnd.y - imgRect.top;
            let endx = Math.round(
              relX * (imageDimensions.width / imgRect.width)
            );
            let endy = Math.round(
              relY * (imageDimensions.height / imgRect.height)
            );
            // clamp
            endx = Math.max(0, Math.min(endx, imageDimensions.width - 1));
            endy = Math.max(0, Math.min(endy, imageDimensions.height - 1));

            addLog(
              `DEBUG END: rel=(${relX},${relY}), scale=${
                imageDimensions.width
              }/${imgRect.width}=${
                imageDimensions.width / imgRect.width
              }, computed=(${endx},${endy})`
            );
            addLog(`Moving object: (${startx},${starty}) → (${endx},${endy})`);
            const maskIds = [maskIndex];

            // send request
            response = await api.move(
              backendImageName,
              maskIds,
              startx,
              starty,
              endx,
              endy
            );
          }
          break;

        case "inpaint":
          // Ask user for an inpaint prompt before sending request
          addLog("Inpainting selected — requesting prompt from user...");
          setShowInpaintModal(true);
          setIsProcessingAction(false);
          return; // Wait for modal submission

        case "inpaint-execute":
          addLog(`Requesting inpainting with ${inpaintModel} model...`);
          // Use only the selected mask
          const inpaintMaskIds =
            selectedMaskIndex !== null ? [selectedMaskIndex] : [0];
          response = await api.inpaint(
            backendImageName,
            inpaintMaskIds,
            inpaintPrompt || "Fill the masked region naturally",
            inpaintModel
          );
          break;

        case "erase":
          addLog("Requesting object removal...");
          // Use only the selected mask
          const eraseMaskIds =
            selectedMaskIndex !== null ? [selectedMaskIndex] : [0];
          response = await api.erase(backendImageName, eraseMaskIds);
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      if (response.success && response.data) {
        addLog(`✓ ${action.toUpperCase()} completed: ${response.data.message}`);

        // Extract metrics if available
        if (response.data.metrics) {
          setMetrics(response.data.metrics);
          addLog(`✓ Received ${response.data.metrics.length} metric samples`);
        }

        // Display result image
        if (response.data.image) {
          const resultDataUrl = `data:image/png;base64,${response.data.image}`;
          // Clear mask overlays so result is shown without mask overlap
          setSelectedMask(null);
          setMaskBlobs([]);
          setMaskRects([]);
          // Clear the selected action to remove action-specific overlays/indicators
          setSelectedAction(null);
          setResultImage(resultDataUrl);
          setShowingResult(true);
          addLog("✓ Result image received. Displaying...");
        }
      } else {
        addLog(
          `✗ ${action.toUpperCase()} failed: ${
            response.error || "Unknown error"
          }`
        );
      }
    } catch (error: any) {
      addLog(`✗ Critical error: ${error.message}`);
      console.error(error);
    } finally {
      setIsProcessingAction(false);
      // clear drag points after action completes
      setStartDragClient(null);
      setFinalDropClient(null);
      dragStartRef_.current = null;
      dragEndRef.current = null;
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setSelectedMask(null);
    setResultImage(null);
    setBackendImageName(null);
    setImageDimensions(null);
    setUploadedMasksCount(0);
    setLogs([]);
    setMimeType("");
    setMaskingStatus("idle");
    setSelectedAction(null);
    setMaskBlobs([]);
    setImgAspectRatio(undefined);
    setStylizeTargetImage(null);
    setDetectedMasks([]);
    setIsSegmenting(false);
    setShowMaskModal(false);
    setSelectedMaskIndex(null);
    setShowingResult(true);
    setMaskRects([]);
    setMetrics(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const downloadImage = async () => {
    const imageToDownload =
      showingResult && resultImage ? resultImage : selectedImage;
    if (!imageToDownload) {
      addLog("No image to download.");
      return;
    }

    try {
      // Convert base64 to blob
      const response = await fetch(imageToDownload);
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `image_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      addLog("Image downloaded successfully.");
    } catch (error: any) {
      addLog(`Download failed: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-row h-full gap-3">
      {/* LEFT COLUMN: Visuals + Data */}
      <div className="flex-1 flex flex-col min-w-0 gap-3">
        {/* Image Area */}
        <div className="h-[55vh] bg-zinc-900 border border-zinc-800 rounded-xl relative overflow-hidden group select-none flex items-center justify-center p-4">
          {/* SVG Defs for Masking - Dynamic generation for each blob */}
          <svg className="absolute w-0 h-0 pointer-events-none">
            <defs>
              {maskBlobs.map((blob) => (
                <React.Fragment key={blob.id}>
                  <clipPath id={blob.id} clipPathUnits="objectBoundingBox">
                    <path d={blob.path} transform={blob.transform} />
                  </clipPath>
                  {/* Additional clipPath for move action with offset */}
                  {displayedImageSize && maskRects[maskBlobs.indexOf(blob)] && (
                    <clipPath
                      id={`${blob.id}-move`}
                      clipPathUnits="userSpaceOnUse"
                    >
                      <rect
                        x={
                          (maskRects[maskBlobs.indexOf(blob)].x *
                            displayedImageSize.width) /
                            (imageDimensions?.width || 1) +
                          blob.offset.x
                        }
                        y={
                          (maskRects[maskBlobs.indexOf(blob)].y *
                            displayedImageSize.height) /
                            (imageDimensions?.height || 1) +
                          blob.offset.y
                        }
                        width={
                          (maskRects[maskBlobs.indexOf(blob)].width *
                            displayedImageSize.width) /
                          (imageDimensions?.width || 1)
                        }
                        height={
                          (maskRects[maskBlobs.indexOf(blob)].height *
                            displayedImageSize.height) /
                          (imageDimensions?.height || 1)
                        }
                      />
                    </clipPath>
                  )}
                </React.Fragment>
              ))}
            </defs>
          </svg>

          {/* Clear button - Top Left Corner of Compartment */}
          {selectedImage && (
            <div className="absolute top-4 left-4 z-50">
              <button
                onClick={clearImage}
                className="p-2 bg-black/50 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg backdrop-blur-sm transition-all shadow-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Download button - Bottom Right Corner of Compartment */}
          {selectedImage && (
            <div className="absolute bottom-4 right-4 z-50">
              <button
                onClick={downloadImage}
                className="p-2 bg-black/50 hover:bg-green-500/20 text-zinc-400 hover:text-green-400 rounded-lg backdrop-blur-sm transition-all shadow-lg"
                title="Download image"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Download button - Bottom Right Corner of Compartment */}
          {selectedImage && (
            <div className="absolute bottom-4 right-4 z-50">
              <button
                onClick={downloadImage}
                className="p-2 bg-black/50 hover:bg-green-500/20 text-zinc-400 hover:text-green-400 rounded-lg backdrop-blur-sm transition-all shadow-lg"
                title="Download image"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* View Result/Original and Show Detected Objects buttons - Top Right Corner of Compartment */}
          {selectedImage && (
            <div className="absolute top-4 right-4 flex gap-2 z-50">
              {resultImage && (
                <button
                  onClick={() => setShowingResult(!showingResult)}
                  className="px-3 py-2 bg-zinc-700/90 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg backdrop-blur-sm transition-all shadow-lg"
                >
                  {showingResult ? "View Original" : "View Result"}
                </button>
              )}
              {!selectedMask &&
                maskingStatus !== "processing" &&
                detectedMasks.length > 0 && (
                  <button
                    onClick={simulateMasking}
                    className="px-3 py-1.5 bg-purple-500/90 hover:bg-purple-500 text-white text-xs font-medium rounded-lg backdrop-blur-sm transition-all leading-tight shadow-lg"
                  >
                    <div>Show Detected</div>
                    <div>Objects</div>
                  </button>
                )}
            </div>
          )}

          {!selectedImage ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-800/30 transition-colors"
            >
              <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-dashed border-zinc-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-zinc-500" />
              </div>
              <h3 className="text-zinc-400 font-medium">Upload Source Image</h3>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
          ) : (
            <div
              className="relative max-w-full max-h-full shadow-2xl"
              style={{ aspectRatio: imgAspectRatio ? imgAspectRatio : "auto" }}
            >
              {/* 1. Base Image Layer */}
              <img
                ref={imageRef}
                src={resultImage && showingResult ? resultImage : selectedImage}
                alt={resultImage && showingResult ? "Result" : "Source"}
                className="w-full h-full object-contain block"
                onLoad={(e) => {
                  setImgAspectRatio(
                    e.currentTarget.naturalWidth / e.currentTarget.naturalHeight
                  );
                  // store the displayed size to map DOM offsets -> image pixels
                  setDisplayedImageSize({
                    width: e.currentTarget.clientWidth,
                    height: e.currentTarget.clientHeight,
                  });
                }}
              />

              {/* Arrow overlay while dragging (move) */}
              {selectedAction === "move" &&
                imageRef.current &&
                dragCurrentClient &&
                (() => {
                  const imgEl = imageRef.current as HTMLImageElement;
                  const imgRect = imgEl.getBoundingClientRect();
                  // start position uses startDragClient if available, else fallback to mask center
                  const start = startDragClient
                    ? {
                        x: startDragClient.x - imgRect.left,
                        y: startDragClient.y - imgRect.top,
                      }
                    : maskRects[0]
                    ? {
                        x:
                          ((maskRects[0].x + maskRects[0].width / 2) /
                            (imageDimensions?.width || 1)) *
                          imgRect.width,
                        y:
                          ((maskRects[0].y + maskRects[0].height / 2) /
                            (imageDimensions?.height || 1)) *
                          imgRect.height,
                      }
                    : { x: imgRect.width / 2, y: imgRect.height / 2 };

                  const curX = dragCurrentClient.x - imgRect.left;
                  const curY = dragCurrentClient.y - imgRect.top;
                  return (
                    <svg
                      className="absolute inset-0 z-40 pointer-events-none"
                      viewBox={`0 0 ${imgRect.width} ${imgRect.height}`}
                      preserveAspectRatio="none"
                      style={{
                        left: 0,
                        top: 0,
                        width: imgRect.width,
                        height: imgRect.height,
                      }}
                    >
                      <defs>
                        <marker
                          id="arrowhead"
                          markerWidth="10"
                          markerHeight="7"
                          refX="10"
                          refY="3.5"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 3.5, 0 7" fill="#34d399" />
                        </marker>
                      </defs>
                      <line
                        x1={start.x}
                        y1={start.y}
                        x2={curX}
                        y2={curY}
                        stroke="#34d399"
                        strokeWidth={3}
                        markerEnd="url(#arrowhead)"
                        strokeLinecap="round"
                      />
                    </svg>
                  );
                })()}

              {/* Processing overlay while executing actions */}
              {isProcessingAction && (
                <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    <div className="text-white text-sm font-medium">
                      Processing...
                    </div>
                  </div>
                </div>
              )}

              {/* Result indicator badge */}
              {resultImage && showingResult && (
                <div className="absolute top-2 left-2 px-3 py-1 bg-green-500/90 text-white text-xs font-bold rounded-full backdrop-blur-sm z-30">
                  ✓ RESULT
                </div>
              )}

              {/* Original indicator badge */}
              {resultImage && !showingResult && (
                <div className="absolute top-2 left-2 px-3 py-1 bg-zinc-600/90 text-white text-xs font-bold rounded-full backdrop-blur-sm z-30">
                  ORIGINAL
                </div>
              )}

              {/* UPLOADED MASK OVERLAY (when no action selected) */}
              {selectedMask && !selectedAction && (
                <div className="absolute inset-0 z-10 mix-blend-multiply pointer-events-none">
                  <img
                    src={selectedMask}
                    alt="Mask"
                    className="w-full h-full object-contain opacity-60"
                  />
                </div>
              )}

              {/* ACTION LAYERS */}

              {/* MOVE ACTION: Draggable mask regions */}
              {selectedAction === "move" &&
                maskBlobs.map((blob) => (
                  <div
                    key={blob.id}
                    onMouseDown={(e) => handleMouseDown(e, blob.id)}
                    className="absolute inset-0 cursor-move z-10 bg-emerald-500/40"
                    style={{
                      clipPath: `url(#${blob.id}-move)`,
                      zIndex: draggingBlobId === blob.id ? 30 : 10,
                    }}
                  />
                ))}

              {/* INPAINT ACTION: Show uploaded mask or simulated blobs */}
              {selectedAction === "inpaint" && (
                <>
                  {selectedMask ? (
                    <div className="absolute inset-0 z-10">
                      <img
                        src={selectedMask}
                        alt="Mask"
                        className="w-full h-full object-contain opacity-50 mix-blend-screen animate-pulse"
                        style={{ filter: "hue-rotate(200deg) saturate(3)" }}
                      />
                    </div>
                  ) : (
                    maskBlobs.map((blob) => (
                      <div
                        key={blob.id}
                        className="absolute inset-0 z-10 bg-blue-500/40 backdrop-blur-[1px] border border-blue-400/30 animate-pulse"
                        style={{ clipPath: `url(#${blob.id})` }}
                      />
                    ))
                  )}
                </>
              )}

              {/* ERASE ACTION: Show uploaded mask or simulated blobs */}
              {selectedAction === "erase" && (
                <>
                  {selectedMask ? (
                    <div className="absolute inset-0 z-10">
                      <img
                        src={selectedMask}
                        alt="Mask"
                        className="w-full h-full object-contain opacity-50 mix-blend-screen animate-pulse"
                        style={{ filter: "hue-rotate(0deg) saturate(3)" }}
                      />
                    </div>
                  ) : (
                    maskBlobs.map((blob) => (
                      <div
                        key={blob.id}
                        className="absolute inset-0 z-10 bg-red-500/40 backdrop-blur-[1px] border border-red-400/30 animate-pulse"
                        style={{ clipPath: `url(#${blob.id})` }}
                      />
                    ))
                  )}
                </>
              )}

              {maskingStatus === "processing" && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-blue-400 font-mono text-sm animate-pulse">
                      Detecting Objects...
                    </div>
                  </div>
                </div>
              )}

              {/* On-device Segmentation Loading Indicator */}
              {isSegmenting && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-purple-400 font-mono text-sm animate-pulse">
                      Running On-Device Detection...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mask Selection Modal */}
        {showMaskModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-zinc-900 border-2 border-purple-500/50 rounded-2xl p-6 max-w-2xl max-h-[80vh] overflow-auto shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">
                  Select Object Mask
                </h2>
                <button
                  onClick={() => setShowMaskModal(false)}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <p className="text-zinc-400 text-sm mb-4">
                {detectedMasks.length} object
                {detectedMasks.length !== 1 ? "s" : ""} detected. Select one to
                use for editing:
              </p>

              <div className="grid grid-cols-3 gap-4">
                {detectedMasks.map((mask, index) => (
                  <button
                    key={mask.index}
                    onClick={() => handleMaskSelection(index)}
                    className="relative aspect-square bg-zinc-800 hover:bg-zinc-700 border-2 border-zinc-700 hover:border-purple-500 rounded-xl overflow-hidden transition-all group"
                  >
                    <img
                      src={`data:image/png;base64,${mask.png_base64}`}
                      alt={`Mask ${index + 1}`}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                      <span className="text-white text-sm font-medium">
                        Select
                      </span>
                    </div>
                    <div className="absolute top-2 right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded">
                      {index + 1}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowMaskModal(false)}
                  className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inpaint Prompt Modal */}
        {showInpaintModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-zinc-900 border-2 border-blue-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Inpaint Prompt</h2>
                <button
                  onClick={handleInpaintCancel}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <p className="text-zinc-400 text-sm mb-4">
                Enter a prompt to guide the inpainting process:
              </p>

              <textarea
                value={inpaintPrompt}
                onChange={(e) => setInpaintPrompt(e.target.value)}
                placeholder="Fill the masked region naturally"
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                rows={4}
                autoFocus
              />

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  onClick={handleInpaintCancel}
                  className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInpaintSubmit}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                >
                  Start Inpainting
                </button>
              </div>
            </div>
          </div>
        )}

        {/* System Metrics Chart */}
        <div className="flex-1 min-h-0">
          <SystemUsageChart metrics={metrics} />
        </div>
      </div>

      {/* RIGHT COLUMN: Controls + Workflow */}
      <div className="w-[400px] shrink-0 flex flex-col gap-3">
        {/* Workflow Graph Panel - Scrollable with stylize options inside */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex flex-col items-center h-[55vh] overflow-y-auto scrollbar-thin">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 w-full text-center">
            Operation Pipeline
          </h3>
          {/* Model selector for inpaint (FREE/PRO) - placed immediately under the Operation Pipeline heading */}
          <div className="mt-0 mb-2 w-full flex items-center justify-center gap-2">
            <label className="text-xs text-zinc-400">Model:</label>
            <select
              value={inpaintModel}
              onChange={(e) =>
                setInpaintModel(e.target.value as "FREE" | "PRO")
              }
              disabled={selectedAction === "move" || selectedAction === "erase"}
              className={`text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 px-2 py-1 rounded ${
                selectedAction === "move" || selectedAction === "erase"
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
            >
              <option value="FREE">FREE</option>
              <option
                value="PRO"
                disabled={
                  selectedAction === "move" || selectedAction === "erase"
                }
              >
                PRO
              </option>
            </select>
          </div>

          <WorkflowGraph
            hasImage={!!selectedImage}
            maskingStatus={maskingStatus}
            onAction={handleActionClick}
            onConfirm={confirmAction}
            isProcessingAction={isProcessingAction}
            selectedAction={selectedAction}
            uploadedMasksCount={uploadedMasksCount}
          />
        </div>

        {/* Console / Output Log */}
        <div className="flex-1 bg-black border border-zinc-800 rounded-xl p-4 font-mono text-[11px] overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 text-zinc-500 mb-3 pb-2 border-b border-zinc-900">
            <Terminal className="w-3 h-3" />
            <span className="uppercase tracking-wider">System Log</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 text-zinc-400 scrollbar-thin">
            {logs.length === 0 ? (
              <span className="text-zinc-700 italic">Waiting for input...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="break-words">
                  <span className="opacity-50 mr-2">{">"}</span>
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageAnalyzer;
