"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { memo } from "react";

function GraphFadeEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    data,
    markerEnd,
    selected,
  } = props;
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = data as
    | { hoverOpacity?: number; edgeOpacity?: number }
    | undefined;
  const explicit =
    typeof d?.edgeOpacity === "number" ? d.edgeOpacity : undefined;
  const hover = typeof d?.hoverOpacity === "number" ? d.hoverOpacity : undefined;
  let baseOpacity = selected ? 0.5 : 0.14;
  if (explicit !== undefined) {
    baseOpacity = explicit;
  }
  if (hover !== undefined) {
    baseOpacity = hover;
  }
  const stroke =
    (style as { stroke?: string } | undefined)?.stroke ?? "#71717a";

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke,
        strokeWidth: selected ? 1.5 : 1,
        opacity: baseOpacity,
        transition: "opacity 0.2s ease, stroke-width 0.15s ease",
      }}
      interactionWidth={16}
    />
  );
}

export const GraphFadeEdge = memo(GraphFadeEdgeInner);
