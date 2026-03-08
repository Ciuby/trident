import { getFaceVertices, triangulateMeshFace } from "@web-hammer/geometry-kernel";
import { type EditableMesh, type GeometryNode, type Vec3 } from "@web-hammer/shared";
import { useEffect, useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import { NodeTransformGroup } from "@/viewport/components/NodeTransformGroup";
import { createIndexedGeometry } from "@/viewport/utils/geometry";

export function EditableMeshPreviewOverlay({
  mesh,
  node
}: {
  mesh: EditableMesh;
  node: GeometryNode;
}) {
  const geometry = useMemo(() => {
    const faceData = mesh.faces
      .map((face) => {
        const triangulated = triangulateMeshFace(mesh, face.id);

        if (!triangulated) {
          return undefined;
        }

        return {
          indices: triangulated.indices,
          positions: getFaceVertices(mesh, face.id).map((vertex) => vertex.position)
        };
      })
      .filter((face): face is { indices: number[]; positions: Vec3[] } => Boolean(face));

    if (faceData.length === 0) {
      return undefined;
    }

    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    faceData.forEach((face) => {
      face.positions.forEach((position) => {
        positions.push(position.x, position.y, position.z);
      });
      face.indices.forEach((index) => {
        indices.push(vertexOffset + index);
      });
      vertexOffset += face.positions.length;
    });

    const nextGeometry = createIndexedGeometry(positions, indices);
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [mesh]);
  const wireframeGeometry = useMemo(() => {
    const verticesById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position] as const));
    const segments: number[] = [];
    const seenEdges = new Set<string>();

    mesh.halfEdges.forEach((halfEdge) => {
      if (!halfEdge.next) {
        return;
      }

      const nextHalfEdge = mesh.halfEdges.find((candidate) => candidate.id === halfEdge.next);

      if (!nextHalfEdge) {
        return;
      }

      const start = verticesById.get(halfEdge.vertex);
      const end = verticesById.get(nextHalfEdge.vertex);

      if (!start || !end) {
        return;
      }

      const edgeKey = halfEdge.vertex < nextHalfEdge.vertex
        ? `${halfEdge.vertex}|${nextHalfEdge.vertex}`
        : `${nextHalfEdge.vertex}|${halfEdge.vertex}`;

      if (seenEdges.has(edgeKey)) {
        return;
      }

      seenEdges.add(edgeKey);
      segments.push(start.x, start.y, start.z, end.x, end.y, end.z);
    });

    if (segments.length === 0) {
      return undefined;
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute("position", new Float32BufferAttribute(segments, 3));
    return nextGeometry;
  }, [mesh]);

  useEffect(
    () => () => {
      // WebGPU can still reference transient preview geometry for a frame after
      // React has swapped it out. Avoid manual disposal on this hot path.
    },
    [geometry, wireframeGeometry]
  );

  if (!geometry) {
    return null;
  }

  return (
    <NodeTransformGroup transform={node.transform}>
      <mesh geometry={geometry} renderOrder={11}>
        <meshStandardMaterial
          color="#8b5cf6"
          depthWrite={false}
          emissive="#6d28d9"
          emissiveIntensity={0.24}
          opacity={0.48}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
          side={DoubleSide}
          transparent
        />
      </mesh>
      {wireframeGeometry ? (
        <lineSegments geometry={wireframeGeometry} renderOrder={12}>
          <lineBasicMaterial color="#f8fafc" depthWrite={false} opacity={0.95} toneMapped={false} transparent />
        </lineSegments>
      ) : null}
    </NodeTransformGroup>
  );
}
