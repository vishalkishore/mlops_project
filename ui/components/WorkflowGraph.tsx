import React from "react";
import {
  Upload,
  Scan,
  Move,
  Eraser,
  Paintbrush,
  CheckCircle2,
  Check,
  Play,
  ArrowDown,
} from "lucide-react";

type ActionType = "move" | "inpaint" | "erase";

interface WorkflowGraphProps {
  hasImage: boolean;
  maskingStatus: "idle" | "processing" | "done";
  onAction: (action: ActionType) => void;
  onConfirm: () => void;
  isProcessingAction: boolean;
  selectedAction: ActionType | null;
  uploadedMasksCount?: number;
}

const WorkflowGraph: React.FC<WorkflowGraphProps> = ({
  hasImage,
  maskingStatus,
  onAction,
  onConfirm,
  isProcessingAction,
  selectedAction,
  uploadedMasksCount = 0,
}) => {
  const StepNode = ({
    active,
    completed,
    icon: Icon,
    label,
    subLabel,
  }: {
    active: boolean;
    completed: boolean;
    icon: any;
    label: string;
    subLabel?: string;
  }) => (
    <div
      className={`relative z-10 flex flex-col items-center gap-2 transition-all duration-300 ${
        active ? "opacity-100" : "opacity-40 grayscale"
      }`}
    >
      <div
        className={`w-12 h-12 rounded-xl border flex items-center justify-center shadow-xl transition-all duration-500
        ${
          completed
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
            : active
            ? "bg-blue-500/20 border-blue-500/50 text-blue-400 ring-2 ring-blue-500/20"
            : "bg-zinc-900 border-zinc-800 text-zinc-600"
        }`}
      >
        {completed ? (
          <CheckCircle2 className="w-6 h-6" />
        ) : (
          <Icon className="w-6 h-6" />
        )}
      </div>
      <div className="text-center">
        <div
          className={`text-xs font-bold uppercase tracking-wider ${
            active ? "text-zinc-200" : "text-zinc-600"
          }`}
        >
          {label}
        </div>
        {subLabel && (
          <div className="text-[10px] text-zinc-500">{subLabel}</div>
        )}
      </div>
    </div>
  );

  const ActionButton = ({
    action,
    icon: Icon,
    label,
    disabled,
  }: {
    action: ActionType;
    icon: any;
    label: string;
    disabled: boolean;
  }) => {
    const isSelected = selectedAction === action;

    return (
      <button
        onClick={() => onAction(action)}
        disabled={disabled}
        className={`group relative flex flex-col items-center gap-2 p-2 rounded-lg transition-all duration-200
          ${
            disabled && !isSelected
              ? "opacity-40 cursor-not-allowed"
              : "cursor-pointer"
          }
          ${
            isSelected
              ? "opacity-100 scale-105"
              : "hover:bg-zinc-800/50 active:scale-95"
          }`}
      >
        <div
          className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all duration-300
          ${
            isSelected
              ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              : "bg-zinc-900 border-zinc-700 text-zinc-300 group-hover:border-blue-500 group-hover:text-blue-400"
          }
          ${
            disabled && !isSelected
              ? "bg-zinc-900 border-zinc-800 text-zinc-600"
              : ""
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>

        <span
          className={`text-[10px] font-medium uppercase transition-colors ${
            isSelected
              ? "text-emerald-400 font-bold"
              : "text-zinc-500 group-hover:text-zinc-300"
          }`}
        >
          {label}
        </span>

        {isSelected ? (
          <div className="absolute -top-2 -right-2 bg-zinc-950 border border-emerald-500 text-emerald-500 rounded-full p-0.5 shadow-lg z-20 animate-in zoom-in spin-in-12 duration-300">
            <Check className="w-3 h-3" strokeWidth={3} />
          </div>
        ) : (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            {!disabled && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-0 group-hover:opacity-75"></span>
            )}
            <span className="relative inline-flex rounded-full h-3 w-3 bg-zinc-800 text-[8px] items-center justify-center border border-zinc-700 text-zinc-400">
              2
            </span>
          </span>
        )}
      </button>
    );
  };

  const isMaskReady = maskingStatus === "done";

  return (
    <div className="flex flex-col w-full relative">
      {/* Content area - no overflow, let parent handle scrolling */}
      <div className="flex flex-col items-center py-1 select-none px-2">
        {/* Node 1: Input */}
        <StepNode
          active={true}
          completed={hasImage}
          icon={Upload}
          label="Input"
          subLabel="Source Image"
        />

        {/* Connector */}
        <div
          className={`w-0.5 h-6 transition-colors duration-500 ${
            hasImage ? "bg-blue-500/50" : "bg-zinc-800"
          }`}
        />

        {/* Node 2: Mask */}
        <div className="relative">
          <StepNode
            active={hasImage}
            completed={isMaskReady}
            icon={Scan}
            label="Mask"
            subLabel={
              maskingStatus === "processing"
                ? "Generating..."
                : uploadedMasksCount > 0
                ? `${uploadedMasksCount} mask(s)`
                : "Semantic Scan"
            }
          />
          {maskingStatus === "processing" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-xl border-2 border-blue-500 animate-ping opacity-20"></div>
            </div>
          )}
        </div>

        {/* Connector: Branch Stem */}
        <div
          className={`w-0.5 h-4 transition-colors duration-500 ${
            isMaskReady ? "bg-blue-500/50" : "bg-zinc-800"
          }`}
        />

        {/* Branching Arms for Mask-Based Actions */}
        <div className="relative w-full max-w-[240px] mb-2">
          {/* Horizontal Line */}
          <div
            className={`absolute top-0 left-4 right-4 h-0.5 transition-colors duration-500 ${
              isMaskReady ? "bg-blue-500/50" : "bg-zinc-800"
            }`}
          />

          {/* Vertical Lines to Children */}
          <div className="flex justify-between px-4">
            <div
              className={`w-0.5 h-4 transition-colors duration-500 delay-75 ${
                isMaskReady ? "bg-blue-500/50" : "bg-zinc-800"
              }`}
            />
            <div
              className={`w-0.5 h-4 transition-colors duration-500 delay-100 ${
                isMaskReady ? "bg-blue-500/50" : "bg-zinc-800"
              }`}
            />
            <div
              className={`w-0.5 h-4 transition-colors duration-500 delay-150 ${
                isMaskReady ? "bg-blue-500/50" : "bg-zinc-800"
              }`}
            />
          </div>
        </div>

        {/* Mask-Based Actions Layer */}
        <div className="flex justify-between w-full max-w-[280px] mb-3">
          <ActionButton
            action="move"
            icon={Move}
            label="Move"
            disabled={!isMaskReady || isProcessingAction}
          />
          <ActionButton
            action="inpaint"
            icon={Paintbrush}
            label="Inpaint"
            disabled={!isMaskReady || isProcessingAction}
          />
          <ActionButton
            action="erase"
            icon={Eraser}
            label="Erase"
            disabled={!isMaskReady || isProcessingAction}
          />
        </div>
      </div>

      {/* Fixed Bottom Section: Final Connector + Execution Button */}
      <div className="w-full shrink-0 flex flex-col items-center gap-1 px-4 py-2 border-t border-zinc-800/50 mt-2">
        {/* Final Connector */}
        <div
          className={`w-0.5 h-2 transition-colors duration-500 ${
            selectedAction ? "bg-emerald-500/50" : "bg-zinc-800"
          }`}
        />

        {/* Execution Button */}
        <button
          onClick={onConfirm}
          disabled={!selectedAction || isProcessingAction}
          className={`w-full group relative flex items-center justify-center gap-3 py-1.5 rounded-lg font-bold uppercase tracking-wider transition-all duration-300
                ${
                  !selectedAction || isProcessingAction
                    ? "bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg hover:shadow-emerald-900/40 active:scale-[0.98]"
                }`}
        >
          {isProcessingAction ? (
            <>
              <Scan className="w-4 h-4 animate-spin" />
              <span className="text-xs">Processing...</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span className="text-xs">Execute {selectedAction || "..."}</span>
            </>
          )}

          {/* Visual Indicator of flow */}
          {selectedAction && !isProcessingAction && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-emerald-500 animate-bounce">
              <ArrowDown className="w-4 h-4" />
            </div>
          )}
        </button>
      </div>
    </div>
  );
};

export default WorkflowGraph;
