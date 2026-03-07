import { Canvas, type RootState } from "@react-three/fiber";
import { WebGPURenderer } from "three/webgpu";
import {
  bevelEditableMeshEdge,
  convertBrushToEditableMesh,
  cutEditableMeshBetweenEdges,
  deleteEditableMeshFaces,
  extrudeEditableMeshEdge,
  extrudeEditableMeshFace,
  invertEditableMeshNormals,
  mergeEditableMeshFaces
} from "@web-hammer/geometry-kernel";
import {
  averageVec3,
  crossVec3,
  isBrushNode,
  isMeshNode,
  normalizeVec3,
  snapValue,
  toTuple,
  subVec3,
  vec3,
  type EditableMesh
} from "@web-hammer/shared";
import {
  createBrushEditHandles,
  createBrushExtrudeHandles,
  createMeshEditHandles,
  createMeshExtrudeHandles,
  extrudeBrushHandle
} from "@/viewport/editing";
import { BrushClipOverlay } from "@/viewport/components/BrushClipOverlay";
import { BrushCreatePreview } from "@/viewport/components/BrushCreatePreview";
import { ConstructionGrid } from "@/viewport/components/ConstructionGrid";
import { EditableMeshPreviewOverlay } from "@/viewport/components/EditableMeshPreviewOverlay";
import { BrushEditOverlay, MeshEditOverlay } from "@/viewport/components/EditOverlays";
import { EditorCameraRig } from "@/viewport/components/EditorCameraRig";
import { BrushExtrudeOverlay, ExtrudeAxisGuide, MeshExtrudeOverlay } from "@/viewport/components/ExtrudeOverlays";
import { ObjectTransformGizmo } from "@/viewport/components/ObjectTransformGizmo";
import { ScenePreview } from "@/viewport/components/ScenePreview";
import {
  buildBrushCreatePlacement,
  computeBrushCreateCenter,
  createBrushCreateBasis,
  createBrushCreateDragPlane,
  measureBrushCreateBase,
  projectPointerToPlane,
  projectPointerToThreePlane,
  resolveBrushCreateSurfaceHit
} from "@/viewport/utils/brush-create";
import {
  findMatchingMeshEdgePair,
  makeUndirectedPairKey,
  rejectVec3FromAxis,
  resolveExtrudeDirection,
  vec3LengthSquared
} from "@/viewport/utils/interaction";
import {
  createScreenRect,
  intersectsSelectionRect,
  projectLocalPointToScreen,
  rectContainsPoint
} from "@/viewport/utils/screen-space";
import { useEffect, useRef, useState, type PointerEventHandler } from "react";
import { Mesh, Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import type {
  BevelState,
  BrushCreateState,
  ExtrudeGestureState,
  MarqueeState,
  ViewportCanvasProps
} from "@/viewport/types";

export function ViewportCanvas({
  activeToolId,
  meshEditMode,
  onClearSelection,
  onCommitMeshTopology,
  onFocusNode,
  onPlaceAsset,
  onPlaceBrush,
  onPreviewBrushData,
  onPreviewMeshData,
  onPreviewNodeTransform,
  onSelectNodes,
  onSplitBrushAtCoordinate,
  onUpdateBrushData,
  onUpdateMeshData,
  onUpdateNodeTransform,
  renderScene,
  selectedNode,
  selectedNodeIds,
  transformMode,
  viewport
}: ViewportCanvasProps) {
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const brushClickOriginRef = useRef<Vector2 | null>(null);
  const marqueeOriginRef = useRef<Vector2 | null>(null);
  const pointerPositionRef = useRef<Vector2 | null>(null);
  const viewportRootRef = useRef<HTMLDivElement | null>(null);
  const meshObjectsRef = useRef(new Map<string, Mesh>());
  const raycasterRef = useRef(new Raycaster());
  const [brushEditHandleIds, setBrushEditHandleIds] = useState<string[]>([]);
  const [brushCreateState, setBrushCreateState] = useState<BrushCreateState | null>(null);
  const [bevelState, setBevelState] = useState<BevelState | null>(null);
  const [extrudeState, setExtrudeState] = useState<ExtrudeGestureState | null>(null);
  const [meshEditSelectionIds, setMeshEditSelectionIds] = useState<string[]>([]);
  const [transformDragging, setTransformDragging] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const extrudeStateRef = useRef<ExtrudeGestureState | null>(null);
  const previewBrushDataRef = useRef(onPreviewBrushData);
  const previewMeshDataRef = useRef(onPreviewMeshData);
  extrudeStateRef.current = extrudeState;
  previewBrushDataRef.current = onPreviewBrushData;
  previewMeshDataRef.current = onPreviewMeshData;

  useEffect(() => {
    const currentExtrudeState = extrudeStateRef.current;

    if (currentExtrudeState?.kind === "brush") {
      previewBrushDataRef.current(currentExtrudeState.nodeId, currentExtrudeState.baseBrush);
    } else if (currentExtrudeState?.kind === "mesh") {
      previewMeshDataRef.current(currentExtrudeState.nodeId, currentExtrudeState.baseMesh);
    }

    setMeshEditSelectionIds([]);
    setBrushEditHandleIds([]);
    setBevelState(null);
    setExtrudeState(null);
    setTransformDragging(false);
  }, [activeToolId, meshEditMode, selectedNode?.id, selectedNode?.kind]);

  useEffect(() => {
    if (activeToolId !== "brush") {
      setBrushCreateState(null);
    }
  }, [activeToolId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !brushCreateState) {
        return;
      }

      event.preventDefault();
      setBrushCreateState(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [brushCreateState]);

  const selectedBrushNode = selectedNode && isBrushNode(selectedNode) ? selectedNode : undefined;
  const selectedMeshNode = selectedNode && isMeshNode(selectedNode) ? selectedNode : undefined;
  const brushEditHandles =
    activeToolId === "mesh-edit" && selectedBrushNode
      ? createBrushEditHandles(selectedBrushNode.data, meshEditMode)
      : [];
  const meshEditHandles =
    activeToolId === "mesh-edit" && selectedMeshNode
      ? createMeshEditHandles(selectedMeshNode.data, meshEditMode)
      : [];
  const editableMeshSource =
    activeToolId === "mesh-edit" && selectedBrushNode
      ? convertBrushToEditableMesh(selectedBrushNode.data)
      : activeToolId === "mesh-edit" && selectedMeshNode
        ? selectedMeshNode.data
        : undefined;
  const editableMeshHandles =
    activeToolId === "mesh-edit" && editableMeshSource
      ? createMeshEditHandles(editableMeshSource, meshEditMode)
      : [];

  const resolveSelectedEditableMeshEdgePairs = () => {
    if (!editableMeshSource) {
      return [];
    }

    if (selectedMeshNode) {
      return editableMeshHandles
        .filter((handle) => meshEditSelectionIds.includes(handle.id))
        .map((handle) => handle.vertexIds as [string, string])
        .filter((vertexIds): vertexIds is [string, string] => vertexIds.length === 2);
    }

    return brushEditHandles
      .filter((handle) => brushEditHandleIds.includes(handle.id))
      .map((handle) => findMatchingMeshEdgePair(editableMeshHandles, handle))
      .filter((edge): edge is [string, string] => Boolean(edge));
  };

  const resolveSelectedEditableMeshFaceIds = () => {
    if (!editableMeshSource) {
      return [];
    }

    return selectedMeshNode ? meshEditSelectionIds : brushEditHandleIds;
  };

  const handleMeshObjectChange = (nodeId: string, object: Mesh | null) => {
    if (object) {
      meshObjectsRef.current.set(nodeId, object);
      return;
    }

    meshObjectsRef.current.delete(nodeId);
  };

  const clearSubobjectSelection = () => {
    setBrushEditHandleIds([]);
    setMeshEditSelectionIds([]);
  };

  const commitMeshTopology = (mesh: EditableMesh | undefined) => {
    if (!selectedNode || !mesh) {
      return;
    }

    onCommitMeshTopology(selectedNode.id, mesh);
    clearSubobjectSelection();
    setBevelState(null);
  };

  const startBevelOperation = () => {
    if (!editableMeshSource || !cameraRef.current || !selectedNode || !pointerPositionRef.current) {
      return;
    }

    const selectedEdges = resolveSelectedEditableMeshEdgePairs();

    if (selectedEdges.length !== 1) {
      return;
    }

    const bounds = viewportRootRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    const edgeHandle = editableMeshHandles.find(
      (handle) =>
        handle.vertexIds.length === 2 &&
        makeUndirectedPairKey(handle.vertexIds as [string, string]) === makeUndirectedPairKey(selectedEdges[0])
    );

    if (!edgeHandle?.points || edgeHandle.points.length !== 2) {
      return;
    }

    const midpoint = averageVec3(edgeHandle.points);
    const axis = normalizeVec3(subVec3(edgeHandle.points[1], edgeHandle.points[0]));
    const faceHandles = createMeshEditHandles(editableMeshSource, "face");
    const faceDirections = faceHandles
      .filter((handle) => selectedEdges[0].every((vertexId) => handle.vertexIds.includes(vertexId)))
      .map((handle) => rejectVec3FromAxis(subVec3(handle.position, midpoint), axis))
      .filter((direction) => vec3LengthSquared(direction) > 0.000001);
    const dragPlane = createBrushCreateDragPlane(cameraRef.current, axis, midpoint);
    const startPoint =
      projectPointerToThreePlane(
        pointerPositionRef.current.x + bounds.left,
        pointerPositionRef.current.y + bounds.top,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        dragPlane
      ) ?? new Vector3(midpoint.x, midpoint.y, midpoint.z);
    const averagedFaceDirection = normalizeVec3(averageVec3(faceDirections));
    const fallbackDirection = normalizeVec3(
      crossVec3(axis, vec3(dragPlane.normal.x, dragPlane.normal.y, dragPlane.normal.z))
    );

    setBevelState({
      baseMesh: structuredClone(editableMeshSource),
      dragDirection:
        vec3LengthSquared(averagedFaceDirection) > 0.000001 ? averagedFaceDirection : fallbackDirection,
      dragPlane,
      edge: selectedEdges[0],
      profile: "flat",
      previewMesh: structuredClone(editableMeshSource),
      startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
      steps: 1,
      width: 0
    });
  };

  const startExtrudeOperation = () => {
    if (!cameraRef.current || !selectedNode || !pointerPositionRef.current) {
      return;
    }

    const bounds = viewportRootRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    if (selectedBrushNode) {
      if (meshEditMode === "vertex" || brushEditHandleIds.length !== 1) {
        return;
      }

      const handle = createBrushExtrudeHandles(selectedBrushNode.data).find(
        (candidate) => candidate.id === brushEditHandleIds[0]
      );

      if (!handle?.normal) {
        return;
      }

      const anchor = resolveExtrudeAnchor(handle.position, handle.normal, handle.kind);
      const dragPlane = createBrushCreateDragPlane(cameraRef.current, handle.normal, anchor);
      const startPoint =
        projectPointerToThreePlane(
          pointerPositionRef.current.x + bounds.left,
          pointerPositionRef.current.y + bounds.top,
          bounds,
          cameraRef.current,
          raycasterRef.current,
          dragPlane
        ) ?? new Vector3(anchor.x, anchor.y, anchor.z);

      setExtrudeState({
        amount: 0,
        baseBrush: structuredClone(selectedBrushNode.data),
        dragPlane,
        handle: structuredClone(handle),
        kind: "brush",
        nodeId: selectedBrushNode.id,
        normal: vec3(handle.normal.x, handle.normal.y, handle.normal.z),
        previewBrush: structuredClone(selectedBrushNode.data),
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      });
      return;
    }

    if (selectedMeshNode) {
      if (meshEditSelectionIds.length !== 1) {
        return;
      }

      const handle = createMeshExtrudeHandles(selectedMeshNode.data).find(
        (candidate) => candidate.id === meshEditSelectionIds[0]
      );

      if (!handle) {
        return;
      }

      const anchor = resolveExtrudeAnchor(handle.position, handle.normal, handle.kind);
      const dragPlane = createBrushCreateDragPlane(cameraRef.current, handle.normal, anchor);
      const startPoint =
        projectPointerToThreePlane(
          pointerPositionRef.current.x + bounds.left,
          pointerPositionRef.current.y + bounds.top,
          bounds,
          cameraRef.current,
          raycasterRef.current,
          dragPlane
        ) ?? new Vector3(anchor.x, anchor.y, anchor.z);

      setExtrudeState({
        amount: 0,
        baseMesh: structuredClone(selectedMeshNode.data),
        dragPlane,
        handle: structuredClone(handle),
        kind: "mesh",
        nodeId: selectedMeshNode.id,
        normal: vec3(handle.normal.x, handle.normal.y, handle.normal.z),
        previewMesh: structuredClone(selectedMeshNode.data),
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      });
    }
  };

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!bevelState) {
        return;
      }

      event.preventDefault();
      setBevelState((current) =>
        current
          ? {
              ...current,
              previewMesh:
                bevelEditableMeshEdge(
                  current.baseMesh,
                  current.edge,
                  current.width,
                  Math.max(1, current.steps + (event.deltaY < 0 ? 1 : -1)),
                  current.profile
                ) ?? current.previewMesh,
              steps: Math.max(1, current.steps + (event.deltaY < 0 ? 1 : -1))
            }
          : current
      );
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [bevelState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeToolId !== "mesh-edit" || !selectedNode) {
        return;
      }

      if (extrudeState) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelExtrudePreview();
        } else if (event.key.toLowerCase() === "x") {
          event.preventDefault();
          updateExtrudeAxisLock("x");
        } else if (event.key.toLowerCase() === "y") {
          event.preventDefault();
          updateExtrudeAxisLock("y");
        } else if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          updateExtrudeAxisLock("z");
        }
        return;
      }

      if (bevelState) {
        if (event.key === "Escape") {
          event.preventDefault();
          setBevelState(null);
          setTransformDragging(false);
        } else if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          setBevelState((current) =>
            current
              ? {
                  ...current,
                  previewMesh:
                    bevelEditableMeshEdge(
                      current.baseMesh,
                      current.edge,
                      current.width,
                      current.steps,
                      current.profile === "flat" ? "round" : "flat"
                    ) ?? current.previewMesh,
                  profile: current.profile === "flat" ? "round" : "flat"
                }
              : current
          );
        }
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && meshEditMode === "face") {
        const selectedFaces = resolveSelectedEditableMeshFaceIds();

        if (selectedFaces.length > 0) {
          event.preventDefault();
          commitMeshTopology(deleteEditableMeshFaces(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
        }
        return;
      }

      if (event.key.toLowerCase() === "m" && meshEditMode === "face") {
        const selectedFaces = resolveSelectedEditableMeshFaceIds();

        if (selectedFaces.length > 1) {
          event.preventDefault();
          commitMeshTopology(mergeEditableMeshFaces(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
        }
        return;
      }

      if (event.key.toLowerCase() === "k" && meshEditMode === "edge") {
        const selectedEdges = resolveSelectedEditableMeshEdgePairs();

        if (selectedEdges.length === 2) {
          event.preventDefault();
          commitMeshTopology(cutEditableMeshBetweenEdges(editableMeshSource ?? emptyEditableMesh(), selectedEdges));
        }
        return;
      }

      if (event.key.toLowerCase() === "b" && meshEditMode === "edge") {
        event.preventDefault();
        startBevelOperation();
        return;
      }

      if (event.key.toLowerCase() === "x" && meshEditMode !== "vertex") {
        event.preventDefault();
        startExtrudeOperation();
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();

        if (meshEditMode === "face") {
          const selectedFaces = resolveSelectedEditableMeshFaceIds();

          if (selectedFaces.length > 0) {
            commitMeshTopology(invertEditableMeshNormals(editableMeshSource ?? emptyEditableMesh(), selectedFaces));
            return;
          }
        }

        commitMeshTopology(invertEditableMeshNormals(editableMeshSource ?? emptyEditableMesh()));
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeToolId,
    bevelState,
    brushEditHandleIds,
    editableMeshHandles,
    editableMeshSource,
    extrudeState,
    meshEditMode,
    meshEditSelectionIds,
    selectedMeshNode,
    selectedNode
  ]);

  const updateBevelPreview = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current || !bevelState) {
      return;
    }

    const point = projectPointerToThreePlane(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      bevelState.dragPlane
    );

    if (!point) {
      return;
    }

    const width =
      (point.x - bevelState.startPoint.x) * bevelState.dragDirection.x +
      (point.y - bevelState.startPoint.y) * bevelState.dragDirection.y +
      (point.z - bevelState.startPoint.z) * bevelState.dragDirection.z;

    setBevelState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const previewMesh =
        bevelEditableMeshEdge(
          currentState.baseMesh,
          currentState.edge,
          width,
          currentState.steps,
          currentState.profile
        ) ?? currentState.previewMesh;

      return {
        ...currentState,
        previewMesh,
        width
      };
    });
  };

  const commitBevelPreview = () => {
    if (!bevelState) {
      return;
    }

    if (Math.abs(bevelState.width) <= 0.0001) {
      setBevelState(null);
      setTransformDragging(false);
      return;
    }

    setBevelState(null);
    setTransformDragging(false);
    commitMeshTopology(bevelState.previewMesh);
  };

  function updateExtrudePreview(clientX: number, clientY: number, bounds: DOMRect) {
    if (!cameraRef.current || !extrudeState) {
      return;
    }

    const point = projectPointerToThreePlane(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      extrudeState.dragPlane
    );

    if (!point) {
      return;
    }

    const effectiveNormal = resolveExtrudeDirection(extrudeState);
    const extrusionNormal = new Vector3(
      effectiveNormal.x,
      effectiveNormal.y,
      effectiveNormal.z
    ).normalize();
    const amount = Math.max(
      0,
      Math.round(
        point
          .clone()
          .sub(new Vector3(extrudeState.startPoint.x, extrudeState.startPoint.y, extrudeState.startPoint.z))
          .dot(extrusionNormal) / viewport.grid.snapSize
      ) * viewport.grid.snapSize
    );

    setExtrudeState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      if (currentState.kind === "brush") {
        const previewBrush =
          extrudeBrushHandle(
            currentState.baseBrush,
            currentState.handle,
            amount,
            resolveExtrudeDirection(currentState)
          ) ?? currentState.baseBrush;
        onPreviewBrushData(currentState.nodeId, previewBrush);

        return {
          ...currentState,
          amount,
          previewBrush
        };
      }

      const previewMesh =
        currentState.handle.kind === "face"
          ? extrudeEditableMeshFace(currentState.baseMesh, currentState.handle.id, amount) ?? currentState.baseMesh
          : extrudeEditableMeshEdge(
              currentState.baseMesh,
              currentState.handle.vertexIds as [string, string],
              amount
            ) ?? currentState.baseMesh;
      onPreviewMeshData(currentState.nodeId, previewMesh);

      return {
        ...currentState,
        amount,
        previewMesh
      };
    });
  }

  function cancelExtrudePreview() {
    if (!extrudeState) {
      return;
    }

    if (extrudeState.kind === "brush") {
      onPreviewBrushData(extrudeState.nodeId, extrudeState.baseBrush);
    } else {
      onPreviewMeshData(extrudeState.nodeId, extrudeState.baseMesh);
    }

    setExtrudeState(null);
    setTransformDragging(false);
  }

  function commitExtrudePreview() {
    if (!extrudeState) {
      return;
    }

    if (extrudeState.amount <= 0.0001) {
      cancelExtrudePreview();
      return;
    }

    if (extrudeState.kind === "brush") {
      onUpdateBrushData(extrudeState.nodeId, extrudeState.previewBrush, extrudeState.baseBrush);
    } else {
      onUpdateMeshData(extrudeState.nodeId, extrudeState.previewMesh, extrudeState.baseMesh);
    }

    setExtrudeState(null);
    setTransformDragging(false);
  }

  function updateExtrudeAxisLock(axisLock?: "x" | "y" | "z") {
    if (!extrudeStateRef.current || !cameraRef.current) {
      return;
    }

    if (extrudeStateRef.current.handle.kind === "face") {
      return;
    }

    const bounds = viewportRootRef.current?.getBoundingClientRect();
    const pointer = pointerPositionRef.current;

    if (!bounds || !pointer) {
      setExtrudeState((currentState) =>
        currentState
          ? {
              ...currentState,
              axisLock
            }
          : currentState
      );
      return;
    }

    setExtrudeState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const nextState = {
        ...currentState,
        axisLock
      };
      const nextDirection = resolveExtrudeDirection(nextState);
      const nextDragPlane = createBrushCreateDragPlane(
        cameraRef.current!,
        nextDirection,
        resolveExtrudeAnchor(nextState.handle.position, nextDirection, nextState.handle.kind)
      );
      const point = projectPointerToThreePlane(
        pointer.x + bounds.left,
        pointer.y + bounds.top,
        bounds,
        cameraRef.current!,
        raycasterRef.current,
        nextDragPlane
      );

      if (!point) {
        return {
          ...nextState,
          dragPlane: nextDragPlane
        };
      }

      const directionVector = new Vector3(nextDirection.x, nextDirection.y, nextDirection.z).normalize();
      const startPoint = point.clone().sub(directionVector.multiplyScalar(nextState.amount));

      return {
        ...nextState,
        dragPlane: nextDragPlane,
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z)
      };
    });

    updateExtrudePreview(pointer.x + bounds.left, pointer.y + bounds.top, bounds);
  }

  const updateBrushCreatePreview = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current || !brushCreateState) {
      return;
    }

    if (brushCreateState.stage === "base") {
      const point = projectPointerToPlane(
        clientX,
        clientY,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        brushCreateState.anchor,
        brushCreateState.basis.normal
      );

      if (!point) {
        return;
      }

      setBrushCreateState((currentState) =>
        currentState?.stage === "base"
          ? {
              ...currentState,
              currentPoint: point
            }
          : currentState
      );
      return;
    }

    const point = projectPointerToThreePlane(
      clientX,
      clientY,
      bounds,
      cameraRef.current,
      raycasterRef.current,
      brushCreateState.dragPlane
    );

    if (!point) {
      return;
    }

    const normal = new Vector3(
      brushCreateState.basis.normal.x,
      brushCreateState.basis.normal.y,
      brushCreateState.basis.normal.z
    );
    const startPoint = new Vector3(
      brushCreateState.startPoint.x,
      brushCreateState.startPoint.y,
      brushCreateState.startPoint.z
    );
    const nextHeight = snapValue(point.clone().sub(startPoint).dot(normal), viewport.grid.snapSize);

    setBrushCreateState((currentState) =>
      currentState?.stage === "height" && currentState.height !== nextHeight
        ? {
            ...currentState,
            height: nextHeight
          }
        : currentState
    );
  };

  const handleBrushCreateClick = (clientX: number, clientY: number, bounds: DOMRect) => {
    if (!cameraRef.current) {
      return;
    }

    if (!brushCreateState) {
      const hit = resolveBrushCreateSurfaceHit(
        clientX,
        clientY,
        bounds,
        cameraRef.current,
        raycasterRef.current,
        meshObjectsRef.current,
        viewport.grid.elevation
      );

      if (!hit) {
        return;
      }

      setBrushCreateState({
        anchor: hit.point,
        basis: createBrushCreateBasis(hit.normal),
        currentPoint: hit.point,
        stage: "base"
      });
      return;
    }

    if (brushCreateState.stage === "base") {
      const point =
        projectPointerToPlane(
          clientX,
          clientY,
          bounds,
          cameraRef.current,
          raycasterRef.current,
          brushCreateState.anchor,
          brushCreateState.basis.normal
        ) ?? brushCreateState.currentPoint;
      const { depth, width } = measureBrushCreateBase(
        brushCreateState.anchor,
        brushCreateState.basis,
        point,
        viewport.grid.snapSize
      );

      if (Math.abs(width) <= viewport.grid.snapSize * 0.5 || Math.abs(depth) <= viewport.grid.snapSize * 0.5) {
        return;
      }

      const center = computeBrushCreateCenter(brushCreateState.anchor, brushCreateState.basis, width, depth, 0);
      const dragPlane = createBrushCreateDragPlane(cameraRef.current, brushCreateState.basis.normal, center);
      const startPoint =
        projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, dragPlane) ??
        new Vector3(center.x, center.y, center.z);

      setBrushCreateState({
        ...brushCreateState,
        depth,
        dragPlane,
        height: 0,
        stage: "height",
        startPoint: vec3(startPoint.x, startPoint.y, startPoint.z),
        width
      });
      return;
    }

    const point =
      projectPointerToThreePlane(clientX, clientY, bounds, cameraRef.current, raycasterRef.current, brushCreateState.dragPlane) ??
      new Vector3(brushCreateState.startPoint.x, brushCreateState.startPoint.y, brushCreateState.startPoint.z);
    const height = snapValue(
      point
        .clone()
        .sub(new Vector3(brushCreateState.startPoint.x, brushCreateState.startPoint.y, brushCreateState.startPoint.z))
        .dot(new Vector3(brushCreateState.basis.normal.x, brushCreateState.basis.normal.y, brushCreateState.basis.normal.z)),
      viewport.grid.snapSize
    );
    const placement = buildBrushCreatePlacement({
      ...brushCreateState,
      height
    });

    if (!placement) {
      return;
    }

    onPlaceBrush(placement.brush, placement.transform);
    setBrushCreateState(null);
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

    if (extrudeState || bevelState) {
      return;
    }

    if (activeToolId === "brush" && event.button === 0 && !event.shiftKey) {
      brushClickOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
      return;
    }

    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    marqueeOriginRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

    if (extrudeState) {
      updateExtrudePreview(event.clientX, event.clientY, bounds);
      return;
    }

    if (bevelState) {
      updateBevelPreview(event.clientX, event.clientY, bounds);
      return;
    }

    if (activeToolId === "brush") {
      if (brushCreateState) {
        updateBrushCreatePreview(event.clientX, event.clientY, bounds);
      }
      return;
    }

    if (!marqueeOriginRef.current) {
      return;
    }

    const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    const origin = marqueeOriginRef.current;

    if (!marquee && point.distanceTo(origin) < 4) {
      return;
    }

    setMarquee({
      active: true,
      current: point,
      origin
    });
  };

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerPositionRef.current = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

    if (extrudeState) {
      if (event.button === 0) {
        commitExtrudePreview();
      }
      return;
    }

    if (bevelState) {
      if (event.button === 0) {
        commitBevelPreview();
      }
      return;
    }

    if (activeToolId === "brush") {
      const origin = brushClickOriginRef.current;
      brushClickOriginRef.current = null;

      if (!origin) {
        return;
      }

      const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);

      if (point.distanceTo(origin) > 4) {
        return;
      }

      handleBrushCreateClick(event.clientX, event.clientY, bounds);
      return;
    }

    if (!marqueeOriginRef.current) {
      return;
    }

    const origin = marqueeOriginRef.current;
    marqueeOriginRef.current = null;

    if (!marquee) {
      return;
    }

    const point = new Vector2(event.clientX - bounds.left, event.clientY - bounds.top);
    const finalMarquee = {
      ...marquee,
      current: point,
      origin
    };

    setMarquee(null);

    if (!cameraRef.current) {
      return;
    }

    const selectionRect = createScreenRect(finalMarquee.origin, finalMarquee.current);

    if (selectionRect.width < 4 && selectionRect.height < 4) {
      return;
    }

    if (activeToolId === "mesh-edit" && selectedNode) {
      const handleSelections = (selectedBrushNode ? brushEditHandles : meshEditHandles)
        .filter((handle) =>
          rectContainsPoint(
            selectionRect,
            projectLocalPointToScreen(handle.position, selectedNode, cameraRef.current!, bounds)
          )
        )
        .map((handle) => handle.id);

      if (handleSelections.length > 0) {
        if (selectedBrushNode) {
          setBrushEditHandleIds(handleSelections);
        } else {
          setMeshEditSelectionIds(handleSelections);
        }
        return;
      }
    }

    const selectedIds = Array.from(meshObjectsRef.current.entries())
      .filter(([, object]) => intersectsSelectionRect(object, cameraRef.current!, bounds, selectionRect))
      .map(([nodeId]) => nodeId);

    if (selectedIds.length > 0) {
      onSelectNodes(selectedIds);
      return;
    }

    onClearSelection();
  };

  const marqueeRect = marquee ? createScreenRect(marquee.origin, marquee.current) : undefined;

  return (
    <div
      className="relative size-full overflow-hidden"
      ref={viewportRootRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <Canvas
        camera={{
          far: viewport.camera.far,
          fov: viewport.camera.fov,
          near: viewport.camera.near,
          position: toTuple(viewport.camera.position)
        }}
        gl={async (props) => {
          const renderer = new WebGPURenderer(props as ConstructorParameters<typeof WebGPURenderer>[0]);
          await renderer.init();
          return renderer;
        }}
        onCreated={(state: RootState) => {
          cameraRef.current = state.camera as PerspectiveCamera;
        }}
        onPointerMissed={() => {
          if (activeToolId === "brush" || extrudeState || bevelState || marqueeOriginRef.current || marquee) {
            return;
          }

          if (activeToolId === "mesh-edit" && (meshEditSelectionIds.length > 0 || brushEditHandleIds.length > 0)) {
            setMeshEditSelectionIds([]);
            setBrushEditHandleIds([]);
            return;
          }

          onClearSelection();
        }}
        shadows
      >
        <color attach="background" args={["#0b1118"]} />
        <fog attach="fog" args={["#0b1118", 45, 180]} />
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#9ec5f8", "#0f1721", 0.7]} />
        <directionalLight
          castShadow
          intensity={1.4}
          position={[18, 26, 12]}
          shadow-bias={-0.0002}
          shadow-mapSize-height={2048}
          shadow-mapSize-width={2048}
          shadow-normalBias={0.045}
        />
        <EditorCameraRig
          controlsEnabled={!marquee && !transformDragging && !brushCreateState && !bevelState && !extrudeState}
          viewport={viewport}
        />
        <ConstructionGrid activeToolId={activeToolId} onPlaceAsset={onPlaceAsset} viewport={viewport} />
        <axesHelper args={[3]} />
        <ScenePreview
          hiddenNodeIds={bevelState && selectedNode ? [selectedNode.id] : []}
          interactive={activeToolId !== "brush"}
          onFocusNode={onFocusNode}
          onMeshObjectChange={handleMeshObjectChange}
          onSelectNode={onSelectNodes}
          renderScene={renderScene}
          selectedNodeIds={selectedNodeIds}
        />
        {bevelState && selectedNode ? <EditableMeshPreviewOverlay mesh={bevelState.previewMesh} node={selectedNode} /> : null}
        {extrudeState && selectedNode ? (
          <ExtrudeAxisGuide node={selectedNode} state={extrudeState} viewport={viewport} />
        ) : null}
        {activeToolId === "brush" && brushCreateState ? (
          <BrushCreatePreview snapSize={viewport.grid.snapSize} state={brushCreateState} />
        ) : null}
        {activeToolId === "clip" && selectedBrushNode ? (
          <BrushClipOverlay
            node={selectedBrushNode}
            onSplitBrushAtCoordinate={onSplitBrushAtCoordinate}
            viewport={viewport}
          />
        ) : null}
        {activeToolId === "extrude" && selectedBrushNode ? (
          <BrushExtrudeOverlay
            node={selectedBrushNode}
            onPreviewBrushData={onPreviewBrushData}
            onUpdateBrushData={onUpdateBrushData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {activeToolId === "extrude" && selectedMeshNode ? (
          <MeshExtrudeOverlay
            node={selectedMeshNode}
            onPreviewMeshData={onPreviewMeshData}
            onUpdateMeshData={onUpdateMeshData}
            setTransformDragging={setTransformDragging}
            viewport={viewport}
          />
        ) : null}
        {activeToolId === "mesh-edit" && selectedBrushNode && !bevelState && !extrudeState ? (
          <BrushEditOverlay
            handles={brushEditHandles}
            meshEditMode={meshEditMode}
            node={selectedBrushNode}
            onPreviewBrushData={onPreviewBrushData}
            onUpdateBrushData={onUpdateBrushData}
            selectedHandleIds={brushEditHandleIds}
            setSelectedHandleIds={setBrushEditHandleIds}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
        {activeToolId === "mesh-edit" && selectedMeshNode && !bevelState && !extrudeState ? (
          <MeshEditOverlay
            handles={meshEditHandles}
            meshEditMode={meshEditMode}
            node={selectedMeshNode}
            onPreviewMeshData={onPreviewMeshData}
            onUpdateMeshData={onUpdateMeshData}
            selectedHandleIds={meshEditSelectionIds}
            setSelectedHandleIds={setMeshEditSelectionIds}
            transformMode={transformMode}
            viewport={viewport}
          />
        ) : null}
        <ObjectTransformGizmo
          activeToolId={activeToolId}
          onPreviewNodeTransform={onPreviewNodeTransform}
          onUpdateNodeTransform={onUpdateNodeTransform}
          selectedNodeIds={selectedNodeIds}
          transformMode={transformMode}
          viewport={viewport}
        />
      </Canvas>

      {bevelState || extrudeState ? <div className="pointer-events-none absolute inset-0 z-20 cursor-crosshair" /> : null}

      {marqueeRect ? (
        <div
          className="pointer-events-none absolute rounded-sm bg-emerald-400/12 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.75)]"
          style={{
            height: marqueeRect.height,
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width
          }}
        />
      ) : null}
    </div>
  );
}

function emptyEditableMesh(): EditableMesh {
  return { faces: [], halfEdges: [], vertices: [] };
}

function resolveExtrudeAnchor(
  position: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  kind: "edge" | "face"
) {
  const distance = kind === "face" ? 0.42 : 0.3;

  return vec3(
    position.x + normal.x * distance,
    position.y + normal.y * distance,
    position.z + normal.z * distance
  );
}