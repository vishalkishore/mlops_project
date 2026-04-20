import React from "react";
import { AppFeature } from "../types";
import { ChevronDown, Layers, LayoutGrid, Sparkles } from "lucide-react";

interface FeatureSelectorProps {
  currentFeature: AppFeature;
  onSelect: (feature: AppFeature) => void;
}

const FeatureSelector: React.FC<FeatureSelectorProps> = ({
  currentFeature,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const features = [
    {
      id: AppFeature.IMAGE_ANALYSIS,
      label: "S.E.M.I Module",
      icon: LayoutGrid,
      desc: "Process and analyze static imagery",
    },
    {
      id: AppFeature.ADVANCED_GENERATOR,
      label: "Style Transfer Module",
      icon: Sparkles,
      desc: "Multi-modal reference pipeline",
    },
  ];

  const selected = features.find((f) => f.id === currentFeature) || features[0];

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 px-4 py-2 rounded-lg transition-all min-w-[260px] justify-between group"
      >
        <div className="flex items-center gap-3">
          <selected.icon className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-sm">{selected.label}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-[320px] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {features.map((feature) => (
            <button
              key={feature.id}
              onClick={() => {
                onSelect(feature.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-zinc-900 transition-colors ${
                currentFeature === feature.id
                  ? "bg-zinc-900/50 border-l-2 border-blue-500"
                  : "border-l-2 border-transparent"
              }`}
            >
              <div
                className={`mt-1 p-1.5 rounded-md ${
                  currentFeature === feature.id
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                <feature.icon className="w-4 h-4" />
              </div>
              <div>
                <div
                  className={`text-sm font-medium ${
                    currentFeature === feature.id
                      ? "text-white"
                      : "text-zinc-300"
                  }`}
                >
                  {feature.label}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{feature.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureSelector;
