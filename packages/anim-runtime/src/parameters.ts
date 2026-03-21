import type { CompiledAnimatorGraph } from "@ggez/anim-schema";

type RuntimeParameterValue = number | boolean;

export interface AnimatorParameterStore {
  readonly values: RuntimeParameterValue[];
  getIndex(name: string): number;
  getValue(index: number): RuntimeParameterValue | undefined;
  getValueByName(name: string): RuntimeParameterValue | undefined;
  setFloat(name: string, value: number): void;
  setInt(name: string, value: number): void;
  setBool(name: string, value: boolean): void;
  trigger(name: string): void;
  resetTriggers(): void;
}

export function createAnimatorParameterStore(graph: CompiledAnimatorGraph): AnimatorParameterStore {
  const values = graph.parameters.map((parameter) => {
    if (parameter.type === "bool" || parameter.type === "trigger") {
      return Boolean(parameter.defaultValue ?? false);
    }

    return Number(parameter.defaultValue ?? 0);
  });
  const nameToIndex = new Map(graph.parameters.map((parameter, index) => [parameter.name, index]));

  function requireIndex(name: string): number {
    const index = nameToIndex.get(name);
    if (index === undefined) {
      throw new Error(`Unknown animation parameter "${name}".`);
    }

    return index;
  }

  return {
    values,
    getIndex(name) {
      return requireIndex(name);
    },
    getValue(index) {
      return values[index];
    },
    getValueByName(name) {
      return values[requireIndex(name)];
    },
    setFloat(name, value) {
      values[requireIndex(name)] = value;
    },
    setInt(name, value) {
      values[requireIndex(name)] = Math.trunc(value);
    },
    setBool(name, value) {
      values[requireIndex(name)] = value;
    },
    trigger(name) {
      values[requireIndex(name)] = true;
    },
    resetTriggers() {
      graph.parameters.forEach((parameter, index) => {
        if (parameter.type === "trigger") {
          values[index] = false;
        }
      });
    }
  };
}
