import type { Entity, GeometryNode, GroupNode, Vec3 } from "@web-hammer/shared";
import { addVec3, localizeTransform, makeTransform, resolveSceneGraph, vec3 } from "@web-hammer/shared";
import type { Command } from "../command-stack";
import type { SceneDocument } from "../../document/scene-document";
import {
  collectDescendantEntityIds,
  collectDescendantNodeIds,
  createDuplicateEntityId,
  createDuplicateNodeId,
  resolveTopLevelSelectionIds
} from "./helpers";

export function createDuplicateNodesCommand(
  scene: SceneDocument,
  nodeIds: string[],
  offset: Vec3
): {
  command: Command;
  duplicateIds: string[];
} {
  const topLevelIds = resolveTopLevelSelectionIds(scene, nodeIds);
  const duplicateNodes: GeometryNode[] = [];
  const duplicateEntities: Entity[] = [];
  const duplicateRootIds: string[] = [];
  const nodeIdMap = new Map<string, string>();
  const topLevelIdSet = new Set(topLevelIds);

  const cloneNodeSubtree = (sourceNodeId: string) => {
    const sourceNode = scene.getNode(sourceNodeId);

    if (!sourceNode) {
      return;
    }

    const duplicateId = createDuplicateNodeId(scene, sourceNode.id);
    const duplicate = structuredClone(sourceNode);
    duplicate.id = duplicateId;
    duplicate.parentId = sourceNode.parentId ? nodeIdMap.get(sourceNode.parentId) ?? sourceNode.parentId : undefined;

    if (topLevelIdSet.has(sourceNodeId)) {
      duplicate.name = `${sourceNode.name} Copy`;
      duplicate.transform.position = addVec3(sourceNode.transform.position, offset);
      duplicateRootIds.push(duplicate.id);
    }

    nodeIdMap.set(sourceNode.id, duplicate.id);
    duplicateNodes.push(duplicate);

    Array.from(scene.nodes.values())
      .filter((node) => node.parentId === sourceNode.id)
      .forEach((child) => {
        cloneNodeSubtree(child.id);
      });

    Array.from(scene.entities.values())
      .filter((entity) => entity.parentId === sourceNode.id)
      .forEach((entity) => {
        const duplicateEntity = structuredClone(entity);
        duplicateEntity.id = createDuplicateEntityId(scene, entity.id);
        duplicateEntity.parentId = duplicate.id;

        if (topLevelIdSet.has(entity.id)) {
          duplicateEntity.name = `${entity.name} Copy`;
          duplicateEntity.transform.position = addVec3(entity.transform.position, offset);
          duplicateRootIds.push(duplicateEntity.id);
        }

        duplicateEntities.push(duplicateEntity);
      });
  };

  topLevelIds.forEach((id) => {
    const node = scene.getNode(id);

    if (node) {
      cloneNodeSubtree(node.id);
      return;
    }

    const entity = scene.getEntity(id);

    if (!entity) {
      return;
    }

    const duplicate = structuredClone(entity);
    duplicate.id = createDuplicateEntityId(scene, entity.id);
    duplicate.name = `${entity.name} Copy`;
    duplicate.transform.position = addVec3(entity.transform.position, offset);
    duplicate.parentId = entity.parentId ? nodeIdMap.get(entity.parentId) ?? entity.parentId : undefined;
    duplicateEntities.push(duplicate);
    duplicateRootIds.push(duplicate.id);
  });

  return {
    command: {
      label: "duplicate selection",
      execute(nextScene) {
        duplicateNodes.forEach((duplicate) => {
          nextScene.addNode(structuredClone(duplicate));
        });
        duplicateEntities.forEach((duplicate) => {
          nextScene.addEntity(structuredClone(duplicate));
        });
      },
      undo(nextScene) {
        duplicateEntities.forEach((duplicate) => {
          nextScene.removeEntity(duplicate.id);
        });
        duplicateNodes.forEach((duplicate) => {
          nextScene.removeNode(duplicate.id);
        });
      }
    },
    duplicateIds: duplicateRootIds
  };
}

export function createDeleteSelectionCommand(scene: SceneDocument, ids: string[]): Command {
  const topLevelIds = resolveTopLevelSelectionIds(scene, ids);
  const descendantNodeIds = new Set<string>();
  const descendantEntityIds = new Set<string>();

  topLevelIds.forEach((id) => {
    const node = scene.getNode(id);

    if (!node) {
      return;
    }

    collectDescendantNodeIds(scene, node.id).forEach((descendantId) => {
      descendantNodeIds.add(descendantId);
    });
    collectDescendantEntityIds(scene, node.id).forEach((descendantId) => {
      descendantEntityIds.add(descendantId);
    });
  });

  const nodes = Array.from(new Set([...topLevelIds, ...descendantNodeIds]))
    .map((id) => scene.getNode(id))
    .filter((node): node is GeometryNode => Boolean(node))
    .map((node) => structuredClone(node));
  const entities = Array.from(new Set([...topLevelIds, ...descendantEntityIds]))
    .map((id) => scene.getEntity(id))
    .filter((entity): entity is Entity => Boolean(entity))
    .map((entity) => structuredClone(entity));

  return {
    label: "delete selection",
    execute(nextScene) {
      nodes.forEach((node) => {
        nextScene.removeNode(node.id);
      });
      entities.forEach((entity) => {
        nextScene.removeEntity(entity.id);
      });
    },
    undo(nextScene) {
      nodes.forEach((node) => {
        nextScene.addNode(structuredClone(node));
      });
      entities.forEach((entity) => {
        nextScene.addEntity(structuredClone(entity));
      });
    }
  };
}

export function createGroupSelectionCommand(
  scene: SceneDocument,
  ids: string[]
): {
  command: Command;
  groupId: string;
} | undefined {
  const topLevelIds = resolveTopLevelSelectionIds(scene, ids);

  if (topLevelIds.length === 0) {
    return undefined;
  }

  const sceneGraph = resolveSceneGraph(scene.nodes.values(), scene.entities.values());
  const groupId = createDuplicateNodeId(scene, "node:group");
  const groupParentId = resolveSharedParentId(scene, topLevelIds);
  const topLevelWorldTransforms = topLevelIds
    .map((id) => {
      const node = scene.getNode(id);

      if (node) {
        return sceneGraph.nodeWorldTransforms.get(node.id);
      }

      const entity = scene.getEntity(id);
      return entity ? sceneGraph.entityWorldTransforms.get(entity.id) : undefined;
    })
    .filter((transform): transform is NonNullable<typeof transform> => Boolean(transform));

  if (topLevelWorldTransforms.length === 0) {
    return undefined;
  }

  const groupWorldTransform = makeTransform(
    vec3(
      topLevelWorldTransforms.reduce((sum, transform) => sum + transform.position.x, 0) / topLevelWorldTransforms.length,
      topLevelWorldTransforms.reduce((sum, transform) => sum + transform.position.y, 0) / topLevelWorldTransforms.length,
      topLevelWorldTransforms.reduce((sum, transform) => sum + transform.position.z, 0) / topLevelWorldTransforms.length
    )
  );
  const parentWorldTransform = groupParentId ? sceneGraph.nodeWorldTransforms.get(groupParentId) : undefined;
  const groupNode: GroupNode = {
    data: {},
    id: groupId,
    kind: "group",
    name: "Group",
    parentId: groupParentId,
    transform: localizeTransform(groupWorldTransform, parentWorldTransform)
  };
  const nextNodes = topLevelIds
    .map((id) => scene.getNode(id))
    .filter((node): node is GeometryNode => Boolean(node))
    .map((node) => ({
      before: structuredClone(node),
      next: {
        ...structuredClone(node),
        parentId: groupId,
        transform: localizeTransform(sceneGraph.nodeWorldTransforms.get(node.id) ?? node.transform, groupWorldTransform)
      }
    }));
  const nextEntities = topLevelIds
    .map((id) => scene.getEntity(id))
    .filter((entity): entity is Entity => Boolean(entity))
    .map((entity) => ({
      before: structuredClone(entity),
      next: {
        ...structuredClone(entity),
        parentId: groupId,
        transform: localizeTransform(sceneGraph.entityWorldTransforms.get(entity.id) ?? entity.transform, groupWorldTransform)
      }
    }));

  return {
    command: {
      label: "group selection",
      execute(nextScene) {
        nextScene.addNode(structuredClone(groupNode));
        nextNodes.forEach((snapshot) => {
          nextScene.nodes.set(snapshot.next.id, structuredClone(snapshot.next));
        });
        nextEntities.forEach((snapshot) => {
          nextScene.entities.set(snapshot.next.id, structuredClone(snapshot.next));
        });
        nextScene.touch();
      },
      undo(nextScene) {
        nextNodes.forEach((snapshot) => {
          nextScene.nodes.set(snapshot.before.id, structuredClone(snapshot.before));
        });
        nextEntities.forEach((snapshot) => {
          nextScene.entities.set(snapshot.before.id, structuredClone(snapshot.before));
        });
        nextScene.removeNode(groupNode.id);
        nextScene.touch();
      }
    },
    groupId
  };
}

export function createReplaceNodesCommand(
  scene: SceneDocument,
  nextNodes: GeometryNode[],
  label = "replace nodes"
): Command {
  const snapshots = nextNodes
    .map((nextNode) => {
      const before = scene.getNode(nextNode.id);

      if (!before) {
        return undefined;
      }

      return {
        before: structuredClone(before),
        next: structuredClone(nextNode)
      };
    })
    .filter((snapshot): snapshot is { before: GeometryNode; next: GeometryNode } => Boolean(snapshot));

  return {
    label,
    execute(nextScene) {
      snapshots.forEach((snapshot) => {
        nextScene.nodes.set(snapshot.next.id, structuredClone(snapshot.next));
        nextScene.touch();
      });
    },
    undo(nextScene) {
      snapshots.forEach((snapshot) => {
        nextScene.nodes.set(snapshot.before.id, structuredClone(snapshot.before));
        nextScene.touch();
      });
    }
  };
}

function resolveSharedParentId(scene: SceneDocument, ids: string[]) {
  const parentIds = ids.map((id) => {
    const node = scene.getNode(id);

    if (node) {
      return node.parentId;
    }

    return scene.getEntity(id)?.parentId;
  });
  const [firstParentId, ...rest] = parentIds;

  return rest.every((parentId) => parentId === firstParentId) ? firstParentId : undefined;
}
